// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { BlueprintToolboxWidget } from './blueprint-toolbox-widget';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';

export const BLUEPRINT_TOOLBOX_TOGGLE_COMMAND: Command = {
    id: 'blueprint.toolbox.toggle',
    category: 'View',
    label: 'Toggle Blueprint Toolbox'
};

@injectable()
export class BlueprintToolboxViewContribution extends AbstractViewContribution<BlueprintToolboxWidget> {

    constructor() {
        super({
            widgetId: BlueprintToolboxWidget.ID,
            widgetName: BlueprintToolboxWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: BLUEPRINT_TOOLBOX_TOGGLE_COMMAND.id,
            toggleKeybinding: 'ctrlcmd+shift+b'
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(BLUEPRINT_TOOLBOX_TOGGLE_COMMAND, {
            execute: () => this.openView({ activate: true, reveal: true })
        });
    }
}
