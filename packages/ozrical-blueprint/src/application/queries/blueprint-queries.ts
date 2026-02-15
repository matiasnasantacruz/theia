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
import { validateGraph, type ValidationResult } from '../../domain/logic/graph-inference';

export function validarGrafo(doc: BlueprintDocument): ValidationResult {
    return validateGraph(doc);
}

export interface RouteStep {
    nodeId: string;
    label: string;
    type: string;
}

/**
 * Returns allowed routes from entry (or from a given node) as a list of steps.
 * Does not evaluate Access Gates (runtime); only returns structural paths.
 * For "allowed" by role, use runtime evaluator.
 */
export function getStructuralRoutes(doc: BlueprintDocument, fromNodeId?: string): RouteStep[][] {
    const startId = fromNodeId ?? doc.entryNodeId ?? doc.nodes[0]?.id;
    if (!startId) {return []; }
    const nodeMap = new Map(doc.nodes.map(n => [n.id, n]));
    const bySource = new Map<string, typeof doc.edges>();
    for (const e of doc.edges) {
        const list = bySource.get(e.sourceNodeId) ?? [];
        list.push(e);
        bySource.set(e.sourceNodeId, list);
    }
    const routes: RouteStep[][] = [];
    const start = nodeMap.get(startId);
    if (!start) {return []; }

    function walk(path: RouteStep[], nodeId: string, visited: Set<string>): void {
        if (visited.has(nodeId)) {return; }
        const node = nodeMap.get(nodeId);
        if (!node) {return; }
        visited.add(nodeId);
        const step: RouteStep = { nodeId: node.id, label: node.label, type: node.type };
        const newPath = [...path, step];
        const out = bySource.get(nodeId) ?? [];
        if (out.length === 0) {
            routes.push(newPath);
        } else {
            for (const e of out) {
                walk(newPath, e.targetNodeId, new Set(visited));
            }
        }
    }
    walk([], startId, new Set());
    return routes;
}
