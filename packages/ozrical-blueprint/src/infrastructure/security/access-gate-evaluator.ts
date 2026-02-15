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

export interface SessionContext {
    userId?: string;
    roles: string[];
    [key: string]: unknown;
}

export interface IEvaluatorAccessGate {
    evaluate(gateId: string, context: SessionContext, blueprint: BlueprintDocument): boolean;
}

/**
 * Evaluates Access Gate rules against session context.
 * Gates are defined in blueprint.definitions.accessGates (keyed by id).
 * If allowedRoles contains the user's role, the gate passes.
 * Optional expression can be evaluated in a future iteration (e.g. json-rules-engine).
 */
export class AccessGateEvaluator implements IEvaluatorAccessGate {

    evaluate(gateId: string, context: SessionContext, blueprint: BlueprintDocument): boolean {
        const gate = blueprint.definitions.accessGates[gateId];
        if (!gate) {
            return false;
        }
        const userRoles = new Set(context.roles ?? []);
        const allowed = gate.allowedRoles ?? [];
        const hasRole = allowed.some((role: string) => userRoles.has(role));
        if (!hasRole) {
            return false;
        }
        if (gate.expression) {
            return this.evaluateExpression(gate.expression, context);
        }
        return true;
    }

    /**
     * Simple expression evaluation: supports role checks only.
     * For full expressions (e.g. user.age > 18), plug in json-rules-engine later.
     */
    protected evaluateExpression(expression: string, _context: SessionContext): boolean {
        const trimmed = expression.trim();
        if (!trimmed) {return true; }
        if (trimmed === 'true') {return true; }
        if (trimmed === 'false') {return false; }
        return true;
    }
}
