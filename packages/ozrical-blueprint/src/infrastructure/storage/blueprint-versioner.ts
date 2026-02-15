// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { BlueprintDocument } from '../../domain/entities/blueprint-types';

export interface BlueprintVersionEntry {
    id: string;
    createdAt: number;
    label?: string;
    document: BlueprintDocument;
}

export interface IBlueprintVersioner {
    savePoint(document: BlueprintDocument, label?: string): Promise<string>;
    listVersions(): Promise<BlueprintVersionEntry[]>;
    getVersion(id: string): Promise<BlueprintDocument | undefined>;
    rollback(id: string): Promise<BlueprintDocument | undefined>;
}

/**
 * In-memory versioner for save points and rollback. Can be replaced with
 * file-based or backend storage (diffs or full copies).
 */
export class BlueprintVersioner implements IBlueprintVersioner {

    protected versions: BlueprintVersionEntry[] = [];
    protected idCounter = 0;

    async savePoint(document: BlueprintDocument, label?: string): Promise<string> {
        const id = `v${++this.idCounter}_${Date.now()}`;
        this.versions.push({
            id,
            createdAt: Date.now(),
            label,
            document: JSON.parse(JSON.stringify(document)) as BlueprintDocument
        });
        return id;
    }

    async listVersions(): Promise<BlueprintVersionEntry[]> {
        return [...this.versions].sort((a, b) => b.createdAt - a.createdAt);
    }

    async getVersion(id: string): Promise<BlueprintDocument | undefined> {
        const entry = this.versions.find(v => v.id === id);
        return entry ? (JSON.parse(JSON.stringify(entry.document)) as BlueprintDocument) : undefined;
    }

    async rollback(id: string): Promise<BlueprintDocument | undefined> {
        return this.getVersion(id);
    }
}
