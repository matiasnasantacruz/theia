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

import { ComponentRendererRegistry } from './component-renderer-registry';
import { renderButton } from './renderers/button-renderer';
import { renderInput } from './renderers/input-renderer';
import { renderText } from './renderers/text-renderer';
import { renderCard, renderContainer, renderImage, renderSpacer } from './renderers/basic-renderers';

export function createDefaultRendererRegistry(): ComponentRendererRegistry {
    const registry = new ComponentRendererRegistry();
    registry.register('button', renderButton);
    registry.register('input', renderInput);
    registry.register('text', renderText);
    registry.register('image', renderImage);
    registry.register('card', renderCard);
    registry.register('container', renderContainer);
    registry.register('spacer', renderSpacer);
    return registry;
}

