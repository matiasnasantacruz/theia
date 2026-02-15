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
 * Layout/theme configuration for the Player. Not part of the Blueprint;
 * allows changing look & feel without touching the graph.
 */
export interface LayoutTheme {
    primaryColor?: string;
    fontFamily?: string;
    borderRadius?: string;
    [key: string]: unknown;
}

export interface ILayoutManager {
    getTheme(): LayoutTheme;
    setTheme(theme: LayoutTheme): void;
}

export class LayoutManager implements ILayoutManager {

    protected theme: LayoutTheme = {};

    getTheme(): LayoutTheme {
        return { ...this.theme };
    }

    setTheme(theme: LayoutTheme): void {
        this.theme = { ...this.theme, ...theme };
    }
}
