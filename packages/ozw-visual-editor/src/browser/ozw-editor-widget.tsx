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
import { BaseWidget, Message, Saveable, SaveableSource, Widget, StatefulWidget, NavigatableWidget, WidgetManager, ApplicationShell } from '@theia/core/lib/browser';
import { DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import URI from '@theia/core/lib/common/uri';
import { SplitPanel } from '@lumino/widgets';
import { OzwPropertiesWidget } from './ozw-properties-widget';

export interface TreeNode {
    id: string;
    type: string;
    children?: TreeNode[];
}

export interface ComponentMetadata {
    label?: string;
    width?: string;
    height?: string;
    backgroundColor?: string;
    color?: string;
    padding?: string;
    margin?: string;
    [key: string]: unknown;
}

export interface OzwSchema {
    tree: TreeNode[];
    metadata: Record<string, ComponentMetadata>;
}

export interface OzwDocument {
    version: string;
    components: OzwComponent[];
    schema: OzwSchema;
}

export interface OzwComponent {
    type: string;
    id: string;
    properties: ComponentMetadata;
}

export type OzwEditorMode = 'canvas' | 'text' | 'split';

@injectable()
export class OzwEditorWidget extends BaseWidget implements Saveable, SaveableSource, StatefulWidget, NavigatableWidget {

    static readonly ID = 'ozw-editor';
    static readonly LABEL = 'OZW Visual Editor';

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

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
    protected _document: OzwDocument = {
        version: '1.0',
        components: [],
        schema: { tree: [], metadata: {} }
    };
    protected _dirty = false;
    protected _uri: URI;
    protected _autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange' = 'off';
    protected _isInitialized = false;
    protected _selectedComponentId: string | null = null;
    protected _draggedComponentId: string | null = null;
    protected _dropIndicator: HTMLDivElement | null = null;
    protected _dropPosition: 'before' | 'after' | 'inside' | null = null;

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
            this._document = JSON.parse(content || '{"version":"1.0","components":[],"schema":{"tree":[],"metadata":{}}}');
            // Ensure schema exists for backwards compatibility
            if (!this._document.schema) {
                this._document.schema = { tree: [], metadata: {} };
            }
        } catch (e) {
            console.error('Failed to parse OZW document:', e);
            this._document = {
                version: '1.0',
                components: [],
                schema: { tree: [], metadata: {} }
            };
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

        // Add keyboard listener for delete
        this.node.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedComponentId) {
                e.preventDefault();
                this.deleteComponent(this._selectedComponentId);
            }
        });

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
        workspace.style.minHeight = '400px';
        workspace.style.flex = '1';
        workspace.style.display = 'flex';
        workspace.style.flexDirection = 'column';
        workspace.style.gap = '0';

        // Setup drop handlers ONLY on the workspace (not on individual components)
        workspace.addEventListener('dragover', (e) => this.handleDragOver(e));
        workspace.addEventListener('drop', (e) => this.handleDrop(e));
        workspace.addEventListener('dragleave', (e) => this.handleDragLeave(e));

        // Click handler to deselect when clicking on empty space
        workspace.addEventListener('click', (e) => {
            // Only deselect if clicking directly on workspace (empty area)
            if (e.target === workspace) {
                this._selectedComponentId = null;
                this.renderCanvas();
            }
            // Don't stop propagation - let child elements handle their own clicks
        });

        // Render hierarchical tree
        if (this._document.schema.tree.length === 0) {
            // Show empty state
            const emptyState = document.createElement('div');
            emptyState.className = 'ozw-empty-state';
            emptyState.innerHTML = `
                <div class="ozw-empty-content">
                    <i class="fa fa-bars" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <p style="font-size: 16px; color: #666;">Arrastra una <strong>Columna</strong> aquí para empezar</p>
                </div>
            `;
            workspace.appendChild(emptyState);
        } else {
            // Render tree nodes
            this._document.schema.tree.forEach(node => {
                const element = this.createTreeNodeElement(node);
                workspace.appendChild(element);
            });
        }

        this.canvasContainer.appendChild(workspace);
    }

    protected createTreeNodeElement(node: TreeNode, depth: number = 0): HTMLDivElement {
        const element = document.createElement('div');
        element.className = `ozw-component ozw-component-${node.type}`;
        element.setAttribute('data-component-id', node.id);
        element.setAttribute('data-component-type', node.type);
        element.draggable = true;

        const metadata = this._document.schema.metadata[node.id] || {};
        const isContainer = this.canHaveChildren(node.type);

        // Setup drag handlers
        element.addEventListener('dragstart', (e) => this.handleComponentDragStart(e, node.id));
        element.addEventListener('dragend', (e) => this.handleComponentDragEnd(e));
        element.addEventListener('dragover', (e) => this.handleDragOver(e));
        element.addEventListener('drop', (e) => this.handleDrop(e));
        element.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        element.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            console.log('CLICK EVENT:', {
                target: target,
                targetClass: target.className,
                currentTarget: e.currentTarget,
                element: element,
                elementId: element.getAttribute('data-component-id'),
                elementType: element.getAttribute('data-component-type')
            });

            // Find the closest component element (could be this element or a child component)
            let closestComponent = target.closest('.ozw-component') as HTMLElement;

            console.log('CLOSEST COMPONENT:', {
                closestComponent: closestComponent,
                closestId: closestComponent?.getAttribute('data-component-id'),
                isSameAsElement: closestComponent === element
            });

            // If the closest component is THIS element, select it
            if (closestComponent === element) {
                console.log('SELECTING:', node.id);
                e.stopPropagation(); // Stop so parent containers don't get selected
                this.selectComponent(node.id);
            } else {
                console.log('NOT SELECTING, letting propagate');
            }
            // Otherwise, let the event propagate to the child component
        });

        // Apply container-specific styles
        if (node.type === 'column') {
            element.style.position = 'relative';
            element.style.display = 'flex';
            element.style.flexDirection = 'column';
            element.style.gap = '8px';
            element.style.padding = '12px';
            element.style.border = '2px dashed #007acc';
            element.style.borderRadius = '4px';
            element.style.minHeight = '100px';
            element.style.minWidth = '100px';
            element.style.backgroundColor = 'rgba(0, 122, 204, 0.05)';

            // Add label for column
            const label = document.createElement('div');
            label.className = 'ozw-container-label';
            label.textContent = metadata.label || 'Columna';
            label.style.fontSize = '11px';
            label.style.color = '#007acc';
            label.style.fontWeight = 'bold';
            label.style.marginBottom = '4px';
            label.style.pointerEvents = 'none';
            element.appendChild(label);
        } else if (node.type === 'row') {
            element.style.position = 'relative';
            element.style.display = 'flex';
            element.style.flexDirection = 'row';
            element.style.gap = '8px';
            element.style.padding = '8px';
            element.style.border = '2px dashed #10a37f';
            element.style.borderRadius = '4px';
            element.style.minHeight = 'auto';
            element.style.minWidth = '100px';
            element.style.alignItems = 'center';
            element.style.backgroundColor = 'rgba(16, 163, 127, 0.05)';

            // Add label for row
            const label = document.createElement('div');
            label.className = 'ozw-container-label';
            label.textContent = metadata.label || 'Fila';
            label.style.fontSize = '11px';
            label.style.color = '#10a37f';
            label.style.fontWeight = 'bold';
            label.style.marginBottom = '4px';
            label.style.pointerEvents = 'none';
            element.appendChild(label);
        } else {
            // Leaf components (button, input, text, image, etc.)
            element.style.position = 'relative';
            element.style.padding = '8px 16px';
            element.style.cursor = 'move';
            this.renderLeafComponent(element, node.type, metadata);
        }

        // Recursively render children for containers
        if (node.children && node.children.length > 0) {
            node.children.forEach(childNode => {
                const childElement = this.createTreeNodeElement(childNode, depth + 1);
                element.appendChild(childElement);
            });
        } else if (isContainer) {
            // Add placeholder for empty containers
            const placeholder = document.createElement('div');
            placeholder.className = 'ozw-container-placeholder';
            placeholder.textContent = node.type === 'column' ? 'Arrastra componentes aquí (vertical)' : 'Arrastra componentes aquí (horizontal)';
            placeholder.style.padding = '16px';
            placeholder.style.textAlign = 'center';
            placeholder.style.color = '#999';
            placeholder.style.fontSize = '12px';
            placeholder.style.fontStyle = 'italic';
            placeholder.style.pointerEvents = 'none'; // Let clicks pass through to parent
            element.appendChild(placeholder);
        }

        // Highlight if selected
        if (this._selectedComponentId === node.id) {
            element.classList.add('ozw-selected');

            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'ozw-delete-button';
            deleteBtn.innerHTML = '<i class="fa fa-times"></i>';
            deleteBtn.title = 'Delete component (or press Delete key)';
            deleteBtn.style.position = 'absolute';
            deleteBtn.style.top = '-10px';
            deleteBtn.style.right = '-10px';
            deleteBtn.style.width = '24px';
            deleteBtn.style.height = '24px';
            deleteBtn.style.borderRadius = '50%';
            deleteBtn.style.border = 'none';
            deleteBtn.style.backgroundColor = '#e74c3c';
            deleteBtn.style.color = 'white';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.display = 'flex';
            deleteBtn.style.alignItems = 'center';
            deleteBtn.style.justifyContent = 'center';
            deleteBtn.style.fontSize = '12px';
            deleteBtn.style.zIndex = '1000';
            deleteBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteComponent(node.id);
            };
            deleteBtn.onmouseenter = () => deleteBtn.style.backgroundColor = '#c0392b';
            deleteBtn.onmouseleave = () => deleteBtn.style.backgroundColor = '#e74c3c';
            element.appendChild(deleteBtn);
        }

        return element;
    }

    protected renderLeafComponent(element: HTMLDivElement, type: string, metadata: ComponentMetadata): void {
        const baseHeight = '36px';

        switch (type) {
            case 'button':
                element.innerHTML = `<button class="theia-button ozw-modern-button">${metadata.label || 'Button'}</button>`;
                element.style.backgroundColor = 'transparent';
                element.style.padding = '0';
                element.style.height = baseHeight;
                element.style.display = 'flex';
                element.style.alignItems = 'center';
                break;
            case 'input':
                element.innerHTML = `<input type="text" class="ozw-modern-input" placeholder="${metadata.label || 'Input'}" />`;
                element.style.backgroundColor = 'transparent';
                element.style.padding = '0';
                element.style.height = baseHeight;
                element.style.display = 'flex';
                element.style.alignItems = 'center';
                break;
            case 'text':
                element.innerHTML = `<p class="ozw-modern-text">${metadata.label || 'Text'}</p>`;
                element.style.backgroundColor = 'transparent';
                element.style.padding = '0 8px';
                element.style.height = baseHeight;
                element.style.display = 'flex';
                element.style.alignItems = 'center';
                break;
            case 'image':
                element.innerHTML = `<div class="ozw-modern-image">
                    <i class="fa fa-image" style="font-size: 20px; color: #999;"></i>
                </div>`;
                element.style.padding = '0';
                element.style.height = baseHeight;
                element.style.display = 'flex';
                element.style.alignItems = 'center';
                break;
            case 'card':
                element.innerHTML = `<div class="ozw-modern-card">
                    <h4>${metadata.label || 'Card Title'}</h4>
                    <p>Card content</p>
                </div>`;
                element.style.padding = '0';
                break;
            case 'container':
                element.innerHTML = `<div class="ozw-modern-container">
                    <p>${metadata.label || 'Container'}</p>
                </div>`;
                element.style.padding = '0';
                break;
            default:
                element.textContent = metadata.label || type;
                element.style.height = baseHeight;
                element.style.display = 'flex';
                element.style.alignItems = 'center';
        }
    }

    protected canHaveChildren(type: string): boolean {
        return type === 'column' || type === 'row';
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

    // Drag and Drop Handlers
    protected handleDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget as HTMLElement;
        const targetId = target.getAttribute('data-component-id');
        const targetType = target.getAttribute('data-component-type');

        // Don't show indicator if dragging over self
        if (targetId === this._draggedComponentId) {
            this.removeDropIndicator();
            return;
        }

        // Determine drop effect
        if (this._draggedComponentId) {
            event.dataTransfer!.dropEffect = 'move';
        } else {
            event.dataTransfer!.dropEffect = 'copy';
        }

        // Show drop indicator
        if (targetType && this.canHaveChildren(targetType)) {
            // Container - show inside indicator
            this._dropPosition = 'inside';
            target.classList.add('ozw-drop-target');
            this.removeDropIndicator();
        } else if (targetId) {
            // Leaf component - show swap/insert indicator
            this.showDropIndicator(target, event);
            target.classList.remove('ozw-drop-target');
        } else {
            // Workspace
            target.classList.add('ozw-drop-target');
            this.removeDropIndicator();
        }
    }

    protected handleDragLeave(event: DragEvent): void {
        // Only remove highlight if we're actually leaving the element
        const target = event.currentTarget as HTMLElement;
        const relatedTarget = event.relatedTarget as HTMLElement;

        // Don't remove highlight if we're moving to a child element
        if (relatedTarget && target.contains(relatedTarget)) {
            return;
        }

        target.classList.remove('ozw-drop-target');
        this.removeDropIndicator();
    }

    protected handleDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget as HTMLElement;
        target.classList.remove('ozw-drop-target');
        this.removeDropIndicator();

        // Find the actual element under the mouse (not just the event target)
        const actualTarget = this.findDropTarget(event);

        // Get component data from toolbox
        const componentDataStr = event.dataTransfer?.getData('application/ozw-component');
        if (componentDataStr) {
            const componentData = JSON.parse(componentDataStr);
            this.addComponentToTarget(componentData.type, actualTarget);
        } else if (this._draggedComponentId) {
            // Moving existing component
            this.moveComponentToTarget(this._draggedComponentId, actualTarget);
        }

        // Clear drop position AFTER using it
        this._dropPosition = null;
    }

    protected findDropTarget(event: DragEvent): HTMLElement {
        // Get all elements under mouse pointer
        const elementsUnderMouse = document.elementsFromPoint(event.clientX, event.clientY);

        let smallestComponent: HTMLElement | null = null;
        let smallestArea = Infinity;

        // Find the SMALLEST component (most specific target)
        for (const element of elementsUnderMouse) {
            if (element instanceof HTMLElement) {
                // Skip labels and placeholders
                if (element.classList.contains('ozw-container-label') ||
                    element.classList.contains('ozw-container-placeholder') ||
                    element.classList.contains('ozw-delete-button')) {
                    continue;
                }

                // Check if it's a valid component
                if (element.classList.contains('ozw-component')) {
                    // Calculate area to find the smallest (most specific) one
                    const rect = element.getBoundingClientRect();
                    const area = rect.width * rect.height;

                    if (area < smallestArea) {
                        smallestArea = area;
                        smallestComponent = element;
                    }
                }

                // Check for canvas workspace as fallback
                if (!smallestComponent && element.classList.contains('ozw-canvas-workspace')) {
                    return element;
                }
            }
        }

        if (smallestComponent) {
            console.log('Found smallest component:', {
                id: smallestComponent.getAttribute('data-component-id'),
                type: smallestComponent.getAttribute('data-component-type'),
                area: smallestArea
            });
            return smallestComponent;
        }

        // Fallback: search upwards from the event target
        let current = event.target as HTMLElement | null;
        while (current) {
            if (current.classList.contains('ozw-component') ||
                current.classList.contains('ozw-canvas-workspace')) {
                return current;
            }
            current = current.parentElement;
        }

        // Last fallback to currentTarget
        return event.currentTarget as HTMLElement;
    }

    protected addComponentToTarget(type: string, targetElement: HTMLElement): void {
        const targetId = targetElement.getAttribute('data-component-id');
        const targetType = targetElement.getAttribute('data-component-type');

        console.log('Drop target:', {
            element: targetElement,
            id: targetId,
            type: targetType,
            classList: Array.from(targetElement.classList)
        });

        // Validate drop target
        if (targetElement.classList.contains('ozw-canvas-workspace')) {
            // Dropping on root canvas
            if (this._document.schema.tree.length === 0) {
                // First component must be a column
                if (type !== 'column') {
                    console.warn('First component must be a column');
                    return;
                }
            }

            // Add to root
            console.log('Adding to root');
            this.addComponent(type, null);
        } else if (targetId && targetType) {
            // Check if target is a layout container
            if (this.canHaveChildren(targetType)) {
                // Target IS a layout (Column/Row) - drop INSIDE it
                console.log('Adding INSIDE layout', targetType, targetId);
                this.addComponent(type, targetId);
            } else {
                // Target is NOT a layout - drop in its PARENT container
                const parentId = this.findParentId(targetId);
                console.log('Target is not a layout, adding to parent:', parentId);
                if (parentId) {
                    this.addComponent(type, parentId);
                } else {
                    // No parent found, add to root
                    console.log('No parent found, adding to root');
                    this.addComponent(type, null);
                }
            }
        }
    }

    protected findParentId(childId: string): string | null {
        const findInTree = (nodes: TreeNode[], parentId: string | null = null): string | null => {
            for (const node of nodes) {
                if (node.id === childId) {
                    return parentId;
                }
                if (node.children) {
                    const found = findInTree(node.children, node.id);
                    if (found !== null) {
                        return found;
                    }
                }
            }
            return null;
        };

        return findInTree(this._document.schema.tree);
    }

    protected addComponent(type: string, parentId: string | null): void {
        // Generate unique ID
        const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create component
        const component: OzwComponent = {
            id,
            type,
            properties: {
                label: type === 'column' ? 'Columna' :
                    type === 'row' ? 'Fila' :
                        `${type.charAt(0).toUpperCase()}${type.slice(1)}`
            }
        };

        // Add to components array
        this._document.components.push(component);

        // Update metadata
        this._document.schema.metadata[id] = component.properties;

        // Update tree
        const newNode: TreeNode = { id, type, children: this.canHaveChildren(type) ? [] : undefined };

        if (parentId === null) {
            // Add to root
            this._document.schema.tree.push(newNode);
        } else {
            // Add to parent
            this.addNodeToParent(newNode, parentId, this._document.schema.tree);
        }

        // Mark as dirty and re-render
        this.dirty = true;
        this.syncToText();
        this.renderCanvas();
    }

    protected addNodeToParent(node: TreeNode, parentId: string, tree: TreeNode[]): boolean {
        for (const treeNode of tree) {
            if (treeNode.id === parentId) {
                if (!treeNode.children) {
                    treeNode.children = [];
                }
                treeNode.children.push(node);
                return true;
            }
            if (treeNode.children && this.addNodeToParent(node, parentId, treeNode.children)) {
                return true;
            }
        }
        return false;
    }

    protected handleComponentDragStart(event: DragEvent, componentId: string): void {
        event.stopPropagation();
        this._draggedComponentId = componentId;
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('application/ozw-component-id', componentId);

        const target = event.currentTarget as HTMLElement;
        target.style.opacity = '0.5';
    }

    protected handleComponentDragEnd(event: DragEvent): void {
        this._draggedComponentId = null;
        this._dropPosition = null;
        const target = event.currentTarget as HTMLElement;
        target.style.opacity = '1';

        // Remove all drop target highlights
        document.querySelectorAll('.ozw-drop-target').forEach(el => {
            el.classList.remove('ozw-drop-target');
        });

        this.removeDropIndicator();
    }

    protected showDropIndicator(targetElement: HTMLElement, event: DragEvent): void {
        const rect = targetElement.getBoundingClientRect();
        const mouseY = event.clientY;
        const mouseX = event.clientX;

        // Determine if we should insert before or after
        const parentElement = targetElement.parentElement;
        if (!parentElement) return;

        const parentStyle = window.getComputedStyle(parentElement);
        const isHorizontal = parentStyle.flexDirection === 'row';

        // Calculate position
        if (isHorizontal) {
            const midX = rect.left + rect.width / 2;
            this._dropPosition = mouseX < midX ? 'before' : 'after';
        } else {
            const midY = rect.top + rect.height / 2;
            this._dropPosition = mouseY < midY ? 'before' : 'after';
        }

        // Create or update indicator
        if (!this._dropIndicator) {
            this._dropIndicator = document.createElement('div');
            this._dropIndicator.className = 'ozw-drop-indicator';
            document.body.appendChild(this._dropIndicator);
        }

        // Position the indicator
        if (isHorizontal) {
            this._dropIndicator.style.position = 'fixed';
            this._dropIndicator.style.width = '3px';
            this._dropIndicator.style.height = `${rect.height - 8}px`;
            this._dropIndicator.style.backgroundColor = '#007acc';
            this._dropIndicator.style.top = `${rect.top + 4}px`;
            this._dropIndicator.style.left = this._dropPosition === 'before' ? `${rect.left - 6}px` : `${rect.right + 3}px`;
            this._dropIndicator.style.zIndex = '10000';
            this._dropIndicator.style.pointerEvents = 'none';
            this._dropIndicator.style.boxShadow = '0 0 6px rgba(0, 122, 204, 0.8)';
            this._dropIndicator.style.borderRadius = '2px';
        } else {
            this._dropIndicator.style.position = 'fixed';
            this._dropIndicator.style.width = `${rect.width - 8}px`;
            this._dropIndicator.style.height = '3px';
            this._dropIndicator.style.backgroundColor = '#007acc';
            this._dropIndicator.style.left = `${rect.left + 4}px`;
            this._dropIndicator.style.top = this._dropPosition === 'before' ? `${rect.top - 6}px` : `${rect.bottom + 3}px`;
            this._dropIndicator.style.zIndex = '10000';
            this._dropIndicator.style.pointerEvents = 'none';
            this._dropIndicator.style.boxShadow = '0 0 6px rgba(0, 122, 204, 0.8)';
            this._dropIndicator.style.borderRadius = '2px';
        }
    }

    protected removeDropIndicator(): void {
        if (this._dropIndicator) {
            this._dropIndicator.remove();
            this._dropIndicator = null;
        }
        // Don't clear _dropPosition here - it's needed for the drop event
    }

    protected moveComponentToTarget(componentId: string, targetElement: HTMLElement): void {
        const targetId = targetElement.getAttribute('data-component-id');
        const targetType = targetElement.getAttribute('data-component-type');

        // Don't allow dropping on self
        if (componentId === targetId) {
            return;
        }

        // Don't allow dropping a parent into its own child (would create a loop)
        if (targetId && this.isDescendant(targetId, componentId)) {
            console.warn('Cannot move a parent into its own descendant');
            return;
        }

        // Add to new location
        if (targetElement.classList.contains('ozw-canvas-workspace')) {
            // Remove from current location
            const node = this.removeNodeFromTree(componentId, this._document.schema.tree);
            if (!node) {
                return;
            }
            // Dropped on root canvas
            this._document.schema.tree.push(node);
        } else if (targetId && targetType) {
            // Check if target is a layout container
            if (this.canHaveChildren(targetType)) {
                // Remove from current location
                const node = this.removeNodeFromTree(componentId, this._document.schema.tree);
                if (!node) {
                    return;
                }
                // Target IS a layout - move INSIDE it
                this.addNodeToParent(node, targetId, this._document.schema.tree);
            } else {
                // Target is NOT a layout - insert before/after based on _dropPosition
                console.log('INSERTING:', componentId, this._dropPosition, 'target:', targetId);
                this.insertComponentRelativeToSmart(componentId, targetId, this._dropPosition || 'after');
            }
        }

        this.dirty = true;
        this.syncToText();
        this.renderCanvas();
    }

    protected insertComponentRelativeToSmart(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): void {
        // Find BOTH components BEFORE removing anything
        const sourceInfo = this.findNodeWithParent(sourceId, this._document.schema.tree);
        const targetInfo = this.findNodeWithParent(targetId, this._document.schema.tree);

        if (!sourceInfo || !targetInfo) {
            console.error('Could not find source or target for insertion');
            return;
        }

        const sourceArray = sourceInfo.parentArray;
        const targetArray = targetInfo.parentArray;
        const sourceIndex = sourceInfo.index;
        let targetIndex = targetInfo.index;

        // Check if they're in the same parent array
        const sameParent = sourceArray === targetArray;

        // Remove source node
        const sourceNode = sourceArray.splice(sourceIndex, 1)[0];

        // Adjust target index if needed
        if (sameParent && sourceIndex < targetIndex) {
            // Source was before target, so removing it shifts target's index down by 1
            targetIndex--;
        }

        // Insert at the correct position
        if (position === 'before') {
            targetArray.splice(targetIndex, 0, sourceNode);
        } else {
            targetArray.splice(targetIndex + 1, 0, sourceNode);
        }

        console.log('Inserted component', position, 'target. SourceIdx:', sourceIndex, 'AdjustedTargetIdx:', targetIndex);
    }

    protected findNodeWithParent(nodeId: string, tree: TreeNode[], parentArray: TreeNode[] = tree): { node: TreeNode; parentArray: TreeNode[]; index: number } | null {
        for (let i = 0; i < tree.length; i++) {
            if (tree[i].id === nodeId) {
                return { node: tree[i], parentArray: parentArray, index: i };
            }
            if (tree[i].children) {
                const found = this.findNodeWithParent(nodeId, tree[i].children!, tree[i].children!);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    protected isDescendant(potentialDescendantId: string, ancestorId: string): boolean {
        const checkNode = (node: TreeNode): boolean => {
            if (node.id === potentialDescendantId) {
                return true;
            }
            if (node.children) {
                return node.children.some(child => checkNode(child));
            }
            return false;
        };

        // Find the ancestor node
        const findNode = (nodes: TreeNode[]): TreeNode | null => {
            for (const node of nodes) {
                if (node.id === ancestorId) {
                    return node;
                }
                if (node.children) {
                    const found = findNode(node.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const ancestorNode = findNode(this._document.schema.tree);
        if (!ancestorNode) return false;

        return checkNode(ancestorNode);
    }

    protected removeNodeFromTree(nodeId: string, tree: TreeNode[]): TreeNode | null {
        for (let i = 0; i < tree.length; i++) {
            if (tree[i].id === nodeId) {
                const removed = tree.splice(i, 1)[0];
                return removed;
            }
            if (tree[i].children) {
                const found = this.removeNodeFromTree(nodeId, tree[i].children!);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    protected selectComponent(componentId: string): void {
        console.log('🎯 selectComponent called with ID:', componentId);
        this._selectedComponentId = componentId;
        this.renderCanvas();

        // Update properties widget
        console.log('📋 Calling updatePropertiesWidget...');
        this.updatePropertiesWidget(componentId);
    }

    protected async updatePropertiesWidget(componentId: string): Promise<void> {
        console.log('🔍 updatePropertiesWidget START for:', componentId);

        try {
            // Try to get or create the widget using WidgetManager
            console.log('🆕 Getting or creating widget...');
            const propertiesWidget = await this.widgetManager.getOrCreateWidget<OzwPropertiesWidget>(
                OzwPropertiesWidget.ID
            );

            console.log('📦 Widget obtained:', propertiesWidget ? 'Success' : 'Failed');
            console.log('📦 Widget type:', propertiesWidget?.constructor.name);

            if (propertiesWidget) {
                const component = this._document.components.find(c => c.id === componentId);
                console.log('🧩 Component found:', component ? `${component.type} (${component.id})` : 'NOT FOUND');

                if (component) {
                    const metadata = this._document.schema.metadata[componentId] || {};
                    console.log('📝 Metadata:', metadata);

                    propertiesWidget.setSelectedComponent(componentId, component.type, metadata);

                    // Setup property change listener
                    propertiesWidget.onPropertyChange((event) => {
                        this.handlePropertyChange(event.componentId, event.property, event.value);
                    });

                    // Add to shell if not already there
                    if (!propertiesWidget.isAttached) {
                        console.log('➕ Adding widget to shell...');
                        await this.shell.addWidget(propertiesWidget, { area: 'right', rank: 200 });
                    }

                    // Activate the widget
                    console.log('🚀 Activating widget...');
                    await this.shell.activateWidget(propertiesWidget.id);

                    console.log('👁️ Widget visible?', propertiesWidget.isVisible);
                    console.log('📌 Widget attached?', propertiesWidget.isAttached);
                    console.log('✨ Properties widget updated successfully!');
                }
            } else {
                console.error('❌ Failed to get or create properties widget');
            }
        } catch (error) {
            console.error('💥 Error in updatePropertiesWidget:', error);
        }

        console.log('🏁 updatePropertiesWidget END');
    }

    protected handlePropertyChange(componentId: string, property: string, value: unknown): void {
        // Update metadata
        if (!this._document.schema.metadata[componentId]) {
            this._document.schema.metadata[componentId] = {};
        }
        this._document.schema.metadata[componentId][property] = value;

        // Update component properties
        const component = this._document.components.find(c => c.id === componentId);
        if (component) {
            component.properties[property] = value;
        }

        // Mark as dirty and re-render
        this.dirty = true;
        this.syncToText();
        this.renderCanvas();
    }

    protected deleteComponent(componentId: string): void {
        // Remove from components array
        const componentIndex = this._document.components.findIndex(c => c.id === componentId);
        if (componentIndex !== -1) {
            this._document.components.splice(componentIndex, 1);
        }

        // Remove from metadata
        delete this._document.schema.metadata[componentId];

        // Remove from tree
        this.removeNodeFromTree(componentId, this._document.schema.tree);

        // Clear selection
        this._selectedComponentId = null;

        // Mark as dirty and re-render
        this.dirty = true;
        this.syncToText();
        this.renderCanvas();

        console.log('Component deleted:', componentId);
    }
}
