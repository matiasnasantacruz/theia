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

export function renderImage(_metadata: ComponentMetadata): React.ReactNode {
    return (
        <div className='ozw-modern-image'>
            <i className='fa fa-image' style={{ fontSize: '20px', color: '#999' }}></i>
        </div>
    );
}

export function renderCard(metadata: ComponentMetadata): React.ReactNode {
    const label = typeof metadata.label === 'string' && metadata.label.length > 0 ? metadata.label : 'Card Title';
    return (
        <div className='ozw-modern-card'>
            <h4>{label}</h4>
            <p>Card content</p>
        </div>
    );
}

export function renderContainer(metadata: ComponentMetadata): React.ReactNode {
    const label = typeof metadata.label === 'string' && metadata.label.length > 0 ? metadata.label : 'Container';
    return (
        <div className='ozw-modern-container'>
            <p>{label}</p>
        </div>
    );
}

