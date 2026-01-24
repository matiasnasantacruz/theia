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

import { normalizeDocument } from '../model/ozw-document-model';
import { OzwDocument } from '../model/ozw-types';

export type ParseResult =
    | { ok: true; doc: OzwDocument }
    | { ok: false; error: Error };

export class OzwDocumentSerializer {
    parse(content: string): ParseResult {
        const trimmed = content.trim();
        if (!trimmed) {
            return { ok: false, error: new Error('Empty document') };
        }
        try {
            const parsed = JSON.parse(trimmed);
            return { ok: true, doc: normalizeDocument(parsed) };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
        }
    }

    stringify(doc: OzwDocument): string {
        return JSON.stringify(doc, undefined, 2);
    }
}

