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

/**
 * Simple reactive state: when connector data changes, subscribers are notified
 * so open units can re-render. Can be replaced with RxJS or signals later.
 */
export class ReactiveConnectorState {

    protected readonly dataByConnector = new Map<string, unknown>();
    protected readonly onChangeEmitter = new Emitter<{ connectorId: string; data: unknown }>();

    readonly onConnectorDataChanged: Event<{ connectorId: string; data: unknown }> = this.onChangeEmitter.event;

    setConnectorData(connectorId: string, data: unknown): void {
        this.dataByConnector.set(connectorId, data);
        this.onChangeEmitter.fire({ connectorId, data });
    }

    getConnectorData(connectorId: string): unknown {
        return this.dataByConnector.get(connectorId);
    }
}
