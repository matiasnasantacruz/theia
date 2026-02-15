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
import { AccessGateEvaluator, type SessionContext } from '../../infrastructure/security/access-gate-evaluator';

/**
 * Live debug state: which node we're at, which gate was evaluated, connector data.
 * The editor can subscribe and highlight the active gate / flow in the graph.
 */
export interface BlueprintDebugSnapshot {
    currentNodeId: string | undefined;
    lastEvaluatedGateId: string | undefined;
    gatePassed: boolean;
    connectorData: Record<string, unknown>;
    session: SessionContext;
}

export function createInitialDebugSnapshot(session: SessionContext): BlueprintDebugSnapshot {
    return {
        currentNodeId: undefined,
        lastEvaluatedGateId: undefined,
        gatePassed: true,
        connectorData: {},
        session
    };
}

/**
 * Simulates one step: from currentNodeId, follow outgoing edges and evaluate gates.
 * Returns the next snapshot (next node, which gate was evaluated, etc.).
 */
export function stepDebug(
    blueprint: BlueprintDocument,
    snapshot: BlueprintDebugSnapshot
): BlueprintDebugSnapshot {
    const evaluator = new AccessGateEvaluator();
    const nodeId = snapshot.currentNodeId ?? blueprint.entryNodeId ?? blueprint.nodes[0]?.id;
    if (!nodeId) {
        return snapshot;
    }

    const node = blueprint.nodes.find(n => n.id === nodeId);
    if (!node) {
        return snapshot;
    }

    const outgoing = blueprint.edges.filter(e => e.sourceNodeId === nodeId);
    if (outgoing.length === 0) {
        return snapshot;
    }

    for (const edge of outgoing) {
        const target = blueprint.nodes.find(n => n.id === edge.targetNodeId);
        if (!target) {
            continue;
        }
        if (target.type === 'access_gate') {
            const ruleId = (target as { ruleId?: string }).ruleId;
            const passed = ruleId ? evaluator.evaluate(ruleId, snapshot.session, blueprint) : true;
            return {
                ...snapshot,
                currentNodeId: target.id,
                lastEvaluatedGateId: ruleId ?? undefined,
                gatePassed: passed
            };
        }
        return {
            ...snapshot,
            currentNodeId: target.id,
            lastEvaluatedGateId: undefined,
            gatePassed: true
        };
    }
    return snapshot;
}
