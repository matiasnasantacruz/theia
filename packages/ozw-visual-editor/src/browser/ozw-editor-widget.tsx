// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, Message, Saveable, SaveableSource, Widget, StatefulWidget, NavigatableWidget } from '@theia/core/lib/browser';
import { DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import URI from '@theia/core/lib/common/uri';
import { SplitPanel } from '@lumino/widgets';

export interface OzwDocument {
    version: string;
    components: OzwComponent[];
}

export interface OzwComponent {
    type: string;
    id: string;
    properties: {
        x: number;
        y: number;
        width?: number;
        height?: number;
        label?: string;
        [key: string]: unknown;
    };
}

export type OzwEditorMode = 'canvas' | 'text' | 'split';

@injectable()
export class OzwEditorWidget extends BaseWidget implements Saveable, SaveableSource, StatefulWidget, NavigatableWidget {

    static readonly ID = 'ozw-editor';
    static readonly LABEL = 'OZW Visual Editor';

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onContentChanged: Event<void> = this.onDirtyChangedEmitter.event;
    readonly onDirtyChanged: Event<void> = this.onDirtyChangedEmitter.event;

    protected readonly toDisposeOnEditor = new DisposableCollection();
    protected textEditor: MonacoEditor | undefined;
    protected canvasContainer: HTMLDivElement;
    protected textEditorContainer: HTMLDivElement;
    protected splitPanel: SplitPanel | undefined;
    protected modeToolbar: HTMLDivElement;

    protected _mode: OzwEditorMode = 'canvas';
    protected _document: OzwDocument = { version: '1.0', components: [] };
    protected _dirty = false;
    protected _uri: URI;
    protected _autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange' = 'off';
    protected _isInitialized = false;

    get uri(): URI {
        return this._uri;
    }

    get isInitialized(): boolean {
        return this._isInitialized;
    }

    // NavigatableWidget implementation
    getResourceUri(): URI | undefined {
        return this._uri;
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        return resourceUri;
    }

    get saveable(): Saveable {
        return this;
    }

    get mode(): OzwEditorMode {
        return this._mode;
    }

    set mode(mode: OzwEditorMode) {
        if (this._mode !== mode) {
            this._mode = mode;
            this.updateLayout();
        }
    }

    get dirty(): boolean {
        return this._dirty;
    }

    set dirty(dirty: boolean) {
        if (this._dirty !== dirty) {
            this._dirty = dirty;
            this.onDirtyChangedEmitter.fire();
        }
    }

    get autoSave(): 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange' {
        return this._autoSave;
    }

    async initialize(uri: URI, content: string): Promise<void> {
        this._uri = uri;
        this.id = `ozw-editor:${uri.toString()}`;
        this.title.label = uri.path.base;
        this.title.caption = uri.path.fsPath();
        this.title.closable = true;
        this.title.iconClass = 'fa fa-cube';

        try {
            this._document = JSON.parse(content || '{"version":"1.0","components":[]}');
        } catch (e) {
            console.error('Failed to parse OZW document:', e);
            this._document = { version: '1.0', components: [] };
        }

        await this.initializeEditor();
        this.renderCanvas();
        this._isInitialized = true;
    }

    protected async initializeEditor(): Promise<void> {
        this.textEditor = await this.editorProvider.get(this._uri);
        this.toDisposeOnEditor.push(this.textEditor);
        this.toDisposeOnEditor.push(this.textEditor.onDocumentContentChanged(() => {
            this.dirty = true;
            this.syncFromText();
        }));
        this.textEditorContainer.appendChild(this.textEditor.node);
    }

    @postConstruct()
    protected init(): void {
        this.addClass('ozw-editor-widget');
        this.toDispose.push(this.toDisposeOnEditor);
        this.toDispose.push(this.onDirtyChangedEmitter);
        
        // Make widget focusable immediately before anything else
        this.node.tabIndex = 0;
        // Ensure focus can be received immediately
        this.node.setAttribute('aria-label', 'OZW Visual Editor');

        // Create mode toolbar
        this.modeToolbar = document.createElement('div');
        this.modeToolbar.className = 'ozw-mode-toolbar';
        
        const canvasBtn = this.createToolbarButton('Canvas', 'canvas');
        const textBtn = this.createToolbarButton('Text', 'text');
        const splitBtn = this.createToolbarButton('Split', 'split');
        
        this.modeToolbar.appendChild(canvasBtn);
        this.modeToolbar.appendChild(textBtn);
        this.modeToolbar.appendChild(splitBtn);
        
        // Create canvas container
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.className = 'ozw-canvas-container';
        
        // Create text editor container
        this.textEditorContainer = document.createElement('div');
        this.textEditorContainer.className = 'ozw-text-editor-container';

        this.node.appendChild(this.modeToolbar);
        this.node.appendChild(this.canvasContainer);
        this.node.appendChild(this.textEditorContainer);

        this.updateLayout();
    }
    
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        // Simply focus the node - it's already focusable with tabIndex=0
        this.node.focus({ preventScroll: true });
    }

    protected createToolbarButton(label: string, mode: OzwEditorMode): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'theia-button ozw-mode-button';
        btn.textContent = label;
        btn.onclick = () => this.mode = mode;
        return btn;
    }

    protected updateLayout(): void {
        // Hide all containers first
        this.canvasContainer.style.display = 'none';
        this.textEditorContainer.style.display = 'none';
        
        // Dispose split panel if exists
        if (this.splitPanel) {
            this.splitPanel.dispose();
            this.splitPanel = undefined;
        }

        switch (this._mode) {
            case 'canvas':
                this.canvasContainer.style.display = 'flex';
                break;
            case 'text':
                this.textEditorContainer.style.display = 'block';
                if (this.textEditor) {
                    this.textEditor.refresh();
                }
                break;
            case 'split':
                this.setupSplitView();
                break;
        }
    }

    protected setupSplitView(): void {
        this.splitPanel = new SplitPanel({ orientation: 'horizontal', spacing: 4 });
        this.splitPanel.id = 'ozw-split-panel';

        const canvasWidget = new Widget({ node: this.canvasContainer });
        const textWidget = new Widget({ node: this.textEditorContainer });

        this.canvasContainer.style.display = 'flex';
        this.textEditorContainer.style.display = 'block';

        this.splitPanel.addWidget(canvasWidget);
        this.splitPanel.addWidget(textWidget);
        this.splitPanel.setRelativeSizes([1, 1]);

        Widget.attach(this.splitPanel, this.node);

        if (this.textEditor) {
            this.textEditor.refresh();
        }
    }

    protected renderCanvas(): void {
        this.canvasContainer.innerHTML = '';
        
        // Create canvas header
        const header = document.createElement('div');
        header.className = 'ozw-canvas-header';
        header.innerHTML = '<h3>Visual Canvas</h3><p>Drag components from the toolbox to start building</p>';
        this.canvasContainer.appendChild(header);

        // Create canvas workspace
        const workspace = document.createElement('div');
        workspace.className = 'ozw-canvas-workspace';
        workspace.style.position = 'relative';
        workspace.style.minHeight = '400px';
        workspace.style.backgroundColor = '#ffffff';
        workspace.style.border = '2px dashed #cccccc';
        workspace.style.borderRadius = '4px';

        // Render components
        this._document.components.forEach(component => {
            const element = this.createComponentElement(component);
            workspace.appendChild(element);
        });

        this.canvasContainer.appendChild(workspace);
    }

    protected createComponentElement(component: OzwComponent): HTMLDivElement {
        const element = document.createElement('div');
        element.className = `ozw-component ozw-component-${component.type}`;
        element.style.position = 'absolute';
        element.style.left = `${component.properties.x}px`;
        element.style.top = `${component.properties.y}px`;
        element.style.padding = '8px 16px';
        element.style.cursor = 'move';

        switch (component.type) {
            case 'button':
                element.innerHTML = `<button class="theia-button">${component.properties.label || 'Button'}</button>`;
                element.style.backgroundColor = '#007acc';
                element.style.color = 'white';
                element.style.borderRadius = '4px';
                break;
            case 'input':
                element.innerHTML = `<input type="text" placeholder="${component.properties.label || 'Input'}" />`;
                break;
            case 'card':
                element.innerHTML = `<div class="ozw-card"><h4>${component.properties.label || 'Card Title'}</h4><p>Card content</p></div>`;
                element.style.backgroundColor = '#f5f5f5';
                element.style.border = '1px solid #ddd';
                element.style.borderRadius = '8px';
                element.style.width = '200px';
                break;
            case 'text':
                element.innerHTML = `<p>${component.properties.label || 'Text'}</p>`;
                break;
            default:
                element.textContent = component.properties.label || component.type;
        }

        return element;
    }

    protected syncFromText(): void {
        if (!this.textEditor) {
            return;
        }
        try {
            const content = this.textEditor.document.getText();
            this._document = JSON.parse(content);
            if (this._mode === 'canvas' || this._mode === 'split') {
                this.renderCanvas();
            }
        } catch (e) {
            // Invalid JSON, don't update
            console.warn('Invalid JSON in text editor');
        }
    }

    protected syncToText(): void {
        if (!this.textEditor) {
            return;
        }
        const content = JSON.stringify(this._document, null, 2);
        const currentContent = this.textEditor.document.getText();
        if (content !== currentContent) {
            this.textEditor.document.textEditorModel.setValue(content);
        }
    }

    async save(): Promise<void> {
        if (this.textEditor) {
            this.syncToText();
            await this.textEditor.document.save();
            this.dirty = false;
        }
    }

    async revert(options?: Saveable.RevertOptions): Promise<void> {
        if (this.textEditor) {
            await this.textEditor.document.revert(options);
            this.dirty = false;
            this.syncFromText();
        }
    }

    createSnapshot(): Saveable.Snapshot {
        return {
            value: JSON.stringify(this._document),
            read: () => JSON.stringify(this._document)
        };
    }

    applySnapshot(snapshot: object): void {
        if ('value' in snapshot && typeof snapshot.value === 'string') {
            try {
                this._document = JSON.parse(snapshot.value);
                this.syncToText();
                this.renderCanvas();
            } catch (e) {
                console.error('Failed to apply snapshot:', e);
            }
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        if (this.textEditor) {
            this.textEditor.refresh();
        }
        if (this.splitPanel) {
            this.splitPanel.update();
        }
    }

    // StatefulWidget implementation
    storeState(): object {
        return {
            uri: this._uri.toString(),
            mode: this._mode
        };
    }

    restoreState(oldState: object & { uri?: string; mode?: OzwEditorMode }): void {
        if (oldState.uri && !this._uri) {
            // Widget is being restored - reinitialize it
            const uri = new URI(oldState.uri);
            this._uri = uri;
            this.id = `ozw-editor:${uri.toString()}`;
            this.title.label = uri.path.base;
            this.title.caption = uri.path.fsPath();
            this.title.closable = true;
            this.title.iconClass = 'fa fa-cube';
            
            if (oldState.mode) {
                this._mode = oldState.mode;
            }
        }
    }
}
