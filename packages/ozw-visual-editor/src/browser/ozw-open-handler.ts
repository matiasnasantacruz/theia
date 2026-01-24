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

import { injectable, inject } from '@theia/core/shared/inversify';
import { NavigatableWidgetOpenHandler, NavigatableWidgetOptions, WidgetOpenerOptions } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { OzwEditorWidget } from './ozw-editor-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { OzwToolboxWidget } from './ozw-toolbox-widget';

@injectable()
export class OzwOpenHandler extends NavigatableWidgetOpenHandler<OzwEditorWidget> {

    readonly id = OzwEditorWidget.ID;
    readonly label = 'OZW Visual Editor';

    @inject(FileService)
    protected readonly fileService: FileService;

    override canHandle(uri: URI): number {
        if (uri.path.ext === '.ozw') {
            return 1000; // Very high priority to ensure only this handler opens .ozw files
        }
        return 0;
    }

    override async open(uri: URI, options?: WidgetOpenerOptions): Promise<OzwEditorWidget> {
        // Check if a widget with this URI already exists
        const existingWidget = this.findExistingWidget(uri);
        if (existingWidget) {
            // Widget already exists, just activate it
            await this.shell.activateWidget(existingWidget.id);
            return existingWidget;
        }

        // No existing widget, create a new one
        return await super.open(uri, options);
    }

    protected findExistingWidget(uri: URI): OzwEditorWidget | undefined {
        const uriString = uri.withoutFragment().normalizePath().toString();
        for (const widget of this.shell.widgets) {
            if (widget instanceof OzwEditorWidget) {
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

    protected override async getOrCreateWidget(uri: URI): Promise<OzwEditorWidget> {
        const widget = await super.getOrCreateWidget(uri);
        
        // Check if widget needs initialization
        // Widget might have URI from restored state but still need full initialization
        if (!widget.isInitialized) {
            // Load file content
            let content = '';
            try {
                const resource = await this.fileService.read(uri);
                content = resource.value;
            } catch (e) {
                console.warn('Could not read file, creating new document', e);
                content = '{"version":"1.0","components":[]}';
            }

            await widget.initialize(uri, content);
        }

        // Open toolbox automatically
        await this.openToolbox();

        return widget;
    }

    protected async openToolbox(): Promise<void> {
        try {
            const toolbox = await this.widgetManager.getOrCreateWidget<OzwToolboxWidget>(OzwToolboxWidget.ID);
            if (!toolbox.isVisible) {
                await this.shell.addWidget(toolbox, { area: 'right', rank: 500 });
            }
            await this.shell.revealWidget(toolbox.id);
        } catch (e) {
            console.warn('Could not open toolbox', e);
        }
    }
}