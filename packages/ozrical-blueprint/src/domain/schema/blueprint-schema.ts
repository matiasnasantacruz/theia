// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { z } from 'zod';
import type { BlueprintDocument } from '../entities/blueprint-types';

const positionSchema = z.object({
    x: z.number(),
    y: z.number()
});

const nodeTypeSchema = z.enum([
    'app_router', 'menu', 'view', 'modal', 'auth', 'access_gate', 'access_context',
    'connector', 'state_injection', 'redirector', 'switch_role'
]);

const blueprintNodeSchema = z.object({
    id: z.string().uuid(),
    type: nodeTypeSchema,
    label: z.string(),
    position: positionSchema
}).passthrough();

const blueprintEdgeSchema = z.object({
    id: z.string().uuid(),
    sourceNodeId: z.string().uuid(),
    targetNodeId: z.string().uuid(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    contextPayload: z.record(z.unknown()).optional()
});

const accessGateDefinitionSchema = z.object({
    id: z.string(),
    allowedRoles: z.array(z.string()),
    expression: z.string().optional()
});

const accessContextDefinitionSchema = z.object({
    id: z.string(),
    accessModeByRole: z.record(z.enum(['read', 'write', 'delete', 'read_only'])),
    connectorBindings: z.array(z.object({
        connectorId: z.string(),
        params: z.record(z.unknown()).optional()
    })).optional()
});

const userProfileDefinitionSchema = z.object({
    roles: z.array(z.string())
});

const definitionsSchema = z.object({
    accessGates: z.record(accessGateDefinitionSchema),
    accessContexts: z.record(accessContextDefinitionSchema),
    userProfile: userProfileDefinitionSchema
});

export const blueprintDocumentSchema = z.object({
    version: z.string().min(1),
    nodes: z.array(blueprintNodeSchema),
    edges: z.array(blueprintEdgeSchema),
    definitions: definitionsSchema,
    entryNodeId: z.string().uuid().optional()
}) as z.ZodType<BlueprintDocument>;

export function validateBlueprintDocument(data: unknown): { success: true; data: BlueprintDocument } | { success: false; error: z.ZodError } {
    const result = blueprintDocumentSchema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data as BlueprintDocument };
    }
    return { success: false, error: result.error };
}
