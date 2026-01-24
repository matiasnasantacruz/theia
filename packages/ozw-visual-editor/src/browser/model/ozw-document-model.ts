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

import { ComponentMetadata, OzwComponent, OzwDocument, TreeNode } from './ozw-types';

export type TreeInsertPosition = 'before' | 'after' | 'inside';

export interface OzwIdGenerator {
    (type: string): string;
}

export const defaultIdGenerator: OzwIdGenerator = (type: string) =>
    `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function canHaveChildren(type: string): boolean {
    return type === 'column' || type === 'row';
}

export function createEmptyDocument(): OzwDocument {
    return {
        version: '1.0',
        components: [],
        schema: { tree: [], metadata: {} }
    };
}

/**
 * Normalize a potentially partial/legacy document into a valid `OzwDocument`.
 * Mutates the input object as little as possible by returning a new object.
 */
export function normalizeDocument(input: unknown): OzwDocument {
    const parsed = (typeof input === 'object' && input !== undefined ? input : {}) as Partial<OzwDocument>;

    const schema = (typeof parsed.schema === 'object' && parsed.schema !== undefined ? parsed.schema : {}) as unknown as {
        tree?: unknown;
        metadata?: unknown;
    };
    const tree: TreeNode[] = Array.isArray(schema.tree) ? schema.tree : [];
    const metadata: Record<string, ComponentMetadata> =
        (schema.metadata && typeof schema.metadata === 'object')
            ? (schema.metadata as Record<string, ComponentMetadata>)
            : ({} as Record<string, ComponentMetadata>);

    const components: OzwComponent[] = Array.isArray(parsed.components) ? parsed.components : [];
    const version = typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : '1.0';

    const doc: OzwDocument = {
        version,
        components,
        schema: { tree, metadata }
    };

    // Keep legacy behavior: metadata is used by the canvas; when user edits JSON, they might update only
    // components[].properties, so keep metadata in sync.
    syncMetadataFromComponents(doc);
    return doc;
}

export function syncMetadataFromComponents(doc: OzwDocument): void {
    for (const component of doc.components) {
        if (!component?.id || !component.properties) {
            continue;
        }
        if (!doc.schema.metadata[component.id]) {
            doc.schema.metadata[component.id] = {};
        }
        Object.assign(doc.schema.metadata[component.id], component.properties);
    }
}

export function findParentId(tree: TreeNode[], childId: string): string | undefined {
    const findInTree = (nodes: TreeNode[], parentId: string | undefined = undefined): string | undefined => {
        for (const node of nodes) {
            if (node.id === childId) {
                return parentId;
            }
            if (node.children) {
                const found = findInTree(node.children, node.id);
                if (found !== undefined) {
                    return found;
                }
            }
        }
        return undefined;
    };

    return findInTree(tree);
}

export function addNodeToParent(node: TreeNode, parentId: string, tree: TreeNode[]): boolean {
    for (const treeNode of tree) {
        if (treeNode.id === parentId) {
            if (!treeNode.children) {
                treeNode.children = [];
            }
            treeNode.children.push(node);
            return true;
        }
        if (treeNode.children && addNodeToParent(node, parentId, treeNode.children)) {
            return true;
        }
    }
    return false;
}

export function addComponent(
    doc: OzwDocument,
    type: string,
    parentId: string | undefined,
    idGenerator: OzwIdGenerator = defaultIdGenerator
): string {
    const id = idGenerator(type);
    const component: OzwComponent = {
        id,
        type,
        properties: {
            label: type === 'column' ? 'Columna'
                : type === 'row' ? 'Fila'
                    : `${type.charAt(0).toUpperCase()}${type.slice(1)}`
        }
    };

    doc.components.push(component);
    doc.schema.metadata[id] = component.properties;

    const newNode: TreeNode = { id, type, children: canHaveChildren(type) ? [] : undefined };
    if (parentId === undefined) {
        doc.schema.tree.push(newNode);
    } else {
        addNodeToParent(newNode, parentId, doc.schema.tree);
    }

    return id;
}

export function removeNodeFromTree(nodeId: string, tree: TreeNode[]): TreeNode | undefined {
    for (let i = 0; i < tree.length; i++) {
        const current = tree[i];
        if (!current) {
            continue;
        }
        if (current.id === nodeId) {
            return tree.splice(i, 1)[0];
        }
        if (current.children) {
            const found = removeNodeFromTree(nodeId, current.children);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

export function findNodeWithParent(
    nodeId: string,
    tree: TreeNode[],
    parentArray: TreeNode[] = tree
): { node: TreeNode; parentArray: TreeNode[]; index: number } | undefined {
    for (let i = 0; i < tree.length; i++) {
        const current = tree[i];
        if (!current) {
            continue;
        }
        if (current.id === nodeId) {
            return { node: current, parentArray, index: i };
        }
        if (current.children) {
            const found = findNodeWithParent(nodeId, current.children, current.children);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

export function isDescendant(tree: TreeNode[], potentialDescendantId: string, ancestorId: string): boolean {
    const checkNode = (node: TreeNode): boolean => {
        if (node.id === potentialDescendantId) {
            return true;
        }
        if (node.children) {
            return node.children.some(child => checkNode(child));
        }
        return false;
    };

    const findNode = (nodes: TreeNode[]): TreeNode | undefined => {
        for (const node of nodes) {
            if (node.id === ancestorId) {
                return node;
            }
            if (node.children) {
                const found = findNode(node.children);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    };

    const ancestorNode = findNode(tree);
    if (!ancestorNode) {
        return false;
    }
    return checkNode(ancestorNode);
}

export function insertComponentRelativeToSmart(
    tree: TreeNode[],
    sourceId: string,
    targetId: string,
    position: Exclude<TreeInsertPosition, 'inside'>
): boolean {
    const sourceInfo = findNodeWithParent(sourceId, tree);
    const targetInfo = findNodeWithParent(targetId, tree);
    if (!sourceInfo || !targetInfo) {
        return false;
    }

    const sourceArray = sourceInfo.parentArray;
    const targetArray = targetInfo.parentArray;
    const sourceIndex = sourceInfo.index;
    let targetIndex = targetInfo.index;

    const sameParent = sourceArray === targetArray;
    const sourceNode = sourceArray.splice(sourceIndex, 1)[0];

    if (sameParent && sourceIndex < targetIndex) {
        targetIndex--;
    }

    if (position === 'before') {
        targetArray.splice(targetIndex, 0, sourceNode);
    } else {
        targetArray.splice(targetIndex + 1, 0, sourceNode);
    }
    return true;
}

export function moveComponent(
    doc: OzwDocument,
    sourceId: string,
    target: { kind: 'root' } | { kind: 'node'; id: string; type: string },
    position: TreeInsertPosition
): boolean {
    if (target.kind === 'node') {
        if (sourceId === target.id) {
            return false;
        }
        if (isDescendant(doc.schema.tree, target.id, sourceId)) {
            return false;
        }
    }

    if (target.kind === 'root') {
        const node = removeNodeFromTree(sourceId, doc.schema.tree);
        if (!node) {
            return false;
        }
        doc.schema.tree.push(node);
        return true;
    }

    const targetId = target.id;
    const targetType = target.type;

    if (canHaveChildren(targetType) && position === 'inside') {
        const node = removeNodeFromTree(sourceId, doc.schema.tree);
        if (!node) {
            return false;
        }
        addNodeToParent(node, targetId, doc.schema.tree);
        return true;
    }

    // Non-container target: insert before/after relative to targetId.
    if (position === 'before' || position === 'after') {
        return insertComponentRelativeToSmart(doc.schema.tree, sourceId, targetId, position);
    }

    // If asked to insert inside a leaf, behave like the previous implementation: treat as 'after'.
    return insertComponentRelativeToSmart(doc.schema.tree, sourceId, targetId, 'after');
}

export function deleteComponent(doc: OzwDocument, componentId: string): void {
    const componentIndex = doc.components.findIndex(c => c.id === componentId);
    if (componentIndex !== -1) {
        doc.components.splice(componentIndex, 1);
    }
    delete doc.schema.metadata[componentId];
    removeNodeFromTree(componentId, doc.schema.tree);
}

