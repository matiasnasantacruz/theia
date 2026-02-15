// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export {
    applyCommand,
    type BlueprintCommand,
    type CreateNodeCommand,
    type DeleteNodeCommand,
    type MoveNodeCommand,
    type CreateEdgeCommand,
    type DeleteEdgeCommand,
    type EditAccessGateCommand,
    type EditAccessContextCommand,
    type AddRoleCommand,
    type RemoveRoleCommand
} from './commands/blueprint-commands';
export { validarGrafo, getStructuralRoutes } from './queries/blueprint-queries';
export type { RouteStep } from './queries/blueprint-queries';
export { getContextVariablesForNode } from './context-bridge';
export {
    createInitialDebugSnapshot,
    stepDebug,
    type BlueprintDebugSnapshot
} from './queries/blueprint-debug';
export { exportBlueprintDocumentation } from './commands/export-documentation';
