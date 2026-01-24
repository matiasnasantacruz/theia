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

import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { ComponentMetadata } from '../model/ozw-types';
import { OzwPropertiesWidget, PropertyChangeEvent } from '../ozw-properties-widget';
import { OzwToolboxWidget } from '../ozw-toolbox-widget';

export class OzwSidePanelsService {
    protected propertiesWidget: OzwPropertiesWidget | undefined;
    protected toolboxWidget: OzwToolboxWidget | undefined;
    protected isPropertyListenerRegistered = false;

    constructor(
        protected readonly widgetManager: WidgetManager,
        protected readonly shell: ApplicationShell
    ) { }

    async showToolbox(): Promise<void> {
        const toolboxWidget = await this.getToolboxWidget();
        if (!toolboxWidget.isAttached) {
            await this.shell.addWidget(toolboxWidget, { area: 'right', rank: 500 });
        }
        await this.shell.activateWidget(toolboxWidget.id);

        const propertiesWidget = await this.getPropertiesWidget();
        propertiesWidget.setSelectedComponent(undefined, undefined, {}, undefined);
    }

    async showProperties(
        componentId: string,
        componentType: string,
        metadata: ComponentMetadata,
        onPropertyChange: (event: PropertyChangeEvent) => void
    ): Promise<void> {
        const propertiesWidget = await this.getPropertiesWidget();
        propertiesWidget.setSelectedComponent(componentId, componentType, metadata, undefined);

        if (!this.isPropertyListenerRegistered) {
            this.isPropertyListenerRegistered = true;
            propertiesWidget.onPropertyChange(event => onPropertyChange(event));
        }

        if (!propertiesWidget.isAttached) {
            await this.shell.addWidget(propertiesWidget, { area: 'right', rank: 200 });
        }
        await this.shell.activateWidget(propertiesWidget.id);
    }

    protected async getToolboxWidget(): Promise<OzwToolboxWidget> {
        if (this.toolboxWidget) {
            return this.toolboxWidget;
        }
        this.toolboxWidget = await this.widgetManager.getOrCreateWidget<OzwToolboxWidget>(OzwToolboxWidget.ID);
        return this.toolboxWidget;
    }

    protected async getPropertiesWidget(): Promise<OzwPropertiesWidget> {
        if (this.propertiesWidget) {
            return this.propertiesWidget;
        }
        this.propertiesWidget = await this.widgetManager.getOrCreateWidget<OzwPropertiesWidget>(OzwPropertiesWidget.ID);
        return this.propertiesWidget;
    }
}

