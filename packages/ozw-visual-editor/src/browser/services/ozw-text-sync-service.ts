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

import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { OzwDocument } from '../model/ozw-types';
import { OzwDocumentSerializer } from './ozw-document-serializer';

export type EditSource = 'text' | 'visual';

export class OzwTextSyncService {
    protected isSyncingToText = false;
    protected syncToTextTimeout: number | undefined;
    protected syncFromTextTimeout: number | undefined;
    protected lastEditSource: EditSource = 'visual';

    constructor(protected readonly serializer: OzwDocumentSerializer) { }

    getLastEditSource(): EditSource {
        return this.lastEditSource;
    }

    /**
     * Call when a mutation originates from canvas/properties (not Monaco text).
     */
    markVisualEdit(): void {
        this.lastEditSource = 'visual';
    }

    markTextEdit(): void {
        this.lastEditSource = 'text';
    }

    /**
     * Apply external text (e.g. snapshot) without triggering sync loops.
     */
    applyTextSnapshot(editor: MonacoEditor, value: string): void {
        this.markTextEdit();
        this.isSyncingToText = true;
        try {
            editor.document.textEditorModel.setValue(value);
        } finally {
            setTimeout(() => {
                this.isSyncingToText = false;
            }, 10);
        }
    }

    /**
     * The widget should call this from Monaco's onDocumentContentChanged handler.
     * Returns the parsed+normalized document when valid; otherwise `undefined`.
     */
    handleTextDidChange(editor: MonacoEditor): OzwDocument | undefined {
        if (this.isSyncingToText) {
            return undefined;
        }
        this.lastEditSource = 'text';
        const content = editor.document.getText();
        const parsed = this.serializer.parse(content);
        if (!parsed.ok) {
            return undefined;
        }
        return parsed.doc;
    }

    syncToText(editor: MonacoEditor, doc: OzwDocument): void {
        const content = this.serializer.stringify(doc);
        const currentContent = editor.document.getText();
        if (content === currentContent) {
            return;
        }

        const control = editor.getControl();
        const position = control.getPosition();
        const selection = control.getSelection();

        this.isSyncingToText = true;
        try {
            const model = editor.document.textEditorModel;
            const fullRange = model.getFullModelRange();
            model.pushEditOperations(
                [],
                [{ range: fullRange, text: content }],
                // eslint-disable-next-line no-null/no-null
                () => null
            );

            if (position) {
                const lineCount = model.getLineCount();
                if (lineCount >= position.lineNumber) {
                    const safeLine = Math.min(position.lineNumber, lineCount);
                    const newPosition = {
                        lineNumber: safeLine,
                        column: Math.min(position.column, model.getLineMaxColumn(safeLine))
                    };
                    control.setPosition(newPosition);

                    if (selection && !selection.isEmpty()) {
                        const startLine = Math.min(selection.startLineNumber, lineCount);
                        const endLine = Math.min(selection.endLineNumber, lineCount);
                        if (startLine > 0 && endLine > 0) {
                            control.setSelection({
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
            // Delay reset so Monaco's change event can observe the flag.
            setTimeout(() => {
                this.isSyncingToText = false;
            }, 10);
        }
    }

    debouncedSyncToText(editor: MonacoEditor, doc: OzwDocument, delayMs: number = 100): void {
        if (this.syncToTextTimeout !== undefined) {
            clearTimeout(this.syncToTextTimeout);
        }
        this.syncToTextTimeout = window.setTimeout(() => {
            this.syncToText(editor, doc);
            this.syncToTextTimeout = undefined;
        }, delayMs);
    }

    debouncedSyncFromText(
        editor: MonacoEditor,
        onValidDocument: (doc: OzwDocument) => void,
        delayMs: number = 100
    ): void {
        if (this.syncFromTextTimeout !== undefined) {
            clearTimeout(this.syncFromTextTimeout);
        }
        this.syncFromTextTimeout = window.setTimeout(() => {
            const doc = this.handleTextDidChange(editor);
            if (doc) {
                onValidDocument(doc);
            }
            this.syncFromTextTimeout = undefined;
        }, delayMs);
    }

    dispose(): void {
        if (this.syncToTextTimeout !== undefined) {
            clearTimeout(this.syncToTextTimeout);
            this.syncToTextTimeout = undefined;
        }
        if (this.syncFromTextTimeout !== undefined) {
            clearTimeout(this.syncFromTextTimeout);
            this.syncFromTextTimeout = undefined;
        }
    }
}

