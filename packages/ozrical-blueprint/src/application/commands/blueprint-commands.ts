// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type {
    BlueprintDocument,
    BlueprintNode,
    BlueprintNodeType,
    Position,
    AccessGateDefinition,
    AccessContextDefinition
} from '../../domain/entities/blueprint-types';
import { createId } from '../../domain/id';

export interface CreateNodeCommand {
    kind: 'CreateNode';
    type: BlueprintNodeType;
    label: string;
    position: Position;
    payload?: Partial<Record<string, unknown>>;
}

export interface DeleteNodeCommand {
    kind: 'DeleteNode';
    nodeId: string;
}

export interface MoveNodeCommand {
    kind: 'MoveNode';
    nodeId: string;
    position: Position;
}

export interface UpdateNodeCommand {
    kind: 'UpdateNode';
    nodeId: string;
    patch: { label?: string; resourceId?: string; route?: string; linkedResourceStatus?: string };
}

export interface CreateEdgeCommand {
    kind: 'CreateEdge';
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: 'left' | 'right';
    targetHandle?: 'left' | 'right';
}

export interface DeleteEdgeCommand {
    kind: 'DeleteEdge';
    edgeId: string;
}

export interface EditAccessGateCommand {
    kind: 'EditAccessGate';
    gateId: string;
    definition: Partial<AccessGateDefinition>;
}

export interface EditAccessContextCommand {
    kind: 'EditAccessContext';
    contextId: string;
    definition: Partial<AccessContextDefinition>;
}

export interface AddRoleCommand {
    kind: 'AddRole';
    role: string;
}

export interface RemoveRoleCommand {
    kind: 'RemoveRole';
    role: string;
}

export type BlueprintCommand =
    | CreateNodeCommand
    | DeleteNodeCommand
    | MoveNodeCommand
    | UpdateNodeCommand
    | CreateEdgeCommand
    | DeleteEdgeCommand
    | EditAccessGateCommand
    | EditAccessContextCommand
    | AddRoleCommand
    | RemoveRoleCommand;

function cloneDoc(doc: BlueprintDocument): BlueprintDocument {
    return JSON.parse(JSON.stringify(doc)) as BlueprintDocument;
}

export function applyCommand(doc: BlueprintDocument, cmd: BlueprintCommand, idGen: () => string = createId): BlueprintDocument {
    const next = cloneDoc(doc);
    switch (cmd.kind) {
        case 'CreateNode': {
            const node: BlueprintNode = {
                id: idGen(),
                type: cmd.type,
                label: cmd.label,
                position: { ...cmd.position },
                ...(cmd.payload ?? {})
            } as BlueprintNode;
            next.nodes.push(node);
            if (next.nodes.length === 1 || node.type === 'app_router') {
                next.entryNodeId = node.id;
            }
            return next;
        }
        case 'DeleteNode': {
            next.nodes = next.nodes.filter(n => n.id !== cmd.nodeId);
            next.edges = next.edges.filter(e => e.sourceNodeId !== cmd.nodeId && e.targetNodeId !== cmd.nodeId);
            if (next.entryNodeId === cmd.nodeId) {
                next.entryNodeId = next.nodes[0]?.id;
            }
            return next;
        }
        case 'MoveNode': {
            const n = next.nodes.find(x => x.id === cmd.nodeId);
            if (n) {
                n.position = { ...cmd.position };
            }
            return next;
        }
        case 'UpdateNode': {
            const node = next.nodes.find(x => x.id === cmd.nodeId);
            if (node) {
                if (cmd.patch.label !== undefined) { node.label = cmd.patch.label; }
                const n = node as unknown as Record<string, unknown>;
                if (cmd.patch.resourceId !== undefined) { n.resourceId = cmd.patch.resourceId; }
                if (cmd.patch.route !== undefined) { n.route = cmd.patch.route; }
                if (cmd.patch.linkedResourceStatus !== undefined) { n.linkedResourceStatus = cmd.patch.linkedResourceStatus; }
            }
            return next;
        }
        case 'CreateEdge': {
            next.edges.push({
                id: idGen(),
                sourceNodeId: cmd.sourceNodeId,
                targetNodeId: cmd.targetNodeId,
                ...(cmd.sourceHandle !== undefined && { sourceHandle: cmd.sourceHandle }),
                ...(cmd.targetHandle !== undefined && { targetHandle: cmd.targetHandle })
            });
            return next;
        }
        case 'DeleteEdge': {
            next.edges = next.edges.filter(e => e.id !== cmd.edgeId);
            return next;
        }
        case 'EditAccessGate': {
            const existing = next.definitions.accessGates[cmd.gateId];
            next.definitions.accessGates[cmd.gateId] = {
                id: cmd.gateId,
                allowedRoles: existing?.allowedRoles ?? [],
                expression: existing?.expression,
                ...cmd.definition
            };
            return next;
        }
        case 'EditAccessContext': {
            const existingCtx = next.definitions.accessContexts[cmd.contextId];
            next.definitions.accessContexts[cmd.contextId] = {
                id: cmd.contextId,
                accessModeByRole: existingCtx?.accessModeByRole ?? {},
                connectorBindings: existingCtx?.connectorBindings,
                ...cmd.definition
            };
            return next;
        }
        case 'AddRole': {
            if (!next.definitions.userProfile.roles.includes(cmd.role)) {
                next.definitions.userProfile.roles = [...next.definitions.userProfile.roles, cmd.role];
            }
            return next;
        }
        case 'RemoveRole': {
            next.definitions.userProfile.roles = next.definitions.userProfile.roles.filter(r => r !== cmd.role);
            return next;
        }
        default:
            return next;
    }
}
