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
import { Emitter, Event } from '@theia/core/lib/common';
import type { BlueprintDocument, BlueprintNode } from '../../domain/entities/blueprint-types';

export interface BlueprintSelectionState {
    document: BlueprintDocument | null;
    documentUri: string | null;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
}

@injectable()
export class BlueprintSelectionService {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected _state: BlueprintSelectionState = {
        document: null,
        documentUri: null,
        selectedNodeId: null,
        selectedEdgeId: null
    };

    get state(): BlueprintSelectionState {
        return this._state;
    }

    get selectedNode(): BlueprintNode | null {
        const { document, selectedNodeId } = this._state;
        if (!document || !selectedNodeId) {
            return null;
        }
        return document.nodes.find(n => n.id === selectedNodeId) ?? null;
    }

    setState(
        document: BlueprintDocument | null,
        selectedNodeId: string | null,
        selectedEdgeId: string | null,
        documentUri?: string | null
    ): void {
        const uri = documentUri !== undefined ? documentUri : this._state.documentUri;
        const changed =
            this._state.document !== document ||
            this._state.documentUri !== uri ||
            this._state.selectedNodeId !== selectedNodeId ||
            this._state.selectedEdgeId !== selectedEdgeId;
        this._state = { document, documentUri: uri ?? null, selectedNodeId, selectedEdgeId };
        if (process.env.NODE_ENV !== 'production') {
            console.log('[BlueprintSelectionService] setState', {
                selectedNodeId,
                selectedEdgeId,
                documentUri: uri ?? null,
                hasDocument: !!document,
                nodeCount: document?.nodes?.length ?? 0,
                changed,
                selectedNode: this.selectedNode ? { id: this.selectedNode.id, type: this.selectedNode.type, label: this.selectedNode.label } : null
            });
        }
        if (changed) {
            this.onDidChangeEmitter.fire();
        }
    }
}
