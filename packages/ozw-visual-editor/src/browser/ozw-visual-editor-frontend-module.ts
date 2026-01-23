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

import '../../src/browser/style/ozw-editor.css';
import '../../src/browser/style/ozw-toolbox.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { OpenHandler, WidgetFactory, NavigatableWidgetOptions } from '@theia/core/lib/browser';
import { OzwEditorWidget } from './ozw-editor-widget';
import { OzwToolboxWidget } from './ozw-toolbox-widget';
import { OzwOpenHandler } from './ozw-open-handler';
import { OzwToolboxViewContribution } from './ozw-toolbox-contribution';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';

export default new ContainerModule(bind => {
    // Bind OZW Editor Widget Factory with transient scope
    bind(OzwEditorWidget).toSelf().inTransientScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: OzwEditorWidget.ID,
        createWidget: (options: NavigatableWidgetOptions) => {
            // Create a new widget instance - initialization happens in the handler
            return ctx.container.get<OzwEditorWidget>(OzwEditorWidget);
        }
    })).inSingletonScope();

    // Bind OZW Open Handler
    bind(OzwOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(OzwOpenHandler);

    // Bind Toolbox Widget
    bind(OzwToolboxWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: OzwToolboxWidget.ID,
        createWidget: () => ctx.container.get<OzwToolboxWidget>(OzwToolboxWidget)
    })).inSingletonScope();

    // Bind Toolbox View Contribution
    bindViewContribution(bind, OzwToolboxViewContribution);
});
