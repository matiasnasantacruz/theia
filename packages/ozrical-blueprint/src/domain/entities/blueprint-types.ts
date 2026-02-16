// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Node types in the App Blueprint graph.
 * - Root: app_router (punto de entrada de la aplicación; solo uno como raíz).
 * - Navigation: menu, view, modal (screens / menu entries).
 * - Logic: auth, access_gate, access_context, redirector, switch_role.
 * - Data: connector, state_injection.
 */
export type BlueprintNodeType =
    | 'app_router'
    | 'menu'
    | 'view'
    | 'modal'
    | 'auth'
    | 'access_gate'
    | 'access_context'
    | 'connector'
    | 'state_injection'
    | 'redirector'
    | 'switch_role';

export interface Position {
    x: number;
    y: number;
}

/** Base node: id (UUID), type, label, position for editor. */
export interface BlueprintNodeBase {
    id: string;
    type: BlueprintNodeType;
    label: string;
    position: Position;
}

/** Access Gate node: references a definition by ruleId. */
export interface BlueprintNodeAccessGate extends BlueprintNodeBase {
    type: 'access_gate';
    ruleId?: string;
}

/** Access Context node: references a definition; applies access mode. */
export interface BlueprintNodeAccessContext extends BlueprintNodeBase {
    type: 'access_context';
    contextId?: string;
}

/** Connector node: binds data to a view (e.g. id_planificacion_inventario). */
export interface BlueprintNodeConnector extends BlueprintNodeBase {
    type: 'connector';
    connectorId?: string;
    params?: Record<string, unknown>;
}

/** State injection node. */
export interface BlueprintNodeStateInjection extends BlueprintNodeBase {
    type: 'state_injection';
    key?: string;
    defaultValue?: unknown;
}

/** Link status for menu/view/modal nodes that reference an .ozw file */
export type LinkedResourceStatus = 'linked' | 'missing' | 'unassigned';

/** Menu node: instance of a view; must reference an OZW file (.ozw). */
export interface BlueprintNodeMenu extends BlueprintNodeBase {
    type: 'menu';
    /** Path relative to workspace root (e.g. views/clientes.ozw) */
    resourceId?: string;
    /** Navigation route (e.g. /app/clientes). Derived from resourceId if not set. */
    route?: string;
    /** Whether the linked .ozw file exists and is valid */
    linkedResourceStatus?: LinkedResourceStatus;
}

/** View node: screen/view that can reference an OZW file. */
export interface BlueprintNodeView extends BlueprintNodeBase {
    type: 'view';
    resourceId?: string;
    route?: string;
    linkedResourceStatus?: LinkedResourceStatus;
}

/** Modal node: modal dialog that can reference an OZW file. */
export interface BlueprintNodeModal extends BlueprintNodeBase {
    type: 'modal';
    resourceId?: string;
    route?: string;
    linkedResourceStatus?: LinkedResourceStatus;
}

export type BlueprintNode =
    | BlueprintNodeBase
    | BlueprintNodeMenu
    | BlueprintNodeView
    | BlueprintNodeModal
    | BlueprintNodeAccessGate
    | BlueprintNodeAccessContext
    | BlueprintNodeConnector
    | BlueprintNodeStateInjection;

export interface BlueprintEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string;
    targetHandle?: string;
    /** Optional: pass context data along this edge (Context Bridge). */
    contextPayload?: Record<string, unknown>;
}

/** Access Gate definition: who can pass (roles and optional expression). */
export interface AccessGateDefinition {
    id: string;
    allowedRoles: string[];
    expression?: string;
}

/** Access mode per role for a context. */
export interface AccessModeByRole {
    [role: string]: 'read' | 'write' | 'delete' | 'read_only';
}

/** Connector binding for an Access Context. */
export interface ConnectorBinding {
    connectorId: string;
    params?: Record<string, unknown>;
}

/** Access Context definition: access mode per role, optional connector bindings. */
export interface AccessContextDefinition {
    id: string;
    accessModeByRole: AccessModeByRole;
    connectorBindings?: ConnectorBinding[];
}

export interface UserProfileDefinition {
    roles: string[];
}

export interface BlueprintDefinitions {
    accessGates: Record<string, AccessGateDefinition>;
    accessContexts: Record<string, AccessContextDefinition>;
    userProfile: UserProfileDefinition;
}

export interface BlueprintDocument {
    version: string;
    nodes: BlueprintNode[];
    edges: BlueprintEdge[];
    definitions: BlueprintDefinitions;
    /** Optional: root node id (e.g. Login or App Router). */
    entryNodeId?: string;
}
