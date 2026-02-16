// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, inject, unmanaged } from '@theia/core/shared/inversify';
import { DialogProps } from '@theia/core/lib/browser/dialogs';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { Message } from '@theia/core/lib/browser/widgets';
import type { OzwResourceInfo } from '../services/ozw-resource-provider';

const EMPTY_OZW_JSON = '{\n  "version": "1.0",\n  "components": [],\n  "schema": { "tree": [], "metadata": {} }\n}\n';

export interface OzwResourcePickerResult {
    resourceId: string;
    label: string;
    route: string;
}

@injectable()
export class OzwResourcePickerDialog extends ReactDialog<OzwResourcePickerResult | undefined> {

    protected workspaceRoot: URI | undefined;
    protected resources: OzwResourceInfo[] = [];
    protected filteredResources: OzwResourceInfo[] = [];
    protected searchQuery = '';
    protected selectedRelativePath: string | null = null;
    protected createNewName = '';
    protected mode: 'list' | 'create' = 'list';
    protected creating = false;

    constructor(
        @unmanaged() props: DialogProps,
        @inject(FileService) protected readonly fileService: FileService
    ) {
        super(props);
        this.appendAcceptButton('Vincular');
        this.appendCloseButton('Cancelar');
    }

    get value(): OzwResourcePickerResult | undefined {
        if (this.mode === 'create' && this.createNewName.trim()) {
            const name = this.createNewName.trim().replace(/\.ozw$/i, '');
            const relativePath = `views/${name}.ozw`;
            const route = `/app/${name.toLowerCase().replace(/\s+/g, '-')}`;
            return { resourceId: relativePath, label: name, route };
        }
        const item = this.resources.find(r => r.relativePath === this.selectedRelativePath);
        if (item) {
            const route = this.resourceIdToRoute(item.relativePath);
            return { resourceId: item.relativePath, label: item.displayName, route };
        }
        return undefined;
    }

    /** Call before open() to load the list of .ozw files. */
    setContext(workspaceRoot: URI, resources: OzwResourceInfo[]): void {
        this.workspaceRoot = workspaceRoot;
        this.resources = resources;
        this.filteredResources = resources;
        this.searchQuery = '';
        this.selectedRelativePath = resources.length > 0 ? resources[0].relativePath : null;
        this.createNewName = '';
        this.mode = 'list';
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected resourceIdToRoute(resourceId: string): string {
        const withoutExt = resourceId.replace(/\.ozw$/i, '');
        return '/app/' + withoutExt.replace(/\\/g, '/').split('/').map(s => s.toLowerCase().replace(/\s+/g, '-')).join('/');
    }

    protected override isValid(value: OzwResourcePickerResult | undefined, _mode: string): string {
        if (value === undefined) {
            return 'Selecciona un archivo OZW o crea uno nuevo';
        }
        return '';
    }

    protected render(): React.ReactNode {
        const hasSelection = this.mode === 'list' && this.selectedRelativePath !== null;
        const hasCreate = this.mode === 'create' && this.createNewName.trim().length > 0;
        if (this.acceptButton) {
            this.acceptButton.disabled = !hasSelection && !hasCreate;
        }

        return (
            <div className='ozw-resource-picker-dialog'>
                <div className='ozw-resource-picker-search'>
                    <input
                        type='text'
                        className='theia-input'
                        placeholder='Buscar vista...'
                        value={this.searchQuery}
                        onChange={e => {
                            this.searchQuery = e.target.value;
                            const q = this.searchQuery.toLowerCase().trim();
                            this.filteredResources = q
                                ? this.resources.filter(r =>
                                    r.relativePath.toLowerCase().includes(q) ||
                                    r.displayName.toLowerCase().includes(q))
                                : this.resources;
                            this.update();
                        }}
                    />
                </div>
                {this.mode === 'list' ? (
                    <>
                        <div className='ozw-resource-picker-list'>
                            {this.filteredResources.length === 0 ? (
                                <div className='ozw-resource-picker-empty'>
                                    {this.resources.length === 0
                                        ? 'No hay archivos .ozw en el workspace'
                                        : 'Sin resultados para la búsqueda'}
                                </div>
                            ) : (
                                this.filteredResources.map(res => (
                                    <div
                                        key={res.relativePath}
                                        className={`ozw-resource-picker-item ${this.selectedRelativePath === res.relativePath ? 'selected' : ''}`}
                                        onClick={() => {
                                            this.selectedRelativePath = res.relativePath;
                                            this.update();
                                        }}
                                    >
                                        <span className='ozw-resource-picker-item-label'>{res.displayName}</span>
                                        <span className='ozw-resource-picker-item-path'>{res.relativePath}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className='ozw-resource-picker-actions'>
                            <button
                                type='button'
                                className='theia-button secondary'
                                onClick={() => {
                                    this.mode = 'create';
                                    this.update();
                                }}
                            >
                                + Crear nueva vista .ozw
                            </button>
                        </div>
                    </>
                ) : (
                    <div className='ozw-resource-picker-create'>
                        <label>Nombre de la vista (se creará views/Nombre.ozw)</label>
                        <input
                            type='text'
                            className='theia-input'
                            placeholder='ej. clientes'
                            value={this.createNewName}
                            onChange={e => {
                                this.createNewName = e.target.value;
                                this.update();
                            }}
                        />
                        <div className='ozw-resource-picker-create-actions'>
                            <button
                                type='button'
                                className='theia-button secondary'
                                onClick={() => {
                                    this.mode = 'list';
                                    this.createNewName = '';
                                    this.update();
                                }}
                            >
                                Volver
                            </button>
                            <button
                                type='button'
                                className='theia-button'
                                disabled={!this.createNewName.trim() || this.creating}
                                onClick={async () => {
                                    const name = this.createNewName.trim().replace(/\.ozw$/i, '');
                                    if (!name || !this.workspaceRoot) { return; }
                                    this.creating = true;
                                    this.update();
                                    try {
                                        const viewsDir = this.workspaceRoot.resolve('views');
                                        const fileUri = viewsDir.resolve(`${name}.ozw`);
                                        try {
                                            await this.fileService.resolve(viewsDir);
                                        } catch {
                                            await this.fileService.createFolder(viewsDir);
                                        }
                                        await this.fileService.write(fileUri, EMPTY_OZW_JSON);
                                        const relativePath = `views/${name}.ozw`;
                                        this.resources = [...this.resources, {
                                            relativePath,
                                            uri: fileUri,
                                            displayName: name
                                        }];
                                        this.resources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
                                        this.selectedRelativePath = relativePath;
                                        this.mode = 'list';
                                        this.createNewName = '';
                                    } finally {
                                        this.creating = false;
                                        this.update();
                                    }
                                }}
                            >
                                {this.creating ? 'Creando…' : 'Crear y vincular'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
