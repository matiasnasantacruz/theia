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
 * Interface for data connectors. The engine asks "I need data for this node";
 * the system looks up the registered connector (e.g. PostgreSQLConnector, RestAPIConnector)
 * and runs it. Allows adding arbitrary connection types without touching core.
 */
export interface IConnector {
    readonly id: string;
    fetch(params: Record<string, unknown>): Promise<unknown>;
}

export interface IConnectorRegistry {
    register(connector: IConnector): void;
    unregister(id: string): void;
    get(id: string): IConnector | undefined;
}
