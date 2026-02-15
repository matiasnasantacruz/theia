// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { BlueprintDocument } from '../domain/entities/blueprint-types';

/**
 * Resolves context variables available at a given node by traversing
 * incoming edges and collecting contextPayload from edges and connector outputs.
 * Used by the Player to inject data (e.g. id_de_cliente) into views.
 */
export function getContextVariablesForNode(
    blueprint: BlueprintDocument,
    nodeId: string,
    runtimeVariables: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...runtimeVariables };
    const incoming = blueprint.edges.filter(e => e.targetNodeId === nodeId);
    for (const edge of incoming) {
        if (edge.contextPayload && typeof edge.contextPayload === 'object') {
            Object.assign(result, edge.contextPayload);
        }
        const sourceNode = blueprint.nodes.find(n => n.id === edge.sourceNodeId);
        if (sourceNode?.type === 'connector') {
            const conn = sourceNode as { connectorId?: string; params?: Record<string, unknown> };
            if (conn.connectorId && runtimeVariables[conn.connectorId] !== undefined) {
                result[conn.connectorId] = runtimeVariables[conn.connectorId];
            }
        }
    }
    return result;
}
