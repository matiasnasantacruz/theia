// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { IConnector } from '../../domain/interfaces/connector';

/**
 * Example in-memory connector for testing. Returns mock data keyed by params.
 */
export class MemoryConnector implements IConnector {

    constructor(
        readonly id: string,
        protected readonly data: Record<string, unknown> = {}
    ) { }

    async fetch(params: Record<string, unknown>): Promise<unknown> {
        const key = JSON.stringify(params);
        return this.data[key] ?? [];
    }
}
