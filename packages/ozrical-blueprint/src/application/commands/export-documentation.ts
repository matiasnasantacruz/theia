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

/**
 * Exports technical documentation from the Blueprint (routes, gates, contexts, connectors) as Markdown.
 */
export function exportBlueprintDocumentation(doc: BlueprintDocument): string {
    const lines: string[] = [
        '# Blueprint Documentation',
        '',
        `Version: ${doc.version}`,
        `Entry node: ${doc.entryNodeId ?? '—'}`,
        '',
        '## Nodes',
        ''
    ];
    for (const node of doc.nodes) {
        lines.push(`- **${node.label || node.id}** (\`${node.type}\`) — \`${node.id}\``);
    }
    lines.push('', '## Edges', '');
    for (const edge of doc.edges) {
        const src = doc.nodes.find(n => n.id === edge.sourceNodeId);
        const tgt = doc.nodes.find(n => n.id === edge.targetNodeId);
        lines.push(`- ${src?.label ?? edge.sourceNodeId} → ${tgt?.label ?? edge.targetNodeId}`);
    }
    lines.push('', '## Access Gates', '');
    for (const [id, gate] of Object.entries(doc.definitions.accessGates)) {
        lines.push(`- **${id}**: roles \`${(gate.allowedRoles ?? []).join(', ')}\`${gate.expression ? ` — expression: \`${gate.expression}\`` : ''}`);
    }
    lines.push('', '## Access Contexts', '');
    for (const [id, ctx] of Object.entries(doc.definitions.accessContexts)) {
        const modes = Object.entries(ctx.accessModeByRole ?? {}).map(([role, mode]) => `${role}: ${mode}`).join('; ');
        lines.push(`- **${id}**: ${modes || '—'}`);
    }
    lines.push('', '## User Profile', '');
    lines.push(`Roles: ${(doc.definitions.userProfile.roles ?? []).join(', ') || '—'}`);
    return lines.join('\n');
}
