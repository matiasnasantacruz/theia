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
import { BaseWidget, Message, Saveable, SaveableSource, Widget, StatefulWidget, NavigatableWidget, WidgetManager, ApplicationShell, codicon } from '@theia/core/lib/browser';
import { DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import URI from '@theia/core/lib/common/uri';
import { SplitPanel } from '@theia/core/shared/@lumino/widgets';
import { OzwPropertiesWidget } from './ozw-properties-widget';
import { OzwToolboxWidget } from './ozw-toolbox-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { applyFlexChildSizing, createDefaultMetadata, renderLeafDom } from './component-registry';

export interface TreeNode {
    id: string;
    type: string;
    children?: TreeNode[];
}

export interface ComponentMetadata {
    label?: string;
    width?: string;
    height?: string;
    /**
     * Alineación horizontal del contenido dentro del widget.
     */
    alignH?: 'start' | 'center' | 'end';
    /**
     * Alineación vertical del contenido dentro del widget.
     */
    alignV?: 'start' | 'center' | 'end';
    /**
     * Si está en `true`, NO participa del sistema de pesos (flex-grow) en `row`/`column`.
     */
    disableWeight?: boolean;
    /**
     * Peso proporcional para layouts (`row` / `column`).
     * Default efectivo: 1.
     */
    weight?: number;
    /**
     * Tamaño del espaciador (Spacer) como longitud CSS.
     * Ej: `8px`, `1rem`, `10%`.
     */
    space?: string;
    backgroundColor?: string;
    color?: string;
    padding?: string;
    margin?: string;
    textColorMode?: 'system' | 'custom';
    textColorLight?: string;
    textColorDark?: string;
    textColor?: string; // legacy
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
type SplitViewOrder = 'canvas-first' | 'code-first';

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

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onContentChanged: Event<void> = this.onDirtyChangedEmitter.event;
    readonly onDirtyChanged: Event<void> = this.onDirtyChangedEmitter.event;

    protected readonly toDisposeOnEditor = new DisposableCollection();
    protected textEditor: MonacoEditor | undefined;
    protected canvasContainer: HTMLDivElement;
    protected textEditorContainer: HTMLDivElement;
    protected splitPanel: SplitPanel | undefined;
    protected canvasWidget: Widget | undefined;
    protected textWidget: Widget | undefined;
    protected modeToolbar: HTMLDivElement;
    protected canvasModeButton: HTMLButtonElement | undefined;
    protected textModeButton: HTMLButtonElement | undefined;
    protected splitModeButton: HTMLButtonElement | undefined;
    protected splitSwapButton: HTMLButtonElement | undefined;

    protected _mode: OzwEditorMode = 'canvas';
    protected _splitViewOrder: SplitViewOrder = 'canvas-first';
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
    protected _isSyncingToText = false;
    protected _syncToTextTimeout: number | undefined;
    protected _syncFromTextTimeout: number | undefined;
    protected _refreshTimeout: number | undefined;
    protected _lastResizeDimensions: { width: number; height: number } | undefined;
    protected _resizeObserver: ResizeObserver | undefined;
    protected _lastEditSource: 'text' | 'visual' = 'visual';

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
            console.log('🔄 Mode changed from', this._mode, 'to', mode);
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

        // Show toolbox by default when initialized
        await this.showToolbox();
    }

    protected async initializeEditor(): Promise<void> {
        // Create a full-featured inline editor that won't open as a separate tab
        const editorNode = document.createElement('div');
        editorNode.style.width = '100%';
        editorNode.style.height = '100%';
        editorNode.style.overflow = 'hidden';
        editorNode.style.position = 'relative';
        this.textEditorContainer.appendChild(editorNode);

        // Use createInline which sets suppressOpenEditorWhenDirty = true to prevent opening as separate tab
        // Use automaticLayout: true but with controlled refresh to prevent flickering
        const editor = await this.editorProvider.createInline(this._uri, editorNode, {
            language: 'json',
            automaticLayout: true, // Re-enabled but we'll control refresh timing
            wordWrap: 'off',
            lineNumbers: 'on',
            folding: true, // Enable code folding for JSON
            minimap: {
                enabled: true // Enable minimap/code navigator
            },
            scrollBeyondLastLine: false,
            scrollbar: {
                vertical: 'auto', // Enable vertical scrollbar
                horizontal: 'auto', // Enable horizontal scrollbar
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false
            },
            overviewRulerLanes: 3,
            overviewRulerBorder: true,
            selectionHighlight: true,
            renderLineHighlight: 'all',
            fixedOverflowWidgets: true,
            acceptSuggestionOnEnter: 'smart'
        });

        this.textEditor = editor;
        this.toDisposeOnEditor.push(editor);
        this.toDisposeOnEditor.push(editor.onDocumentContentChanged(() => {
            // Only mark as dirty if the change came from user editing, not from sync
            if (!this._isSyncingToText) {
                console.log('📝 Text editor content changed, mode:', this._mode, 'isSyncingToText:', this._isSyncingToText);
                this._lastEditSource = 'text';
                this.dirty = true;
                // Use debounced sync in split mode for real-time updates, immediate sync in other modes
                if (this._mode === 'split') {
                    console.log('🔄 Calling debouncedSyncFromText()');
                    this.debouncedSyncFromText();
                } else {
                    console.log('🔄 Calling syncFromText()');
                    this.syncFromText();
                }
            } else {
                console.log('⏭️ Skipping sync - isSyncingToText is true');
            }
        }));
    }

    protected setupResizeObserver(container: HTMLElement): void {
        // Disconnect existing observer if any
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }

        // Create new ResizeObserver with debouncing to prevent excessive refreshes
        // This helps prevent flickering when automaticLayout is enabled
        this._resizeObserver = new ResizeObserver((entries) => {
            // Only refresh if editor exists and is in split mode
            if (!this.textEditor || this._mode !== 'split') {
                return;
            }

            // Debounce refresh calls to prevent rapid successive refreshes
            if (this._refreshTimeout !== undefined) {
                clearTimeout(this._refreshTimeout);
            }

            this._refreshTimeout = window.setTimeout(() => {
                if (this.textEditor && this._mode === 'split') {
                    // Only refresh if container is actually visible
                    const rect = container.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        this.textEditor.refresh();
                    }
                }
                this._refreshTimeout = undefined;
            }, 100); // Increased delay to batch resize events and reduce flickering
        });

        this._resizeObserver.observe(container);
    }

    @postConstruct()
    protected init(): void {
        this.addClass('ozw-editor-widget');
        this.toDispose.push(this.toDisposeOnEditor);
        this.toDispose.push(this.onDirtyChangedEmitter);

        // Cleanup timeouts and observers on dispose
        this.toDispose.push({
            dispose: () => {
                if (this._syncToTextTimeout !== undefined) {
                    clearTimeout(this._syncToTextTimeout);
                    this._syncToTextTimeout = undefined;
                }
                if (this._syncFromTextTimeout !== undefined) {
                    clearTimeout(this._syncFromTextTimeout);
                    this._syncFromTextTimeout = undefined;
                }
                if (this._refreshTimeout !== undefined) {
                    clearTimeout(this._refreshTimeout);
                    this._refreshTimeout = undefined;
                }
                if (this._resizeObserver) {
                    this._resizeObserver.disconnect();
                    this._resizeObserver = undefined;
                }
            }
        });

        // Make widget focusable only when needed (not always, to avoid interfering with tab selection)
        // Use tabIndex = -1 initially, and set to 0 only when widget is active
        // CRITICAL: Keep tabIndex = -1 to prevent text cursor from appearing on tabs
        this.node.tabIndex = -1;
        // Ensure focus can be received when needed
        this.node.setAttribute('aria-label', 'OZW Visual Editor');
        // Add keyboard listener for delete and escape
        // Only handle if the widget is actually focused
        this.node.addEventListener('keydown', (e) => {
            // Only process if this widget is focused
            if (document.activeElement !== this.node && !this.node.contains(document.activeElement)) {
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedComponentId) {
                e.preventDefault();
                this.deleteComponent(this._selectedComponentId);
            } else if (e.key === 'Escape' && this._selectedComponentId) {
                e.preventDefault();
                this.deselectComponent();
            }
        });

        // Create mode toolbar
        this.modeToolbar = document.createElement('div');
        this.modeToolbar.className = 'ozw-mode-toolbar';

        this.canvasModeButton = this.createModeToolbarButton('Canvas', codicon('layout'), 'canvas');
        this.textModeButton = this.createModeToolbarButton('Text', codicon('code'), 'text');
        this.splitModeButton = this.createModeToolbarButton('Split', codicon('split-horizontal'), 'split');
        this.splitSwapButton = this.createIconToolbarButton('Swap panes', codicon('arrow-swap'), () => this.toggleSplitViewOrder());
        this.splitSwapButton.classList.add('ozw-split-swap-button');

        this.modeToolbar.appendChild(this.canvasModeButton);
        this.modeToolbar.appendChild(this.textModeButton);
        this.modeToolbar.appendChild(this.splitModeButton);
        this.modeToolbar.appendChild(this.splitSwapButton);

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
        // Make focusable when activated and focus it
        // But keep cursor as default to prevent I-beam cursor
        this.node.tabIndex = 0;
        this.node.style.cursor = 'default';
        this.node.focus({ preventScroll: true });
    }

    protected createModeToolbarButton(label: string, iconClass: string, mode: OzwEditorMode): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'ozw-btn ozw-btn--ghost ozw-btn--icon ozw-btn--sm ozw-mode-button';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = `<span class="${iconClass}"></span>`;
        btn.onclick = () => this.mode = mode;
        return btn;
    }

    protected createIconToolbarButton(label: string, iconClass: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'ozw-btn ozw-btn--ghost ozw-btn--icon ozw-btn--sm ozw-mode-button';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = `<span class="${iconClass}"></span>`;
        btn.onclick = () => onClick();
        return btn;
    }

    protected updateLayout(): void {
        // Dispose split panel if exists and preserve containers
        if (this.splitPanel) {
            // Disconnect resize observer when leaving split mode
            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = undefined;
            }

            // Remove widgets from split panel before disposing to preserve nodes
            if (this.canvasWidget && this.splitPanel.widgets.indexOf(this.canvasWidget) !== -1) {
                this.splitPanel.layout?.removeWidget(this.canvasWidget);
            }
            if (this.textWidget && this.splitPanel.widgets.indexOf(this.textWidget) !== -1) {
                this.splitPanel.layout?.removeWidget(this.textWidget);
            }

            // Detach the split panel from the DOM first
            Widget.detach(this.splitPanel);

            // Dispose the split panel
            this.splitPanel.dispose();
            this.splitPanel = undefined;

            // Don't dispose the widgets - we want to reuse them
            // Just ensure containers are in the main node
            if (!this.canvasContainer.parentElement) {
                this.node.appendChild(this.canvasContainer);
            }
            if (!this.textEditorContainer.parentElement) {
                this.node.appendChild(this.textEditorContainer);
            }
        }

        // Hide all containers first
        this.canvasContainer.style.display = 'none';
        this.textEditorContainer.style.display = 'none';

        // Ensure containers are always in the DOM before showing them
        if (!this.canvasContainer.parentElement) {
            this.node.appendChild(this.canvasContainer);
        }
        if (!this.textEditorContainer.parentElement) {
            this.node.appendChild(this.textEditorContainer);
        }

        switch (this._mode) {
            case 'canvas':
                this.canvasContainer.style.display = 'flex';
                // If the user last edited the JSON, make sure we apply it before rendering the canvas.
                // This also flushes any pending debounced sync in split mode.
                if (this.textEditor && this._lastEditSource === 'text') {
                    this.syncFromText({ renderCanvas: false, updateProperties: true });
                }
                // Re-render canvas when switching back to canvas mode
                this.renderCanvas();
                break;
            case 'text':
                this.textEditorContainer.style.display = 'block';
                if (this.textEditor) {
                    // Sync document to text editor before showing
                    this.syncToText();
                    // Use requestAnimationFrame to ensure the container is visible before refreshing
                    requestAnimationFrame(() => {
                        this.textEditor?.refresh();
                    });
                }
                break;
            case 'split':
                this.setupSplitView();
                break;
        }

        this.updateModeToolbarState();
    }

    protected setupSplitView(): void {
        // Ensure containers are in the main node before creating split panel
        if (!this.canvasContainer.parentElement) {
            this.node.appendChild(this.canvasContainer);
        }
        if (!this.textEditorContainer.parentElement) {
            this.node.appendChild(this.textEditorContainer);
        }

        this.splitPanel = new SplitPanel({ orientation: 'horizontal', spacing: 4 });
        this.splitPanel.id = 'ozw-split-panel';

        // Create widgets if they don't exist, otherwise reuse them
        if (!this.canvasWidget) {
            this.canvasWidget = new Widget({ node: this.canvasContainer });
        }
        if (!this.textWidget) {
            this.textWidget = new Widget({ node: this.textEditorContainer });
        }

        this.canvasContainer.style.display = 'flex';
        this.textEditorContainer.style.display = 'block';

        // Sync document to text editor when entering split mode
        if (this.textEditor) {
            console.log('🔄 setupSplitView: Syncing document to text editor');
            this.syncToText();
        }

        // Re-render canvas for split view
        this.renderCanvas();

        // Sync document to text editor
        if (this.textEditor) {
            this.syncToText();
        }

        if (this._splitViewOrder === 'canvas-first') {
            if (this.canvasWidget) {
                this.splitPanel.addWidget(this.canvasWidget);
            }
            if (this.textWidget) {
                this.splitPanel.addWidget(this.textWidget);
            }
        } else {
            if (this.textWidget) {
                this.splitPanel.addWidget(this.textWidget);
            }
            if (this.canvasWidget) {
                this.splitPanel.addWidget(this.canvasWidget);
            }
        }
        this.splitPanel.setRelativeSizes([1, 1]);

        Widget.attach(this.splitPanel, this.node);

        // Setup resize observer and refresh editor when entering split mode
        if (this.textEditorContainer && this.textEditor) {
            // Find the actual editor node inside the container
            const editorNode = this.textEditorContainer.querySelector('div[class*="monaco"]') as HTMLElement || this.textEditorContainer;

            // Wait for split panel to settle before setting up observer and refreshing
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Setup observer to help control refresh timing
                    this.setupResizeObserver(editorNode);
                    // Force initial refresh to ensure editor is properly sized
                    this.textEditor?.refresh();
                });
            });
        }
    }

    protected updateModeToolbarState(): void {
        const setActive = (btn: HTMLButtonElement | undefined, active: boolean) => {
            if (!btn) {
                return;
            }
            if (active) {
                btn.classList.add('ozw-mode-button--active');
            } else {
                btn.classList.remove('ozw-mode-button--active');
            }
        };

        setActive(this.canvasModeButton, this._mode === 'canvas');
        setActive(this.textModeButton, this._mode === 'text');
        setActive(this.splitModeButton, this._mode === 'split');

        if (this.splitSwapButton) {
            const isVisible = this._mode === 'split';
            this.splitSwapButton.style.display = isVisible ? 'inline-flex' : 'none';
        }
    }

    protected toggleSplitViewOrder(): void {
        this._splitViewOrder = this._splitViewOrder === 'canvas-first' ? 'code-first' : 'canvas-first';

        // If we're currently in split mode, rebuild the split panel with the new order.
        if (this._mode === 'split') {
            this.rebuildSplitView();
        }
    }

    protected rebuildSplitView(): void {
        if (!this.splitPanel) {
            this.setupSplitView();
            return;
        }

        // Disconnect resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = undefined;
        }

        // Remove widgets from split panel before disposing to preserve nodes
        if (this.canvasWidget && this.splitPanel.widgets.indexOf(this.canvasWidget) !== -1) {
            this.splitPanel.layout?.removeWidget(this.canvasWidget);
        }
        if (this.textWidget && this.splitPanel.widgets.indexOf(this.textWidget) !== -1) {
            this.splitPanel.layout?.removeWidget(this.textWidget);
        }

        Widget.detach(this.splitPanel);
        this.splitPanel.dispose();
        this.splitPanel = undefined;

        // Ensure containers are back in the main node before re-attaching split panel
        if (!this.canvasContainer.parentElement) {
            this.node.appendChild(this.canvasContainer);
        }
        if (!this.textEditorContainer.parentElement) {
            this.node.appendChild(this.textEditorContainer);
        }

        this.setupSplitView();
        this.updateModeToolbarState();
    }

    protected renderCanvas(): void {
        console.log('🎨 renderCanvas: Starting render');
        console.log('📊 renderCanvas: Document state:', {
            treeLength: this._document.schema.tree.length,
            componentsCount: this._document.components.length,
            metadataKeys: Object.keys(this._document.schema.metadata).length
        });

        // Ensure canvas container is in the DOM and visible
        if (!this.canvasContainer.parentElement) {
            this.node.appendChild(this.canvasContainer);
        }

        // Clear previous content
        this.canvasContainer.innerHTML = '';
        console.log('🧹 renderCanvas: Canvas cleared');

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

        // Click handler to deselect when clicking on empty space and ensure focus
        workspace.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Don't interfere with clicks outside the widget (like tab selection)
            if (!this.node.contains(target)) {
                return;
            }

            // Deselect if clicking directly on workspace or empty state
            // But not if clicking on a component or its children
            if (target === workspace ||
                target.classList.contains('ozw-empty-state') ||
                target.closest('.ozw-empty-state')) {
                // Check if we're not clicking on a component
                if (!target.closest('.ozw-component')) {
                    this.deselectComponent();
                }
            }
            // Only focus if clicking inside the widget and it's not already focused
            // Use a small delay to avoid interfering with tab selection
            if (this.node.contains(target) && !this.node.contains(document.activeElement)) {
                setTimeout(() => {
                    if (this.node.contains(document.activeElement) || document.activeElement === this.node) {
                        return; // Already focused or something else got focus
                    }
                    this.node.tabIndex = 0;
                    this.node.focus();
                }, 10);
            }
        });

        // Also ensure focus when clicking on canvas container, but only if click is inside
        this.canvasContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // Don't interfere with clicks outside
            if (!this.node.contains(target)) {
                return;
            }
            // Only focus if not already focused and click is inside widget
            if (this.node.contains(target) && !this.node.contains(document.activeElement)) {
                setTimeout(() => {
                    if (this.node.contains(document.activeElement) || document.activeElement === this.node) {
                        return;
                    }
                    this.node.tabIndex = 0;
                    this.node.focus();
                }, 10);
            }
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
            console.log('🌳 renderCanvas: Rendering', this._document.schema.tree.length, 'tree nodes');
            this._document.schema.tree.forEach((node, index) => {
                console.log(`🌳 renderCanvas: Rendering node ${index}:`, {
                    id: node.id,
                    type: node.type,
                    metadataLabel: this._document.schema.metadata[node.id]?.label
                });
                const element = this.createTreeNodeElement(node);
                workspace.appendChild(element);
            });
        }

        this.canvasContainer.appendChild(workspace);
        console.log('✅ renderCanvas: Render completed');
    }

    protected createTreeNodeElement(node: TreeNode, depth: number = 0, parentType: string | undefined = undefined): HTMLDivElement {
        const element = document.createElement('div');
        element.className = `ozw-component ozw-component-${node.type}`;
        element.setAttribute('data-component-id', node.id);
        element.setAttribute('data-component-type', node.type);
        element.draggable = true;

        const metadata = this._document.schema.metadata[node.id] || {};
        const isContainer = this.canHaveChildren(node.type);
        let childrenHost: HTMLDivElement | null = null;

        applyFlexChildSizing(
            element,
            node.type,
            metadata as ComponentMetadata,
            parentType === 'row' || parentType === 'column' ? parentType : undefined
        );

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
            element.style.gap = '6px'; // header + content
            element.style.padding = '12px';
            element.style.border = '2px dashed #007acc';
            element.style.borderRadius = '4px';
            element.style.minHeight = '100px';
            element.style.minWidth = '100px';
            element.style.backgroundColor = 'rgba(0, 122, 204, 0.05)';

            // Header (discreet) + content host
            const header = document.createElement('div');
            header.className = 'ozw-container-label ozw-layout-header ozw-layout-header--column';
            const typeName = 'Columna';
            const displayName = typeof metadata.label === 'string' ? metadata.label.trim() : '';
            header.textContent = displayName && displayName !== typeName ? `${typeName}: ${displayName}` : typeName;
            element.appendChild(header);

            const content = document.createElement('div');
            content.className = 'ozw-layout-content ozw-layout-content--column';
            element.appendChild(content);
            childrenHost = content;
        } else if (node.type === 'row') {
            element.style.position = 'relative';
            element.style.display = 'flex';
            element.style.flexDirection = 'column';
            element.style.gap = '6px'; // header + content
            element.style.padding = '8px 10px';
            element.style.border = '2px dashed #10a37f';
            element.style.borderRadius = '4px';
            element.style.minHeight = 'auto';
            element.style.minWidth = '100px';
            element.style.backgroundColor = 'rgba(16, 163, 127, 0.05)';

            // Header row above items (more harmonious)
            const header = document.createElement('div');
            header.className = 'ozw-container-label ozw-layout-header ozw-layout-header--row';
            const typeName = 'Fila';
            const displayName = typeof metadata.label === 'string' ? metadata.label.trim() : '';
            header.textContent = displayName && displayName !== typeName ? `${typeName}: ${displayName}` : typeName;
            element.appendChild(header);

            const content = document.createElement('div');
            content.className = 'ozw-layout-content ozw-layout-content--row';
            element.appendChild(content);
            childrenHost = content;
        } else {
            // Leaf components (button, input, text, image, etc.)
            element.style.position = 'relative';
            element.style.padding = '8px 16px';
            element.style.cursor = 'move';
            renderLeafDom(
                element,
                node.type,
                metadata as ComponentMetadata,
                parentType === 'row' || parentType === 'column' ? parentType : undefined
            );

            // Optional alignment controls for leaf widgets (align content inside its slot).
            this.applyLeafAlignment(element, metadata as ComponentMetadata);
        }

        // Optional explicit sizing (applies to containers + leaves).
        this.applyExplicitSizing(element, metadata as ComponentMetadata);

        // Recursively render children for containers
        if (node.children && node.children.length > 0) {
            node.children.forEach(childNode => {
                const childElement = this.createTreeNodeElement(childNode, depth + 1, node.type);
                (childrenHost ?? element).appendChild(childElement);
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
            (childrenHost ?? element).appendChild(placeholder);
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

    protected applyExplicitSizing(element: HTMLDivElement, metadata: ComponentMetadata): void {
        if (typeof metadata.width === 'string' && metadata.width.trim().length > 0) {
            element.style.width = metadata.width.trim();
        }
        if (typeof metadata.height === 'string' && metadata.height.trim().length > 0) {
            element.style.height = metadata.height.trim();
        }
    }

    protected applyLeafAlignment(element: HTMLDivElement, metadata: ComponentMetadata): void {
        const hasAlignH = metadata.alignH === 'start' || metadata.alignH === 'center' || metadata.alignH === 'end';
        const hasAlignV = metadata.alignV === 'start' || metadata.alignV === 'center' || metadata.alignV === 'end';
        if (!hasAlignH && !hasAlignV) {
            return;
        }

        const inner = document.createElement('div');
        inner.className = 'ozw-leaf-inner';
        while (element.firstChild) {
            inner.appendChild(element.firstChild);
        }
        element.appendChild(inner);

        element.style.display = 'flex';
        if (hasAlignH) {
            element.style.justifyContent = metadata.alignH === 'center' ? 'center' : metadata.alignH === 'end' ? 'flex-end' : 'flex-start';
        }
        if (hasAlignV) {
            element.style.alignItems = metadata.alignV === 'center' ? 'center' : metadata.alignV === 'end' ? 'flex-end' : 'flex-start';
        }
    }

    protected canHaveChildren(type: string): boolean {
        return type === 'column' || type === 'row';
    }

    protected syncFromText(options?: { renderCanvas?: boolean; updateProperties?: boolean }): boolean {
        if (!this.textEditor) {
            console.log('⚠️ syncFromText: No text editor');
            return false;
        }
        try {
            const content = this.textEditor.document.getText().trim();
            console.log('📥 syncFromText: Content length:', content.length);

            // Skip if content is empty
            if (!content) {
                console.log('⚠️ syncFromText: Content is empty');
                return false;
            }

            // Validate JSON before parsing
            let parsed: any;
            try {
                parsed = JSON.parse(content);
            } catch (parseError) {
                // Invalid JSON - don't update document, but don't break the flow
                console.warn('❌ Invalid JSON in text editor, skipping sync:', parseError);
                return false;
            }

            console.log('✅ syncFromText: JSON parsed successfully');
            console.log('📋 syncFromText: Parsed structure:', {
                hasVersion: !!parsed.version,
                hasComponents: !!parsed.components,
                hasSchema: !!parsed.schema,
                componentsCount: parsed.components?.length || 0,
                treeLength: parsed.schema?.tree?.length || 0,
                metadataKeys: parsed.schema?.metadata ? Object.keys(parsed.schema.metadata).length : 0
            });

            // Ensure schema exists for backwards compatibility
            if (!parsed.schema) {
                parsed.schema = { tree: [], metadata: {} };
            }

            // Ensure schema.tree is an array
            if (!Array.isArray(parsed.schema.tree)) {
                parsed.schema.tree = [];
            }

            // Ensure schema.metadata is an object
            if (!parsed.schema.metadata || typeof parsed.schema.metadata !== 'object') {
                parsed.schema.metadata = {};
            }

            // Ensure components array exists
            if (!Array.isArray(parsed.components)) {
                parsed.components = [];
            }

            // Ensure version exists
            if (!parsed.version) {
                parsed.version = '1.0';
            }

            // CRITICAL: Sync schema.metadata from components array
            // When editing JSON, users might only update components[].properties
            // but renderCanvas() uses schema.metadata, so we need to sync them
            if (Array.isArray(parsed.components)) {
                parsed.components.forEach((component: OzwComponent) => {
                    if (component.id && component.properties) {
                        // Ensure metadata entry exists for this component
                        if (!parsed.schema.metadata[component.id]) {
                            parsed.schema.metadata[component.id] = {};
                        }
                        // Sync all properties from components to metadata
                        Object.assign(parsed.schema.metadata[component.id], component.properties);
                    }
                });
                console.log('🔄 syncFromText: Synced schema.metadata from components array');
            }

            // Update document
            this._document = parsed as OzwDocument;
            console.log('✅ syncFromText: Document updated');
            console.log('📊 syncFromText: Document structure:', {
                version: this._document.version,
                componentsCount: this._document.components.length,
                treeLength: this._document.schema.tree.length,
                metadataKeys: Object.keys(this._document.schema.metadata).length
            });

            // Log a sample to verify metadata is correct
            if (this._document.components.length > 0) {
                const firstComponent = this._document.components[0];
                console.log('🔍 syncFromText: Sample component:', {
                    id: firstComponent.id,
                    type: firstComponent.type,
                    propertiesLabel: firstComponent.properties?.label,
                    metadataLabel: this._document.schema.metadata[firstComponent.id]?.label
                });
            }

            const updateProperties = options?.updateProperties !== false;
            if (updateProperties && this._selectedComponentId) {
                const selectedId = this._selectedComponentId;
                const exists = this._document.components.some(c => c.id === selectedId);
                if (exists) {
                    // Keep the properties panel in sync with the new JSON.
                    void this.updatePropertiesWidget(selectedId);
                } else {
                    // Selected component no longer exists: clear selection and show toolbox.
                    this._selectedComponentId = null;
                    void this.showToolbox();
                }
            }

            const renderCanvas = options?.renderCanvas !== false;
            // Re-render canvas if in canvas or split mode (unless explicitly disabled)
            // Use requestAnimationFrame to ensure DOM is ready
            if (renderCanvas) {
                if (this._mode === 'canvas' || this._mode === 'split') {
                    console.log('🎨 syncFromText: Scheduling canvas render, mode:', this._mode);
                    requestAnimationFrame(() => {
                        console.log('🎨 syncFromText: Executing canvas render now');
                        this.renderCanvas();
                        console.log('✅ syncFromText: Canvas render completed');
                    });
                } else {
                    console.log('⏭️ syncFromText: Skipping canvas render, mode is:', this._mode);
                }
            }
            return true;
        } catch (e) {
            // Invalid JSON or other error - don't update, but don't break the flow
            console.error('❌ Error syncing from text editor:', e);
            console.error('❌ Error stack:', e instanceof Error ? e.stack : 'No stack trace');
            return false;
        }
    }

    protected syncToText(): void {
        if (!this.textEditor) {
            console.log('⚠️ syncToText: No text editor');
            return;
        }
        const content = JSON.stringify(this._document, null, 2);
        const currentContent = this.textEditor.document.getText();

        if (content === currentContent) {
            console.log('⏭️ syncToText: No changes, skipping update');
            return; // No changes, skip update
        }

        console.log('📤 syncToText: Updating text editor, content length:', content.length);

        // Save cursor position and selection before updating
        const editor = this.textEditor.getControl();
        const position = editor.getPosition();
        const selection = editor.getSelection();

        this._isSyncingToText = true;
        try {
            const model = this.textEditor.document.textEditorModel;
            const fullRange = model.getFullModelRange();

            // Use pushEditOperations for better cursor preservation
            model.pushEditOperations(
                [],
                [{
                    range: fullRange,
                    text: content
                }],
                () => null
            );

            console.log('✅ syncToText: Text editor updated');

            // Restore cursor position if still valid
            if (position) {
                const lineCount = model.getLineCount();
                if (lineCount >= position.lineNumber) {
                    const newPosition = {
                        lineNumber: Math.min(position.lineNumber, lineCount),
                        column: Math.min(position.column, model.getLineMaxColumn(position.lineNumber))
                    };
                    editor.setPosition(newPosition);

                    // Restore selection if it was a range selection
                    if (selection && !selection.isEmpty()) {
                        const startLine = Math.min(selection.startLineNumber, lineCount);
                        const endLine = Math.min(selection.endLineNumber, lineCount);
                        if (startLine > 0 && endLine > 0) {
                            editor.setSelection({
                                startLineNumber: startLine,
                                startColumn: selection.startColumn,
                                endLineNumber: endLine,
                                endColumn: selection.endColumn
                            });
                        }
                    }
                }
            }
        } finally {
            // Reset flag after a short delay to allow the event to process
            // Use a slightly longer delay to ensure the onDocumentContentChanged event has time to check the flag
            setTimeout(() => {
                this._isSyncingToText = false;
                console.log('✅ syncToText: isSyncingToText flag reset');
            }, 10);
        }
    }

    protected debouncedSyncToText(): void {
        if (this._syncToTextTimeout !== undefined) {
            clearTimeout(this._syncToTextTimeout);
        }
        console.log('⏱️ debouncedSyncToText: Scheduling sync in 100ms');
        this._syncToTextTimeout = window.setTimeout(() => {
            console.log('⏱️ debouncedSyncToText: Executing sync now');
            this.syncToText();
            this._syncToTextTimeout = undefined;
        }, 100);
    }

    protected debouncedSyncFromText(): void {
        if (this._syncFromTextTimeout !== undefined) {
            clearTimeout(this._syncFromTextTimeout);
        }
        console.log('⏱️ debouncedSyncFromText: Scheduling sync in 100ms');
        this._syncFromTextTimeout = window.setTimeout(() => {
            console.log('⏱️ debouncedSyncFromText: Executing sync now');
            this.syncFromText();
            this._syncFromTextTimeout = undefined;
        }, 100);
    }

    /**
     * Sync document to text editor, using debounce in split mode for real-time updates
     */
    protected syncToTextIfNeeded(): void {
        console.log('🔄 syncToTextIfNeeded: Mode is', this._mode);
        // All callers of this method are visual (canvas/properties) edits.
        this._lastEditSource = 'visual';
        if (this._mode === 'split') {
            // Use debounced sync in split mode for real-time bidirectional updates
            console.log('⏱️ syncToTextIfNeeded: Using debounced sync');
            this.debouncedSyncToText();
        } else {
            // Use immediate sync in other modes
            console.log('⚡ syncToTextIfNeeded: Using immediate sync');
            this.syncToText();
        }
    }

    async save(): Promise<void> {
        if (!this._uri) {
            return;
        }

        // If we have a text editor, the file content should always come from it.
        // Decide the direction of sync based on where the last user edit happened.
        if (this.textEditor) {
            if (this._lastEditSource === 'text') {
                // Apply the JSON edits to the internal model so canvas/properties stay consistent.
                const ok = this.syncFromText({ renderCanvas: false, updateProperties: true });
                if (!ok) {
                    void this.messageService.error('No se puede guardar: el JSON es inválido. Corregilo antes de guardar.');
                    throw new Error('Invalid JSON - cannot save OZW');
                }
                // IMPORTANT: do NOT call syncToText() here, it would overwrite what the user typed.
            } else {
                // Visual edits: ensure the editor reflects the current document before saving.
                this.syncToText();
            }
        }

        // Get the current content (from text editor if available, otherwise from document)
        const content = this.textEditor
            ? this.textEditor.document.getText()
            : JSON.stringify(this._document, null, 2);

        // Save directly to file
        try {
            await this.fileService.write(this._uri, content);
            this.dirty = false;
        } catch (error) {
            console.error('Failed to save file:', error);
            throw error;
        }
    }

    async revert(options?: Saveable.RevertOptions): Promise<void> {
        if (!this._uri) {
            return;
        }

        try {
            // Read file content
            const resource = await this.fileService.read(this._uri);
            const content = resource.value;

            // Parse and update document
            this._document = JSON.parse(content);
            if (!this._document.schema) {
                this._document.schema = { tree: [], metadata: {} };
            }

            // Sync to text editor if available
            if (this.textEditor) {
                this.textEditor.document.textEditorModel.setValue(content);
            }

            // Re-render canvas if in canvas or split mode
            if (this._mode === 'canvas' || this._mode === 'split') {
                this.renderCanvas();
            }

            this.dirty = false;
        } catch (error) {
            console.error('Failed to revert file:', error);
            throw error;
        }
    }

    createSnapshot(): Saveable.Snapshot {
        const value = this.textEditor
            ? this.textEditor.document.getText()
            : JSON.stringify(this._document);
        return {
            value,
            read: () => value
        };
    }

    applySnapshot(snapshot: object): void {
        if ('value' in snapshot && typeof snapshot.value === 'string') {
            try {
                if (this.textEditor) {
                    // Apply snapshot to the text model, then re-sync into the document.
                    this._isSyncingToText = true;
                    try {
                        this.textEditor.document.textEditorModel.setValue(snapshot.value);
                    } finally {
                        setTimeout(() => {
                            this._isSyncingToText = false;
                        }, 10);
                    }
                    this._lastEditSource = 'text';
                    this.syncFromText({ renderCanvas: true, updateProperties: true });
                } else {
                    this._document = JSON.parse(snapshot.value);
                    this.renderCanvas();
                }
            } catch (e) {
                console.error('Failed to apply snapshot:', e);
            }
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);

        // Only refresh if dimensions actually changed to prevent flickering
        const currentWidth = msg.width;
        const currentHeight = msg.height;
        const hasChanged = !this._lastResizeDimensions ||
            this._lastResizeDimensions.width !== currentWidth ||
            this._lastResizeDimensions.height !== currentHeight;

        if (hasChanged) {
            this._lastResizeDimensions = { width: currentWidth, height: currentHeight };

            // Update split panel immediately
            if (this.splitPanel) {
                this.splitPanel.update();
            }

            // Debounce editor refresh calls to prevent rapid successive refreshes
            // The ResizeObserver will handle editor refresh in split mode
            if (this._mode !== 'split') {
                // In non-split modes, refresh immediately (automaticLayout handles it)
                if (this.textEditor) {
                    this.textEditor.refresh();
                }
            }
            // In split mode, let the ResizeObserver handle the refresh with its debouncing
        }
    }

    // StatefulWidget implementation
    storeState(): object {
        return {
            uri: this._uri.toString(),
            mode: this._mode,
            splitViewOrder: this._splitViewOrder
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

            if ('splitViewOrder' in oldState && (oldState as any).splitViewOrder) {
                const order = (oldState as any).splitViewOrder;
                if (order === 'canvas-first' || order === 'code-first') {
                    this._splitViewOrder = order;
                }
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
            // Container (Column/Row):
            // - allow dropping INSIDE when hovering the "center"
            // - allow dropping BEFORE/AFTER when hovering near the edges (so you can insert above the first row, etc.)
            const rect = target.getBoundingClientRect();
            const parentElement = target.parentElement;
            const isHorizontal = parentElement
                ? parentElement.classList.contains('ozw-layout-content--row')
                : false;
            const edge = this.getDropEdgeThreshold(rect, isHorizontal);
            const inBeforeZone = isHorizontal
                ? event.clientX < rect.left + edge
                : event.clientY < rect.top + edge;
            const inAfterZone = isHorizontal
                ? event.clientX > rect.right - edge
                : event.clientY > rect.bottom - edge;

            if (parentElement && (inBeforeZone || inAfterZone)) {
                // Relative insertion (before/after this container in its parent)
                this.showDropIndicator(target, event);
                target.classList.remove('ozw-drop-target');
            } else {
                // Default: drop inside container
                this._dropPosition = 'inside';
                target.classList.add('ozw-drop-target');
                this.removeDropIndicator();
            }
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
            this.addComponent(type, null);
        } else if (targetId && targetType) {
            const dropPos = this._dropPosition ?? 'after';

            // Layout container (Column/Row):
            // - if user is hovering the edge -> insert BEFORE/AFTER this container in its parent
            // - otherwise -> insert INSIDE the container
            if (this.canHaveChildren(targetType)) {
                if (dropPos === 'before' || dropPos === 'after') {
                    this.insertNewComponentRelativeToSmart(type, targetId, dropPos);
                    return;
                }
                this.addComponent(type, targetId);
                return;
            }

            // Leaf target: insert before/after the leaf itself (as sibling in its parent container).
            if (dropPos === 'before' || dropPos === 'after') {
                this.insertNewComponentRelativeToSmart(type, targetId, dropPos);
                return;
            }

            // Fallback (shouldn't happen): treat as 'after'
            this.insertNewComponentRelativeToSmart(type, targetId, 'after');
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
            properties: createDefaultMetadata(type)
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
        this.syncToTextIfNeeded();
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

        // Prefer a cheap class check over getComputedStyle on every dragover.
        // Fallback to computed style for non-layout parents.
        const isHorizontal = parentElement.classList.contains('ozw-layout-content--row')
            || window.getComputedStyle(parentElement).flexDirection === 'row';

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
                // If user is hovering the edge, allow BEFORE/AFTER the container (important for "before first row" cases).
                if (this._dropPosition === 'before' || this._dropPosition === 'after') {
                    this.insertComponentRelativeToSmart(componentId, targetId, this._dropPosition);
                } else {
                    // Remove from current location
                    const node = this.removeNodeFromTree(componentId, this._document.schema.tree);
                    if (!node) {
                        return;
                    }
                    // Target IS a layout - move INSIDE it
                    this.addNodeToParent(node, targetId, this._document.schema.tree);
                }
            } else {
                // Target is NOT a layout - insert before/after based on _dropPosition
                console.log('INSERTING:', componentId, this._dropPosition, 'target:', targetId);
                this.insertComponentRelativeToSmart(componentId, targetId, this._dropPosition || 'after');
            }
        }

        this.dirty = true;
        this.syncToTextIfNeeded();
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

    protected insertNewComponentRelativeToSmart(type: string, targetId: string, position: 'before' | 'after'): void {
        const targetInfo = this.findNodeWithParent(targetId, this._document.schema.tree);
        if (!targetInfo) {
            console.error('Could not find target for insertion');
            return;
        }

        const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const component: OzwComponent = {
            id,
            type,
            properties: createDefaultMetadata(type)
        };

        // Add to components + metadata first (tree references this id)
        this._document.components.push(component);
        this._document.schema.metadata[id] = component.properties;

        const newNode: TreeNode = { id, type, children: this.canHaveChildren(type) ? [] : undefined };

        const targetArray = targetInfo.parentArray;
        const targetIndex = targetInfo.index;
        if (position === 'before') {
            targetArray.splice(targetIndex, 0, newNode);
        } else {
            targetArray.splice(targetIndex + 1, 0, newNode);
        }

        this.dirty = true;
        this.syncToTextIfNeeded();
        this.renderCanvas();
    }

    protected getDropEdgeThreshold(rect: DOMRect, isHorizontal: boolean): number {
        const size = isHorizontal ? rect.width : rect.height;
        // A small "edge zone" feels natural: not too small to miss, not too large to block "inside" drops.
        return Math.max(10, Math.min(24, size * 0.2));
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

    protected async deselectComponent(): Promise<void> {
        console.log('🔓 deselectComponent called');
        this._selectedComponentId = null;
        this.renderCanvas();

        // Show toolbox and hide properties
        await this.showToolbox();
    }

    protected async showToolbox(): Promise<void> {
        try {
            const toolboxWidget = await this.widgetManager.getOrCreateWidget<OzwToolboxWidget>(
                OzwToolboxWidget.ID
            );

            if (toolboxWidget) {
                // Add to shell if not already there
                if (!toolboxWidget.isAttached) {
                    await this.shell.addWidget(toolboxWidget, { area: 'right', rank: 500 });
                }

                // Activate the toolbox widget
                await this.shell.activateWidget(toolboxWidget.id);

                // Clear properties widget selection
                const propertiesWidget = await this.widgetManager.getOrCreateWidget<OzwPropertiesWidget>(
                    OzwPropertiesWidget.ID
                );
                if (propertiesWidget) {
                    propertiesWidget.setSelectedComponent(undefined, undefined, {}, undefined);
                }
            }
        } catch (error) {
            console.error('💥 Error in showToolbox:', error);
        }
    }

    protected async updatePropertiesWidget(componentId: string | null): Promise<void> {
        console.log('🔍 updatePropertiesWidget START for:', componentId);

        try {
            // If no component selected, show toolbox instead
            if (!componentId) {
                await this.showToolbox();
                return;
            }

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

                    propertiesWidget.setSelectedComponent(componentId, component.type, metadata, this._document.components.map(c => c.id));

                    // Setup property change listener
                    propertiesWidget.onPropertyChange(event => {
                        this.handlePropertyChange(event.componentId, event.property, event.value);
                    });

                    // Add to shell if not already there
                    if (!propertiesWidget.isAttached) {
                        console.log('➕ Adding widget to shell...');
                        await this.shell.addWidget(propertiesWidget, { area: 'right', rank: 200 });
                    }

                    // Activate the properties widget (this will hide toolbox)
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
        console.log('🔧 handlePropertyChange:', { componentId, property, value, mode: this._mode });

        if (property === '__renameId') {
            const newId = typeof value === 'string' ? value.trim() : '';
            if (newId.length > 0 && newId !== componentId) {
                this.renameComponentId(componentId, newId);
            }
            return;
        }

        // Update metadata
        if (!this._document.schema.metadata[componentId]) {
            this._document.schema.metadata[componentId] = {};
        }
        if (value === undefined) {
            delete this._document.schema.metadata[componentId][property];
        } else {
            this._document.schema.metadata[componentId][property] = value;
        }

        // Update component properties
        const component = this._document.components.find(c => c.id === componentId);
        if (component) {
            if (value === undefined) {
                delete component.properties[property];
            } else {
                component.properties[property] = value;
            }
            console.log('✅ handlePropertyChange: Component updated:', component);
        } else {
            console.warn('⚠️ handlePropertyChange: Component not found:', componentId);
        }

        // Mark as dirty and re-render
        this.dirty = true;
        console.log('🔄 handlePropertyChange: Calling syncToTextIfNeeded()');
        this.syncToTextIfNeeded();
        this.renderCanvas();
    }

    protected renameComponentId(oldId: string, newId: string): void {
        // Ensure uniqueness
        if (this._document.components.some(c => c.id === newId)) {
            this.messageService.warn(`El ID "${newId}" ya existe.`);
            return;
        }

        const component = this._document.components.find(c => c.id === oldId);
        if (!component) {
            return;
        }

        // Update components array
        component.id = newId;

        // Move metadata entry
        const existingMeta = this._document.schema.metadata[oldId];
        if (existingMeta) {
            this._document.schema.metadata[newId] = existingMeta;
            delete this._document.schema.metadata[oldId];
        } else if (!this._document.schema.metadata[newId]) {
            this._document.schema.metadata[newId] = {};
        }

        // Update tree ids
        const visit = (nodes: TreeNode[]): void => {
            for (const node of nodes) {
                if (node.id === oldId) {
                    node.id = newId;
                }
                if (node.children) {
                    visit(node.children);
                }
            }
        };
        visit(this._document.schema.tree);

        // Keep selection
        if (this._selectedComponentId === oldId) {
            this._selectedComponentId = newId;
        }

        this.dirty = true;
        this.syncToTextIfNeeded();
        this.renderCanvas();
        this.updatePropertiesWidget(newId);
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
        this.syncToTextIfNeeded();
        this.renderCanvas();

        console.log('Component deleted:', componentId);
    }
}
