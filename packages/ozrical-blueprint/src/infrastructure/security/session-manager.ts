// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, type Event } from '@theia/core/lib/common/event';
import type { SessionContext } from './access-gate-evaluator';

export interface AccessContextState {
    contextId: string;
    accessMode: 'read' | 'write' | 'delete' | 'read_only';
    connectorData?: Record<string, unknown>;
}

export interface ISessionManager {
    getContext(): SessionContext;
    setContext(ctx: Partial<SessionContext>): void;
    getCurrentAccessContext(): AccessContextState | undefined;
    setCurrentAccessContext(state: AccessContextState | undefined): void;
    getContextVariables(): Record<string, unknown>;
    setContextVariable(key: string, value: unknown): void;
    readonly onContextChanged: Event<void>;
}

export class SessionManager implements ISessionManager {

    protected _context: SessionContext = { roles: [] };
    protected _accessContext: AccessContextState | undefined;
    protected _contextVariables: Record<string, unknown> = {};
    protected readonly onContextChangedEmitter = new Emitter<void>();

    get onContextChanged(): Event<void> {
        return this.onContextChangedEmitter.event;
    }

    getContext(): SessionContext {
        return { ...this._context };
    }

    setContext(ctx: Partial<SessionContext>): void {
        this._context = { ...this._context, ...ctx };
        this.onContextChangedEmitter.fire();
    }

    getCurrentAccessContext(): AccessContextState | undefined {
        return this._accessContext;
    }

    setCurrentAccessContext(state: AccessContextState | undefined): void {
        this._accessContext = state;
        this.onContextChangedEmitter.fire();
    }

    getContextVariables(): Record<string, unknown> {
        return { ...this._contextVariables };
    }

    setContextVariable(key: string, value: unknown): void {
        this._contextVariables[key] = value;
        this.onContextChangedEmitter.fire();
    }
}
