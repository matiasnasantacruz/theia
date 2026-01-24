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

export interface TreeNode {
    id: string;
    type: string;
    children?: TreeNode[];
}

export interface ComponentMetadata {
    label?: string;
    width?: string;
    height?: string;
    backgroundColor?: string;
    color?: string;
    padding?: string;
    margin?: string;
    textColorMode?: 'system' | 'custom';
    textColorLight?: string;
    textColorDark?: string;
    textColor?: string; // legacy
    [key: string]: unknown;
}

export interface OzwSchema {
    tree: TreeNode[];
    metadata: Record<string, ComponentMetadata>;
}

export interface OzwDocument {
    version: string;
    components: OzwComponent[];
    schema: OzwSchema;
}

export interface OzwComponent {
    type: string;
    id: string;
    properties: ComponentMetadata;
}

export type OzwEditorMode = 'canvas' | 'text' | 'split';

