// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/blueprint-editor.css';

import { ContainerModule, injectable, inject } from '@theia/core/shared/inversify';
import {
    OpenHandler,
    WidgetFactory,
    NavigatableWidgetOptions,
    UndoRedoHandler,
    ApplicationShell
} from '@theia/core/lib/browser';
import { DialogProps } from '@theia/core/lib/browser/dialogs';
import { Command, CommandContribution, CommandRegistry, MenuContribution } from '@theia/core/lib/common';
import { bindViewContribution, AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { BlueprintEditorWidget } from './blueprint-editor-widget';
import { BlueprintToolboxWidget } from './blueprint-toolbox-widget';
import { BlueprintInspectorWidget } from './blueprint-inspector-widget';
import { BlueprintOpenHandler } from './blueprint-open-handler';
import { BlueprintToolboxViewContribution } from './blueprint-toolbox-contribution';
import { BlueprintNewCommandContribution } from './blueprint-new-command';
import { BlueprintSerializer } from '../infrastructure/storage/blueprint-serializer';
import { OzwResourceProvider } from './services/ozw-resource-provider';
import { BlueprintSelectionService } from './services/blueprint-selection-service';
import { BlueprintEditorRefService } from './services/blueprint-editor-ref-service';
import { OzwResourcePickerDialog } from './dialogs/ozw-resource-picker-dialog';

export const BlueprintInspectorOpenCommand: Command = {
    id: 'blueprint-inspector:open',
    label: 'Open Blueprint Inspector'
};

@injectable()
class BlueprintInspectorViewContribution extends AbstractViewContribution<BlueprintInspectorWidget> {
    constructor() {
        super({
            widgetId: BlueprintInspectorWidget.ID,
            widgetName: BlueprintInspectorWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right',
                rank: 200
            },
            toggleCommandId: 'blueprint-inspector:toggle',
            toggleKeybinding: 'ctrlcmd+shift+i'
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(BlueprintInspectorOpenCommand, {
            execute: () => this.openView({ reveal: true })
        });
    }
}

@injectable()
class BlueprintUndoRedoHandler implements UndoRedoHandler<BlueprintEditorWidget> {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    priority = 190;

    select(): BlueprintEditorWidget | undefined {
        const current = this.shell.currentWidget;
        if (current instanceof BlueprintEditorWidget) {
            return current;
        }
        return undefined;
    }

    undo(item: BlueprintEditorWidget): void {
        item.undo();
    }

    redo(item: BlueprintEditorWidget): void {
        item.redo();
    }
}

export default new ContainerModule(bind => {
    bind(BlueprintSerializer).toSelf().inSingletonScope();
    bind(OzwResourceProvider).toSelf().inSingletonScope();
    bind(BlueprintSelectionService).toSelf().inSingletonScope();
    bind(BlueprintEditorRefService).toSelf().inSingletonScope();
    bind(OzwResourcePickerDialog).toDynamicValue(ctx => {
        const fileService = ctx.container.get(FileService);
        return new OzwResourcePickerDialog(
            { title: 'Vincular menú a vista OZW' } as DialogProps,
            fileService
        );
    }).inSingletonScope();

    bind(BlueprintEditorWidget).toSelf().inTransientScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: BlueprintEditorWidget.ID,
        createWidget: async (options: NavigatableWidgetOptions) => {
            const widget = ctx.container.get<BlueprintEditorWidget>(BlueprintEditorWidget);
            const uri = new URI(options.uri);
            const fileService = ctx.container.get<FileService>(FileService);
            let content = '';
            try {
                const resource = await fileService.read(uri);
                content = resource.value;
            } catch (e) {
                console.warn('Could not read blueprint file', e);
            }
            await widget.initialize(uri, content);
            return widget;
        }
    })).inSingletonScope();

    bind(BlueprintOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(BlueprintOpenHandler);

    bind(BlueprintToolboxWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: BlueprintToolboxWidget.ID,
        createWidget: () => ctx.container.get<BlueprintToolboxWidget>(BlueprintToolboxWidget)
    })).inSingletonScope();
    bindViewContribution(bind, BlueprintToolboxViewContribution);

    bind(BlueprintInspectorWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: BlueprintInspectorWidget.ID,
        createWidget: () => ctx.container.get<BlueprintInspectorWidget>(BlueprintInspectorWidget)
    })).inSingletonScope();
    bindViewContribution(bind, BlueprintInspectorViewContribution);

    bind(BlueprintUndoRedoHandler).toSelf().inSingletonScope();
    bind(UndoRedoHandler).toService(BlueprintUndoRedoHandler);

    bind(BlueprintNewCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(BlueprintNewCommandContribution);
    bind(MenuContribution).toService(BlueprintNewCommandContribution);
});
