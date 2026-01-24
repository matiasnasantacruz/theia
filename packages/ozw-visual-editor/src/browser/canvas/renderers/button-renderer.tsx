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

export function renderButton(metadata: ComponentMetadata): React.ReactNode {
    const rawVariant = typeof metadata.variant === 'string' ? metadata.variant : 'primary';
    const variant = ((): string => {
        switch (rawVariant) {
            case 'primary':
            case 'secondary':
            case 'success':
            case 'danger':
            case 'ghost':
                return rawVariant;
            default:
                return 'primary';
        }
    })();

    const rawSize = typeof metadata.size === 'string' ? metadata.size : 'medium';
    const size = ((): string => {
        switch (rawSize) {
            case 'small':
                return 'sm';
            case 'medium':
                return 'md';
            case 'large':
                return 'lg';
            default:
                return 'md';
        }
    })();

    return (
        <button className={`ozw-btn ozw-btn--${variant} ozw-btn--${size}`}>
            {typeof metadata.label === 'string' && metadata.label.length > 0 ? metadata.label : 'Button'}
        </button>
    );
}

