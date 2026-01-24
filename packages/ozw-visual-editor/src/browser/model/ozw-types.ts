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
    /**
     * Alineación horizontal del contenido dentro del "slot" del widget.
     * Útil cuando el widget recibe espacio extra por el sistema de pesos.
     */
    alignH?: 'start' | 'center' | 'end';
    /**
     * Alineación vertical del contenido dentro del "slot" del widget.
     */
    alignV?: 'start' | 'center' | 'end';
    /**
     * Si está en `true`, el componente NO participa del sistema de pesos (flex-grow) en `row`/`column`.
     * Útil para que un widget conserve su tamaño intrínseco dentro de un layout.
     */
    disableWeight?: boolean;
    /**
     * Peso proporcional para layouts (`row` / `column`).
     * No representa tamaño absoluto; solo relación contra la suma de pesos hermanos.
     * Default efectivo: 1.
     */
    weight?: number;
    /**
     * Tamaño del espaciador (Spacer) como longitud CSS.
     * Ej: `8px`, `1rem`, `10%`.
     */
    space?: string;
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

