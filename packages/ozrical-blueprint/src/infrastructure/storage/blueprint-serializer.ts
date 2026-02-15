// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { BlueprintDocument } from '../../domain/entities/blueprint-types';
import { validateBlueprintDocument } from '../../domain/schema/blueprint-schema';

export type ParseResult =
    | { ok: true; doc: BlueprintDocument }
    | { ok: false; error: Error; zodError?: unknown };

export class BlueprintSerializer {
    parse(content: string): ParseResult {
        const trimmed = content.trim();
        if (!trimmed) {
            return { ok: false, error: new Error('Empty blueprint document') };
        }
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            const result = validateBlueprintDocument(parsed);
            if (result.success) {
                return { ok: true, doc: result.data };
            }
            return {
                ok: false,
                error: new Error(result.error.message),
                zodError: result.error
            };
        } catch (e) {
            return {
                ok: false,
                error: e instanceof Error ? e : new Error(String(e))
            };
        }
    }

    stringify(doc: BlueprintDocument): string {
        return JSON.stringify(doc, undefined, 2);
    }
}
