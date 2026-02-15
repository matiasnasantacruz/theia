// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { BlueprintNode } from '../../domain/entities/blueprint-types';
import type { AccessContextState } from '../security/session-manager';

export type RenderArchetype = 'list' | 'form' | 'menu' | 'view' | 'modal';

export interface IArchetypeInterpreter {
    getArchetype(node: BlueprintNode, accessContext: AccessContextState | undefined): RenderArchetype;
}

/**
 * Interprets node type + Access Context to decide how to render (list vs form, etc.).
 * Blueprint is data only; this lives in infrastructure so a different client (e.g. iOS) can swap the interpreter.
 */
export class ArchetypeInterpreter implements IArchetypeInterpreter {

    getArchetype(node: BlueprintNode, accessContext: AccessContextState | undefined): RenderArchetype {
        if (node.type === 'menu') {return 'menu'; }
        if (node.type === 'modal') {return 'modal'; }
        if (node.type === 'view') {
            const mode = accessContext?.accessMode ?? 'read';
            return (mode === 'read' || mode === 'read_only') ? 'list' : 'form';
        }
        return 'view';
    }
}
