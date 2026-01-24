// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { ComponentMetadata } from '../model/ozw-types';

export type LeafComponentRenderer = (metadata: ComponentMetadata) => React.ReactNode;

export class ComponentRendererRegistry {
    protected readonly renderers = new Map<string, LeafComponentRenderer>();

    register(type: string, renderer: LeafComponentRenderer): void {
        this.renderers.set(type, renderer);
    }

    get(type: string): LeafComponentRenderer | undefined {
        return this.renderers.get(type);
    }
}

