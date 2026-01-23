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
import '../../src/browser/style/ozw-properties.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { OpenHandler, WidgetFactory, NavigatableWidgetOptions } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { OzwEditorWidget } from './ozw-editor-widget';
import { OzwToolboxWidget } from './ozw-toolbox-widget';
import { OzwPropertiesWidget } from './ozw-properties-widget';
import { OzwOpenHandler } from './ozw-open-handler';
import { OzwToolboxViewContribution } from './ozw-toolbox-contribution';
import { bindViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
class OzwPropertiesViewContribution extends AbstractViewContribution<OzwPropertiesWidget> {
    constructor() {
        super({
            widgetId: OzwPropertiesWidget.ID,
            widgetName: OzwPropertiesWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right',
                rank: 200
            },
            toggleCommandId: 'ozw-properties:toggle',
            toggleKeybinding: 'ctrlcmd+shift+p'
        });
    }
}

export default new ContainerModule(bind => {
    // Bind OZW Editor Widget Factory with transient scope
    bind(OzwEditorWidget).toSelf().inTransientScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: OzwEditorWidget.ID,
        createWidget: async (options: NavigatableWidgetOptions) => {
            // Create a new widget instance
            const widget = ctx.container.get<OzwEditorWidget>(OzwEditorWidget);
            const uri = new URI(options.uri);

            // Load file content for initialization
            const fileService = ctx.container.get<FileService>(FileService);
            let content = '';
            try {
                const resource = await fileService.read(uri);
                content = resource.value;
            } catch (e) {
                console.warn('Could not read file, creating new document', e);
                content = '{"version":"1.0","components":[]}';
            }

            // Initialize the widget with URI and content
            await widget.initialize(uri, content);
            return widget;
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

    // Bind Properties Widget
    bind(OzwPropertiesWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: OzwPropertiesWidget.ID,
        createWidget: () => ctx.container.get<OzwPropertiesWidget>(OzwPropertiesWidget)
    })).inSingletonScope();

    // Bind Properties View Contribution
    bindViewContribution(bind, OzwPropertiesViewContribution);
});
