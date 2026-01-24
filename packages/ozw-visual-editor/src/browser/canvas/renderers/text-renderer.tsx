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

import * as React from '@theia/core/shared/react';
import { ComponentMetadata } from '../../model/ozw-types';

export function renderText(metadata: ComponentMetadata): React.ReactNode {
    const label = typeof metadata.label === 'string' && metadata.label.length > 0 ? metadata.label : 'Text';
    const fontSize = typeof metadata.fontSize === 'string' ? metadata.fontSize : undefined;
    const fontWeight = typeof metadata.fontWeight === 'string' ? metadata.fontWeight : undefined;

    const mode = (metadata.textColorMode === 'system' || metadata.textColorMode === 'custom')
        ? metadata.textColorMode
        : undefined;

    const legacyTextColor = typeof metadata.textColor === 'string' ? metadata.textColor : undefined;
    const light = typeof metadata.textColorLight === 'string' ? metadata.textColorLight : legacyTextColor;
    const dark = typeof metadata.textColorDark === 'string' ? metadata.textColorDark : legacyTextColor;

    const isCustom = mode === 'custom' || (!mode && (typeof light === 'string' || typeof dark === 'string'));

    interface TextColorVars {
        '--ozw-text-color-light'?: string;
        '--ozw-text-color-dark'?: string;
    }
    const style: React.CSSProperties & TextColorVars = {};
    if (fontSize) {
        style.fontSize = fontSize;
    }
    if (fontWeight) {
        style.fontWeight = fontWeight;
    }
    if (isCustom) {
        if (typeof light === 'string' && light.length > 0) {
            style['--ozw-text-color-light'] = light;
        }
        if (typeof dark === 'string' && dark.length > 0) {
            style['--ozw-text-color-dark'] = dark;
        }
    }

    return <p className='ozw-modern-text' style={style}>{label}</p>;
}

