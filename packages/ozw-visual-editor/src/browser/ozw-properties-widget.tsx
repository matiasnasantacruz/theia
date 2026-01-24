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

// Componente de input que preserva la posición del cursor
interface ControlledInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    type?: string;
}

const ControlledInput: React.FC<ControlledInputProps> = ({ value, onChange, placeholder, className, type = 'text' }) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const selectionStart = e.target.selectionStart;
        const selectionEnd = e.target.selectionEnd;

        onChange(newValue);

        // Restaurar la posición del cursor después del re-render
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.setSelectionRange(selectionStart, selectionEnd);
            }
        }, 0);
    };

    return (
        <input
            ref={inputRef}
            type={type}
            className={className}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
        />
    );
};

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
                <ControlledInput
                    value={this.selectedComponentMetadata.label as string || ''}
                    onChange={(value) => this.handlePropertyChange('label', value)}
                    placeholder="Component label"
                    className='theia-input ozw-property-input'
                />
            </div>
        );

        // Type-specific properties
        if (this.selectedComponentType === 'button') {
            properties.push(
                <div key="variant" className='ozw-property-row'>
                    <label className='ozw-property-label'>Variant</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.variant as string || 'primary'}
                        onChange={(e) => this.handlePropertyChange('variant', e.target.value)}
                    >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                        <option value="success">Success</option>
                        <option value="danger">Danger</option>
                    </select>
                </div>
            );
            properties.push(
                <div key="size" className='ozw-property-row'>
                    <label className='ozw-property-label'>Size</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.size as string || 'medium'}
                        onChange={(e) => this.handlePropertyChange('size', e.target.value)}
                    >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                    </select>
                </div>
            );
        }

        if (this.selectedComponentType === 'input') {
            properties.push(
                <div key="placeholder" className='ozw-property-row'>
                    <label className='ozw-property-label'>Placeholder</label>
                    <ControlledInput
                        value={this.selectedComponentMetadata.placeholder as string || ''}
                        onChange={(value) => this.handlePropertyChange('placeholder', value)}
                        placeholder="Enter placeholder text"
                        className='theia-input ozw-property-input'
                    />
                </div>
            );
            properties.push(
                <div key="inputType" className='ozw-property-row'>
                    <label className='ozw-property-label'>Input Type</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.inputType as string || 'text'}
                        onChange={(e) => this.handlePropertyChange('inputType', e.target.value)}
                    >
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="password">Password</option>
                        <option value="number">Number</option>
                    </select>
                </div>
            );
        }

        if (this.selectedComponentType === 'text') {
            properties.push(
                <div key="fontSize" className='ozw-property-row'>
                    <label className='ozw-property-label'>Font Size</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.fontSize as string || '13px'}
                        onChange={(e) => this.handlePropertyChange('fontSize', e.target.value)}
                    >
                        <option value="11px">Small (11px)</option>
                        <option value="13px">Medium (13px)</option>
                        <option value="16px">Large (16px)</option>
                        <option value="20px">XLarge (20px)</option>
                    </select>
                </div>
            );
            properties.push(
                <div key="fontWeight" className='ozw-property-row'>
                    <label className='ozw-property-label'>Font Weight</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.fontWeight as string || 'normal'}
                        onChange={(e) => this.handlePropertyChange('fontWeight', e.target.value)}
                    >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="lighter">Light</option>
                    </select>
                </div>
            );
            properties.push(
                <div key="textColor" className='ozw-property-row'>
                    <label className='ozw-property-label'>Text Color</label>
                    <input
                        type="color"
                        className='ozw-property-input'
                        value={this.selectedComponentMetadata.textColor as string || '#000000'}
                        onChange={(e) => this.handlePropertyChange('textColor', e.target.value)}
                    />
                </div>
            );
        }

        // Layout properties for containers
        if (this.selectedComponentType === 'column' || this.selectedComponentType === 'row') {
            properties.push(
                <div key="gap" className='ozw-property-row'>
                    <label className='ozw-property-label'>Gap</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.gap as string || '8px'}
                        onChange={(e) => this.handlePropertyChange('gap', e.target.value)}
                    >
                        <option value="0">None</option>
                        <option value="4px">Small (4px)</option>
                        <option value="8px">Medium (8px)</option>
                        <option value="12px">Large (12px)</option>
                        <option value="16px">XLarge (16px)</option>
                    </select>
                </div>
            );
            properties.push(
                <div key="padding" className='ozw-property-row'>
                    <label className='ozw-property-label'>Padding</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.padding as string || '8px'}
                        onChange={(e) => this.handlePropertyChange('padding', e.target.value)}
                    >
                        <option value="0">None</option>
                        <option value="4px">Small (4px)</option>
                        <option value="8px">Medium (8px)</option>
                        <option value="12px">Large (12px)</option>
                        <option value="16px">XLarge (16px)</option>
                    </select>
                </div>
            );
            properties.push(
                <div key="alignment" className='ozw-property-row'>
                    <label className='ozw-property-label'>Alignment</label>
                    <select
                        className='theia-select ozw-property-input'
                        value={this.selectedComponentMetadata.alignment as string || 'start'}
                        onChange={(e) => this.handlePropertyChange('alignment', e.target.value)}
                    >
                        <option value="start">Start</option>
                        <option value="center">Center</option>
                        <option value="end">End</option>
                        <option value="stretch">Stretch</option>
                    </select>
                </div>
            );
        }

        // Common styling properties
        properties.push(
            <div key="width" className='ozw-property-row'>
                <label className='ozw-property-label'>Width</label>
                <ControlledInput
                    value={this.selectedComponentMetadata.width as string || ''}
                    onChange={(value) => this.handlePropertyChange('width', value)}
                    placeholder="auto"
                    className='theia-input ozw-property-input'
                />
            </div>
        );

        properties.push(
            <div key="height" className='ozw-property-row'>
                <label className='ozw-property-label'>Height</label>
                <ControlledInput
                    value={this.selectedComponentMetadata.height as string || ''}
                    onChange={(value) => this.handlePropertyChange('height', value)}
                    placeholder="auto"
                    className='theia-input ozw-property-input'
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
