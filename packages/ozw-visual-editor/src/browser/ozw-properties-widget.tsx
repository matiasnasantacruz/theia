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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, Message, codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { ComponentMetadata } from './ozw-editor-widget';

export interface PropertyChangeEvent {
    componentId: string;
    property: string;
    value: unknown;
}

@injectable()
export class OzwPropertiesWidget extends BaseWidget {

    static readonly ID = 'ozw-properties';
    static readonly LABEL = 'Properties';

    private root: Root | undefined;
    private selectedComponentId: string | null = null;
    private selectedComponentType: string | null = null;
    private selectedComponentMetadata: ComponentMetadata = {};
    private onPropertyChangeCallback: ((event: PropertyChangeEvent) => void) | undefined;

    @postConstruct()
    protected init(): void {
        this.id = OzwPropertiesWidget.ID;
        this.title.label = OzwPropertiesWidget.LABEL;
        this.title.caption = OzwPropertiesWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('settings-gear');

        this.addClass('ozw-properties-widget');
        this.node.tabIndex = 0;
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.root) {
            this.root = createRoot(this.node);
        }
        this.root.render(<React.Fragment>{this.render()}</React.Fragment>);
    }

    override dispose(): void {
        if (this.root) {
            this.root.unmount();
            this.root = undefined;
        }
        super.dispose();
    }

    setSelectedComponent(id: string | null, type: string | null, metadata: ComponentMetadata): void {
        this.selectedComponentId = id;
        this.selectedComponentType = type;
        this.selectedComponentMetadata = { ...metadata };
        this.update();
    }

    onPropertyChange(callback: (event: PropertyChangeEvent) => void): void {
        this.onPropertyChangeCallback = callback;
    }

    protected render(): React.ReactNode {
        if (!this.selectedComponentId) {
            return (
                <div className='ozw-properties-empty'>
                    <div className='ozw-properties-empty-content'>
                        <i className={codicon('info')} style={{ fontSize: '32px', color: '#999', marginBottom: '12px' }}></i>
                        <p style={{ color: '#666', margin: 0 }}>Select a component to edit its properties</p>
                    </div>
                </div>
            );
        }

        return (
            <div className='ozw-properties-container'>
                <div className='ozw-properties-header'>
                    <h3>{this.getComponentDisplayName()}</h3>
                    <span className='ozw-properties-type'>{this.selectedComponentType}</span>
                </div>
                <div className='ozw-properties-content'>
                    {this.renderProperties()}
                </div>
            </div>
        );
    }

    protected getComponentDisplayName(): string {
        const type = this.selectedComponentType || 'Component';
        return this.selectedComponentMetadata.label as string ||
            (type.charAt(0).toUpperCase() + type.slice(1));
    }

    protected renderProperties(): React.ReactNode {
        const properties: React.ReactNode[] = [];

        // Label property (all components have this)
        properties.push(
            <div key="label" className='ozw-property-row'>
                <label className='ozw-property-label'>Label</label>
                <input
                    type="text"
                    className='theia-input ozw-property-input'
                    value={this.selectedComponentMetadata.label as string || ''}
                    onChange={(e) => this.handlePropertyChange('label', e.target.value)}
                    placeholder="Component label"
                />
            </div>
        );

        // Type-specific properties
        if (this.selectedComponentType === 'button') {
            properties.push(
                <div key="backgroundColor" className='ozw-property-row'>
                    <label className='ozw-property-label'>Background Color</label>
                    <input
                        type="color"
                        className='ozw-property-input'
                        value={this.selectedComponentMetadata.backgroundColor as string || '#007acc'}
                        onChange={(e) => this.handlePropertyChange('backgroundColor', e.target.value)}
                    />
                </div>
            );
            properties.push(
                <div key="color" className='ozw-property-row'>
                    <label className='ozw-property-label'>Text Color</label>
                    <input
                        type="color"
                        className='ozw-property-input'
                        value={this.selectedComponentMetadata.color as string || '#ffffff'}
                        onChange={(e) => this.handlePropertyChange('color', e.target.value)}
                    />
                </div>
            );
        }

        // Layout properties for containers
        if (this.selectedComponentType === 'column' || this.selectedComponentType === 'row') {
            properties.push(
                <div key="padding" className='ozw-property-row'>
                    <label className='ozw-property-label'>Padding</label>
                    <input
                        type="text"
                        className='theia-input ozw-property-input'
                        value={this.selectedComponentMetadata.padding as string || '12px'}
                        onChange={(e) => this.handlePropertyChange('padding', e.target.value)}
                        placeholder="e.g., 12px"
                    />
                </div>
            );
        }

        // Common styling properties
        properties.push(
            <div key="width" className='ozw-property-row'>
                <label className='ozw-property-label'>Width</label>
                <input
                    type="text"
                    className='theia-input ozw-property-input'
                    value={this.selectedComponentMetadata.width as string || ''}
                    onChange={(e) => this.handlePropertyChange('width', e.target.value)}
                    placeholder="auto"
                />
            </div>
        );

        properties.push(
            <div key="height" className='ozw-property-row'>
                <label className='ozw-property-label'>Height</label>
                <input
                    type="text"
                    className='theia-input ozw-property-input'
                    value={this.selectedComponentMetadata.height as string || ''}
                    onChange={(e) => this.handlePropertyChange('height', e.target.value)}
                    placeholder="auto"
                />
            </div>
        );

        return properties;
    }

    protected handlePropertyChange(property: string, value: unknown): void {
        if (!this.selectedComponentId) {
            return;
        }

        this.selectedComponentMetadata[property] = value;
        this.update();

        if (this.onPropertyChangeCallback) {
            this.onPropertyChangeCallback({
                componentId: this.selectedComponentId,
                property,
                value
            });
        }
    }
}
