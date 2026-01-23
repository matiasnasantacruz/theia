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

import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OzwToolboxWidget } from './ozw-toolbox-widget';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';

export const OZW_TOOLBOX_TOGGLE_COMMAND: Command = {
    id: 'ozw.toolbox.toggle',
    category: 'View',
    label: 'Toggle Component Toolbox'
};

@injectable()
export class OzwToolboxViewContribution extends AbstractViewContribution<OzwToolboxWidget> {

    constructor() {
        super({
            widgetId: OzwToolboxWidget.ID,
            widgetName: OzwToolboxWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right',
                rank: 500
            },
            toggleCommandId: OZW_TOOLBOX_TOGGLE_COMMAND.id,
            toggleKeybinding: 'ctrlcmd+shift+o'
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(OZW_TOOLBOX_TOGGLE_COMMAND, {
            execute: () => this.openView({ activate: true, reveal: true })
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
    }
}
