// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import URI from '@theia/core/lib/common/uri';
import { OpenerService, open as openUri } from '@theia/core/lib/browser/opener-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { BlueprintSelectionService } from './services/blueprint-selection-service';
import { BlueprintEditorRefService } from './services/blueprint-editor-ref-service';
import type { BlueprintNode } from '../domain/entities/blueprint-types';

@injectable()
export class BlueprintInspectorWidget extends BaseWidget {

    static readonly ID = 'blueprint-inspector';
    static readonly LABEL = 'Blueprint Inspector';

    private root: Root | undefined;

    @inject(BlueprintSelectionService)
    protected readonly selectionService: BlueprintSelectionService;

    @inject(BlueprintEditorRefService)
    protected readonly editorRefService: BlueprintEditorRefService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.id = BlueprintInspectorWidget.ID;
        this.title.label = BlueprintInspectorWidget.LABEL;
        this.title.caption = BlueprintInspectorWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-cog';
        this.addClass('blueprint-inspector-widget');
        this.node.tabIndex = 0;
        this.toDispose.push(this.selectionService.onDidChange(() => {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[BlueprintInspector] onDidChange → update()');
            }
            this.update();
        }));
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.root) {
            this.root = createRoot(this.node);
        }
        this.root.render(<React.Fragment>{this.render()}</React.Fragment>);
    }

    override dispose(): void {
        if (this.root) {
            this.root.unmount();
            this.root = undefined;
        }
        super.dispose();
    }

    protected render(): React.ReactNode {
        const node = this.selectionService.selectedNode;
        const state = this.selectionService.state;
        if (process.env.NODE_ENV !== 'production') {
            console.log('[BlueprintInspector] render', {
                selectedNodeId: state.selectedNodeId,
                hasDocument: !!state.document,
                hasNode: !!node,
                nodeInfo: node ? { id: node.id, type: node.type, label: node.label } : null,
                isAttached: this.isAttached,
                isVisible: this.isVisible
            });
        }
        return (
            <div className='blueprint-inspector-container'>
                {node ? (
                    <>
                        <div className='blueprint-inspector-header'>
                            <h3>Nodo seleccionado</h3>
                            <p className='blueprint-inspector-node-type'>{node.type}</p>
                        </div>
                        {this.renderNodeProps(node, state.documentUri)}
                    </>
                ) : (
                    <div className='blueprint-inspector-header'>
                        <h3>Inspector</h3>
                        <p className='blueprint-inspector-hint'>Selecciona un nodo en el canvas para ver y editar sus propiedades.</p>
                    </div>
                )}
                <div className='blueprint-inspector-section'>
                    <h4>Definitions</h4>
                    <p className='blueprint-inspector-hint'>Access gates, Access contexts, User profile</p>
                </div>
            </div>
        );
    }

    protected renderNodeProps(node: BlueprintNode, documentUri: string | null): React.ReactNode {
        const ozwNode = node as { resourceId?: string; route?: string; linkedResourceStatus?: string };
        const hasOzwLink = ['menu', 'view', 'modal'].includes(node.type);

        const handleLabelChange = (newLabel: string): void => {
            if (newLabel.trim() === '' || newLabel === node.label) { return; }
            this.editorRefService.applyCommand({ kind: 'UpdateNode', nodeId: node.id, patch: { label: newLabel.trim() } });
        };

        const handleDelete = (): void => {
            this.editorRefService.applyCommand({ kind: 'DeleteNode', nodeId: node.id });
        };

        const handleOpenOzw = (): void => {
            if (!ozwNode.resourceId || !documentUri) { return; }
            const wsRoot = this.workspaceService.getWorkspaceRootUri(new URI(documentUri));
            if (!wsRoot) { return; }
            const uri = wsRoot.resolve(ozwNode.resourceId);
            openUri(this.openerService, uri);
        };

        return (
            <>
                <div className='blueprint-inspector-section blueprint-inspector-node-props'>
                    <h4>Propiedades</h4>
                    <div className='blueprint-inspector-prop'>
                        <span className='blueprint-inspector-prop-label'>Nombre</span>
                        <input
                            type='text'
                            className='theia-input'
                            value={this.labelInputByNodeId[node.id] ?? node.label}
                            onChange={e => this.handleLabelInputChange(node.id, e.target.value)}
                            onBlur={e => {
                                handleLabelChange(e.target.value);
                                delete this.labelInputByNodeId[node.id];
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                        />
                    </div>
                    <button
                        type='button'
                        className='theia-button secondary'
                        onClick={handleDelete}
                        title='Eliminar nodo'
                    >
                        Eliminar nodo
                    </button>
                </div>

                {hasOzwLink && (
                    <div className='blueprint-inspector-section blueprint-inspector-node-props'>
                        <h4>Vista OZW</h4>
                        {ozwNode.resourceId || ozwNode.linkedResourceStatus === 'missing' ? (
                            <>
                                <div className='blueprint-inspector-prop'>
                                    <span className='blueprint-inspector-prop-label'>Estado</span>
                                    <span className={`blueprint-inspector-status blueprint-inspector-status--${ozwNode.linkedResourceStatus ?? 'unassigned'}`}>
                                        {ozwNode.linkedResourceStatus === 'linked' ? 'Vinculado' : ozwNode.linkedResourceStatus === 'missing' ? 'Archivo no encontrado' : 'Sin vincular'}
                                    </span>
                                </div>
                                {ozwNode.resourceId && (
                                    <>
                                        <div className='blueprint-inspector-prop'>
                                            <span className='blueprint-inspector-prop-label'>Archivo</span>
                                            <span className='blueprint-inspector-prop-value' title={ozwNode.resourceId}>{ozwNode.resourceId}</span>
                                        </div>
                                        {ozwNode.route && (
                                            <div className='blueprint-inspector-prop'>
                                                <span className='blueprint-inspector-prop-label'>Ruta</span>
                                                <span className='blueprint-inspector-prop-value'>{ozwNode.route}</span>
                                            </div>
                                        )}
                                        <button
                                            type='button'
                                            className='theia-button secondary'
                                            onClick={handleOpenOzw}
                                            title='Abrir el archivo .ozw vinculado'
                                        >
                                            Abrir vista .ozw
                                        </button>
                                    </>
                                )}
                            </>
                        ) : (
                            <p className='blueprint-inspector-hint'>Sin archivo .ozw vinculado. Arrastra un nuevo nodo Menu desde el lateral y vincúlalo para ver el enlace aquí.</p>
                        )}
                    </div>
                )}
            </>
        );
    }

    protected labelInputByNodeId: Record<string, string> = {};

    protected handleLabelInputChange(nodeId: string, value: string): void {
        this.labelInputByNodeId[nodeId] = value;
        this.update();
    }
}
