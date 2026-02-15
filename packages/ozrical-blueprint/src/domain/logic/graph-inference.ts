// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { BlueprintDocument, BlueprintNode, BlueprintEdge } from '../entities/blueprint-types';

export interface ValidationError {
    kind: 'dead_end' | 'cycle' | 'unreachable' | 'missing_gate_definition' | 'missing_context_definition' | 'invalid_entry' | 'orphan_edge';
    nodeId?: string;
    edgeId?: string;
    definitionId?: string;
    message: string;
}

export interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}

function nodeById(doc: BlueprintDocument): Map<string, BlueprintNode> {
    const map = new Map<string, BlueprintNode>();
    for (const n of doc.nodes) {
        map.set(n.id, n);
    }
    return map;
}

function edgesBySource(doc: BlueprintDocument): Map<string, BlueprintEdge[]> {
    const map = new Map<string, BlueprintEdge[]>();
    for (const e of doc.edges) {
        const list = map.get(e.sourceNodeId) ?? [];
        list.push(e);
        map.set(e.sourceNodeId, list);
    }
    return map;
}

function edgesByTarget(doc: BlueprintDocument): Map<string, BlueprintEdge[]> {
    const map = new Map<string, BlueprintEdge[]>();
    for (const e of doc.edges) {
        const list = map.get(e.targetNodeId) ?? [];
        list.push(e);
        map.set(e.targetNodeId, list);
    }
    return map;
}

/** Reachable node ids from start, and detected cycle (first cycle node found). */
function reachableWithCycle(
    startId: string,
    nodes: Map<string, BlueprintNode>,
    bySource: Map<string, BlueprintEdge[]>
): { reachable: Set<string>; cycleNodeId: string | undefined } {
    const reachable = new Set<string>();
    const stack: string[] = [];
    const inStack = new Set<string>();
    let cycleNodeId: string | undefined;
    const visit = (id: string): void => {
        if (inStack.has(id)) {
            cycleNodeId = cycleNodeId ?? id;
            return;
        }
        if (reachable.has(id)) {return; }
        reachable.add(id);
        stack.push(id);
        inStack.add(id);
        const out = bySource.get(id) ?? [];
        for (const e of out) {
            const target = e.targetNodeId;
            if (nodes.has(target)) {
                visit(target);
            }
        }
        stack.pop();
        inStack.delete(id);
    };
    visit(startId);
    return { reachable, cycleNodeId };
}

/**
 * Validates the Blueprint graph: dead ends, cycles, unreachable nodes,
 * missing gate/context definitions, invalid entry node.
 */
export function validateGraph(doc: BlueprintDocument): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const nodes = nodeById(doc);
    const bySource = edgesBySource(doc);
    const byTarget = edgesByTarget(doc);

    const nodeIds = new Set(nodes.keys());
    for (const e of doc.edges) {
        if (!nodeIds.has(e.sourceNodeId)) {
            errors.push({
                kind: 'orphan_edge',
                edgeId: e.id,
                message: `Edge ${e.id} references missing source node ${e.sourceNodeId}`
            });
        }
        if (!nodeIds.has(e.targetNodeId)) {
            errors.push({
                kind: 'orphan_edge',
                edgeId: e.id,
                message: `Edge ${e.id} references missing target node ${e.targetNodeId}`
            });
        }
    }

    const entryId = doc.entryNodeId ?? (doc.nodes.length > 0 ? doc.nodes[0]!.id : undefined);
    if (doc.nodes.length > 0 && !entryId) {
        warnings.push({
            kind: 'invalid_entry',
            message: 'No entryNodeId set; first node will be used as entry'
        });
    }
    if (entryId && !nodes.has(entryId)) {
        errors.push({
            kind: 'invalid_entry',
            nodeId: entryId,
            message: `Entry node ${entryId} not found in nodes`
        });
    }

    if (entryId && nodes.has(entryId)) {
        const { reachable, cycleNodeId } = reachableWithCycle(entryId, nodes, bySource);
        if (cycleNodeId !== undefined) {
            errors.push({
                kind: 'cycle',
                nodeId: cycleNodeId,
                message: `Cycle detected involving node ${cycleNodeId}`
            });
        }
        for (const n of doc.nodes) {
            if (!reachable.has(n.id)) {
                warnings.push({
                    kind: 'unreachable',
                    nodeId: n.id,
                    message: `Node ${n.id} (${n.label}) is unreachable from entry`
                });
            }
        }
    }

    for (const n of doc.nodes) {
        const out = bySource.get(n.id) ?? [];
        if (out.length === 0 && n.type !== 'view' && n.type !== 'modal' && n.type !== 'menu') {
            const isTarget = (byTarget.get(n.id) ?? []).length > 0;
            if (isTarget) {
                warnings.push({
                    kind: 'dead_end',
                    nodeId: n.id,
                    message: `Node ${n.id} (${n.label}) has no outgoing edges (dead end)`
                });
            }
        }
        if (n.type === 'access_gate') {
            const ruleId = (n as { ruleId?: string }).ruleId;
            if (ruleId && !doc.definitions.accessGates[ruleId]) {
                errors.push({
                    kind: 'missing_gate_definition',
                    nodeId: n.id,
                    definitionId: ruleId,
                    message: `Access Gate node ${n.id} references undefined gate definition ${ruleId}`
                });
            }
        }
        if (n.type === 'access_context') {
            const contextId = (n as { contextId?: string }).contextId;
            if (contextId && !doc.definitions.accessContexts[contextId]) {
                errors.push({
                    kind: 'missing_context_definition',
                    nodeId: n.id,
                    definitionId: contextId,
                    message: `Access Context node ${n.id} references undefined context definition ${contextId}`
                });
            }
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings
    };
}
