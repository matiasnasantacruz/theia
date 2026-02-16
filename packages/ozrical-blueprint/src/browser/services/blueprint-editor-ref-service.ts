// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import type { BlueprintCommand } from '../../application/commands/blueprint-commands';

export interface BlueprintEditorCommandTarget {
    applyCommand(cmd: BlueprintCommand): void;
}

@injectable()
export class BlueprintEditorRefService {

    protected currentEditor: BlueprintEditorCommandTarget | null = null;

    setCurrentEditor(editor: BlueprintEditorCommandTarget | null): void {
        this.currentEditor = editor;
    }

    getCurrentEditor(): BlueprintEditorCommandTarget | null {
        return this.currentEditor;
    }

    applyCommand(cmd: BlueprintCommand): boolean {
        if (this.currentEditor) {
            this.currentEditor.applyCommand(cmd);
            return true;
        }
        return false;
    }
}
