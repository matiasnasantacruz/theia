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
import {
    NavigatableWidgetOpenHandler,
    NavigatableWidgetOptions,
    WidgetOpenerOptions,
    ApplicationShell,
    WidgetManager
} from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { BlueprintEditorWidget } from './blueprint-editor-widget';
import { BlueprintToolboxWidget } from './blueprint-toolbox-widget';

@injectable()
export class BlueprintOpenHandler extends NavigatableWidgetOpenHandler<BlueprintEditorWidget> {

    readonly id = BlueprintEditorWidget.ID;
    readonly label = 'App Blueprint';

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ApplicationShell)
    protected override readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected override readonly widgetManager: WidgetManager;

    override canHandle(uri: URI, _options?: WidgetOpenerOptions): number {
        if (uri.path.ext === '.blueprint' || (uri.path.ext === '.json' && uri.path.name.endsWith('.blueprint'))) {
            return 1000;
        }
        return 0;
    }

    override async open(uri: URI, options?: WidgetOpenerOptions): Promise<BlueprintEditorWidget> {
        const existingWidget = this.findExistingWidget(uri);
        if (existingWidget) {
            await this.shell.activateWidget(existingWidget.id);
            return existingWidget;
        }
        return await super.open(uri, options);
    }

    protected findExistingWidget(uri: URI): BlueprintEditorWidget | undefined {
        const uriString = uri.withoutFragment().normalizePath().toString();
        for (const widget of this.shell.widgets) {
            if (widget instanceof BlueprintEditorWidget) {
                const widgetUri = widget.getResourceUri();
                if (widgetUri) {
                    const widgetUriString = widgetUri.withoutFragment().normalizePath().toString();
                    if (widgetUriString === uriString) {
                        return widget;
                    }
                }
            }
        }
        return undefined;
    }

    protected override createWidgetOptions(uri: URI): NavigatableWidgetOptions {
        return {
            kind: 'navigatable',
            uri: uri.toString()
        };
    }

    protected override async getOrCreateWidget(uri: URI): Promise<BlueprintEditorWidget> {
        const widget = await super.getOrCreateWidget(uri);
        if (!widget.isInitialized) {
            let content = '';
            try {
                const resource = await this.fileService.read(uri);
                content = resource.value;
            } catch (e) {
                console.warn('Could not read blueprint file, creating new document', e);
                content = '';
            }
            await widget.initialize(uri, content);
        }
        await this.openToolbox();
        return widget;
    }

    protected async openToolbox(): Promise<void> {
        try {
            const toolbox = await this.widgetManager.getOrCreateWidget<BlueprintToolboxWidget>(BlueprintToolboxWidget.ID);
            if (!toolbox.isVisible) {
                await this.shell.addWidget(toolbox, { area: 'left', rank: 500 });
            }
            await this.shell.revealWidget(toolbox.id);
        } catch (e) {
            console.warn('Could not open blueprint toolbox', e);
        }
    }
}
