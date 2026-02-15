// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { OpenerService, open as openUri } from '@theia/core/lib/browser/opener-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { createEmptyBlueprint } from '../domain/factory';
import { BlueprintSerializer } from '../infrastructure/storage/blueprint-serializer';

export const NEW_APP_BLUEPRINT_COMMAND = {
    id: 'ozrical-blueprint.new',
    label: 'New App Blueprint'
};

const BLUEPRINT_FILENAME = 'app.blueprint';

@injectable()
export class BlueprintNewCommandContribution implements CommandContribution, MenuContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(BlueprintSerializer)
    protected readonly serializer: BlueprintSerializer;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NEW_APP_BLUEPRINT_COMMAND, {
            execute: () => this.createAppBlueprint()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(['file', 'new'], {
            commandId: NEW_APP_BLUEPRINT_COMMAND.id,
            label: NEW_APP_BLUEPRINT_COMMAND.label,
            order: 'z'
        });
    }

    protected async createAppBlueprint(): Promise<void> {
        const rootUri = this.workspaceService.getWorkspaceRootUri(undefined);
        if (!rootUri) {
            this.messageService.warn('Abre un workspace para crear el App Blueprint en la raíz.');
            return;
        }
        const blueprintUri = rootUri.resolve(BLUEPRINT_FILENAME);
        const doc = createEmptyBlueprint();
        const content = this.serializer.stringify(doc);
        try {
            await this.fileService.write(blueprintUri, content);
            await openUri(this.openerService, blueprintUri);
            this.messageService.info(`Creado ${BLUEPRINT_FILENAME} en la raíz del proyecto. Arrastra "App Router" al lienzo como punto de entrada.`);
        } catch (e) {
            this.messageService.error(`No se pudo crear ${BLUEPRINT_FILENAME}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
