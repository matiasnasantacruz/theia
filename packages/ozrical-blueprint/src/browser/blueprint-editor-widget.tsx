// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    BaseWidget,
    Message,
    Saveable,
    SaveableSource,
    StatefulWidget,
    NavigatableWidget,
    WidgetManager,
    ApplicationShell
} from '@theia/core/lib/browser';
import { DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import type { BlueprintDocument, Position } from '../domain/entities/blueprint-types';
import { createEmptyBlueprint } from '../domain/factory';
import { BlueprintSerializer } from '../infrastructure/storage/blueprint-serializer';
import {
    applyCommand,
    type CreateNodeCommand,
    type MoveNodeCommand,
    type DeleteNodeCommand,
    type CreateEdgeCommand,
    type DeleteEdgeCommand
} from '../application/commands/blueprint-commands';
import { BlueprintCanvas } from './canvas/blueprint-canvas';

const MAX_UNDO = 50;

@injectable()
export class BlueprintEditorWidget extends BaseWidget implements Saveable, SaveableSource, StatefulWidget, NavigatableWidget {

    static readonly ID = 'blueprint-editor';
    static readonly LABEL = 'App Blueprint';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(BlueprintSerializer)
    protected readonly serializer: BlueprintSerializer;

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged: Event<void> = this.onDirtyChangedEmitter.event;
    readonly onContentChanged: Event<void> = this.onDirtyChangedEmitter.event;

    protected _uri: URI;
    protected _document: BlueprintDocument = createEmptyBlueprint();
    protected _undoStack: BlueprintDocument[] = [];
    protected _redoStack: BlueprintDocument[] = [];
    protected _selectedNodeId: string | undefined = undefined;
    protected _selectedEdgeId: string | undefined = undefined;
    protected _layerFilter: 'all' | 'navigation' | 'logic' | 'data' = 'all';
    protected _dirty = false;
    protected _isInitialized = false;
    protected root: Root | undefined;
    protected override toDispose = new DisposableCollection();

    constructor() {
        super();
        this._uri = new URI('file:///');
        this.id = BlueprintEditorWidget.ID;
        this.title.label = BlueprintEditorWidget.LABEL;
        this.title.caption = BlueprintEditorWidget.LABEL;
        this.addClass('blueprint-editor-widget');
    }

    get uri(): URI {
        return this._uri;
    }

    get isInitialized(): boolean {
        return this._isInitialized;
    }

    getResourceUri(): URI | undefined {
        return this._uri;
    }

    createMoveToUri(_resourceUri: URI): URI | undefined {
        return this._uri;
    }

    get saveable(): Saveable {
        return this;
    }

    get dirty(): boolean {
        return this._dirty;
    }

    set dirty(value: boolean) {
        if (this._dirty !== value) {
            this._dirty = value;
            this.onDirtyChangedEmitter.fire();
        }
    }

    async initialize(uri: URI, content: string): Promise<void> {
        this._uri = uri;
        if (content.trim()) {
            const result = this.serializer.parse(content);
            if (result.ok) {
                this._document = result.doc;
            } else {
                this._document = createEmptyBlueprint();
                this.messageService.warn(`Blueprint parse error: ${result.error.message}`);
            }
        } else {
            this._document = createEmptyBlueprint();
        }
        this._undoStack = [];
        this._redoStack = [];
        this._selectedNodeId = undefined;
        this._isInitialized = true;
        this._dirty = false;
        this.update();
    }

    protected pushUndo(): void {
        this._undoStack.push(JSON.parse(JSON.stringify(this._document)) as BlueprintDocument);
        if (this._undoStack.length > MAX_UNDO) {
            this._undoStack.shift();
        }
        this._redoStack = [];
    }

    undo(): void {
        if (this._undoStack.length === 0) {return; }
        this._redoStack.push(JSON.parse(JSON.stringify(this._document)) as BlueprintDocument);
        this._document = this._undoStack.pop()!;
        this._dirty = true;
        this.update();
    }

    redo(): void {
        if (this._redoStack.length === 0) {return; }
        this._undoStack.push(JSON.parse(JSON.stringify(this._document)) as BlueprintDocument);
        this._document = this._redoStack.pop()!;
        this._dirty = true;
        this.update();
    }

    protected applyAndPush(cmd: CreateNodeCommand | MoveNodeCommand | DeleteNodeCommand | CreateEdgeCommand | DeleteEdgeCommand): void {
        this.pushUndo();
        this._document = applyCommand(this._document, cmd);
        this.dirty = true;
        this.update();
    }

    protected handleDropNode = (type: CreateNodeCommand['type'], label: string, position: Position): void => {
        this.applyAndPush({ kind: 'CreateNode', type, label, position });
    };

    protected handleMoveNode = (nodeId: string, position: Position): void => {
        this.applyAndPush({ kind: 'MoveNode', nodeId, position });
    };

    protected handleDeleteNode = (nodeId: string): void => {
        this.applyAndPush({ kind: 'DeleteNode', nodeId });
    };

    protected handleCreateEdge = (sourceNodeId: string, targetNodeId: string, targetHandle?: 'left' | 'right'): void => {
        this.applyAndPush({
            kind: 'CreateEdge',
            sourceNodeId,
            targetNodeId,
            ...(targetHandle !== undefined && { targetHandle })
        });
    };

    protected handleDeleteEdge = (edgeId: string): void => {
        this.applyAndPush({ kind: 'DeleteEdge', edgeId });
    };

    async save(): Promise<void> {
        const content = this.serializer.stringify(this._document);
        await this.fileService.write(this._uri, content);
        this.dirty = false;
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.querySelector<HTMLElement>('.blueprint-editor-root')?.focus();
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
        this.toDispose.dispose();
        super.dispose();
    }

    getResource(): URI {
        return this._uri;
    }

    protected render(): React.ReactNode {
        return (
            <div className='blueprint-editor-root' tabIndex={0}>
                <div className='blueprint-editor-toolbar'>
                    <select
                        value={this._layerFilter}
                        onChange={e => {
                            this._layerFilter = e.target.value as 'all' | 'navigation' | 'logic' | 'data';
                            this.update();
                        }}
                    >
                        <option value='all'>All layers</option>
                        <option value='navigation'>Navigation</option>
                        <option value='logic'>Logic</option>
                        <option value='data'>Data</option>
                    </select>
                    <button type='button' onClick={() => this.undo()} disabled={this._undoStack.length === 0}>Undo</button>
                    <button type='button' onClick={() => this.redo()} disabled={this._redoStack.length === 0}>Redo</button>
                </div>
                <div className='blueprint-editor-canvas-wrap'>
                    <BlueprintCanvas
                        document={this._document}
                        selectedNodeId={this._selectedNodeId ?? undefined}
                        selectedEdgeId={this._selectedEdgeId ?? undefined}
                        layerFilter={this._layerFilter}
                        onSelectNode={id => { this._selectedNodeId = id ?? undefined; this.update(); }}
                        onSelectEdge={id => { this._selectedEdgeId = id ?? undefined; this.update(); }}
                        onDropNode={this.handleDropNode}
                        onMoveNode={this.handleMoveNode}
                        onDeleteNode={this.handleDeleteNode}
                        onCreateEdge={this.handleCreateEdge}
                        onDeleteEdge={this.handleDeleteEdge}
                        onRequestFocus={() => this.activate()}
                    />
                </div>
            </div>
        );
    }

    async storeState(): Promise<object> {
        return {
            uri: this._uri.toString(),
            document: this._document,
            selectedNodeId: this._selectedNodeId,
            selectedEdgeId: this._selectedEdgeId
        };
    }

    async restoreState(state: object): Promise<void> {
        const s = state as { uri?: string; document?: BlueprintDocument; selectedNodeId?: string | null; selectedEdgeId?: string | null };
        if (s.uri) {
            this._uri = new URI(s.uri);
        }
        if (s.document) {
            this._document = s.document;
        }
        if (s.selectedNodeId !== undefined) {
            this._selectedNodeId = s.selectedNodeId ?? undefined;
        }
        if (s.selectedEdgeId !== undefined) {
            this._selectedEdgeId = s.selectedEdgeId ?? undefined;
        }
    }
}
