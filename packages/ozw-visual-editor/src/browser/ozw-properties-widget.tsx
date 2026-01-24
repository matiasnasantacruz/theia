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
import { createDefaultMetadata, getComponentDisplayName, getPropertyFieldsForType, renderCustomTextColorFields } from './component-registry';
import { ComponentMetadata } from './model/ozw-types';

// Componente de input que preserva la posición del cursor
interface ControlledInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    type?: string;
}

const ControlledInput: React.FC<ControlledInputProps> = ({ value, onChange, placeholder, className, type = 'text' }) => {
    const inputRef = React.useRef<HTMLInputElement | undefined>(undefined);

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
            ref={node => {
                inputRef.current = node ?? undefined;
            }}
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
    private selectedComponentId: string | undefined = undefined;
    private selectedComponentType: string | undefined = undefined;
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

    setSelectedComponent(id: string | undefined, type: string | undefined, metadata: ComponentMetadata): void {
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
            <div className='ozw-panel ozw-properties-container'>
                <div className='ozw-panel-header ozw-properties-header'>
                    <h3 className='ozw-panel-title'>{this.getComponentDisplayName()}</h3>
                    <span className='ozw-panel-subtitle ozw-properties-type'>{this.selectedComponentType}</span>
                </div>
                <div className='ozw-panel-body ozw-properties-content'>
                    <div className='ozw-panel-section'>
                        {this.renderProperties()}
                    </div>
                </div>
            </div>
        );
    }

    protected getComponentDisplayName(): string {
        const type = this.selectedComponentType || 'component';
        return getComponentDisplayName(type, this.selectedComponentMetadata);
    }

    protected renderProperties(): React.ReactNode {
        const type = this.selectedComponentType || 'component';
        const defaults = createDefaultMetadata(type);
        const fields = getPropertyFieldsForType(type);

        const renderLayoutControls = (): React.ReactNode => {
            // These controls are mainly intended for leaf widgets (non containers).
            const isContainer = type === 'row' || type === 'column';
            if (isContainer) {
                return undefined;
            }

            const meta = this.selectedComponentMetadata as Record<string, unknown>;
            const width = (typeof meta.width === 'string' ? meta.width.trim() : '');
            const height = (typeof meta.height === 'string' ? meta.height.trim() : '');

            const sizePreset = (() => {
                const isFullW = width === '100%';
                const isFullH = height === '100%';
                if (!width && !height) {
                    return 'none';
                }
                if (isFullW && !height) {
                    return 'fullWidth';
                }
                if (!width && isFullH) {
                    return 'fullHeight';
                }
                if (isFullW && isFullH) {
                    return 'fullBoth';
                }
                return 'custom';
            })();

            const storedAlignH = meta.alignH;
            const storedAlignV = meta.alignV;
            const alignH = (storedAlignH === 'start' || storedAlignH === 'center' || storedAlignH === 'end')
                ? storedAlignH
                : 'start';
            const alignV = (storedAlignV === 'start' || storedAlignV === 'center' || storedAlignV === 'end')
                ? storedAlignV
                : 'center';
            const weightMode = meta.disableWeight === true ? 'none' : 'weight';

            return (
                <React.Fragment>
                    <div className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>Tamaño (pesos)</label>
                        <select
                            className='ozw-select ozw-select--md ozw-property-input'
                            value={weightMode}
                            onChange={e => {
                                const value = e.target.value;
                                if (value === 'none') {
                                    this.handlePropertyChange('disableWeight', true);
                                } else {
                                    this.handlePropertyChange('disableWeight', undefined);
                                }
                            }}
                        >
                            <option value='weight'>Usar peso (por defecto)</option>
                            <option value='none'>Sin pesos (intrínseco)</option>
                        </select>
                    </div>

                    <div className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>Tamaño</label>
                        <select
                            className='ozw-select ozw-select--md ozw-property-input'
                            value={sizePreset}
                            onChange={e => {
                                const value = e.target.value;
                                if (value === 'none') {
                                    this.handlePropertiesChange({ width: undefined, height: undefined });
                                } else if (value === 'fullWidth') {
                                    this.handlePropertiesChange({ width: '100%', height: undefined });
                                } else if (value === 'fullHeight') {
                                    this.handlePropertiesChange({ width: undefined, height: '100%' });
                                } else if (value === 'fullBoth') {
                                    this.handlePropertiesChange({ width: '100%', height: '100%' });
                                } else {
                                    // 'custom': keep current width/height as-is
                                }
                            }}
                        >
                            <option value='none'>Por defecto (sin tamaño)</option>
                            <option value='fullWidth'>Full width</option>
                            <option value='fullHeight'>Full height</option>
                            <option value='fullBoth'>Full width + height</option>
                            <option value='custom'>Personalizado</option>
                        </select>
                    </div>

                    <div className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>Alineación horizontal</label>
                        <select
                            className='ozw-select ozw-select--md ozw-property-input'
                            value={alignH}
                            onChange={e => this.handlePropertyChange('alignH', e.target.value)}
                        >
                            <option value='start'>Izquierda</option>
                            <option value='center'>Centro</option>
                            <option value='end'>Derecha</option>
                        </select>
                    </div>

                    <div className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>Alineación vertical</label>
                        <select
                            className='ozw-select ozw-select--md ozw-property-input'
                            value={alignV}
                            onChange={e => this.handlePropertyChange('alignV', e.target.value)}
                        >
                            <option value='start'>Arriba</option>
                            <option value='center'>Centro</option>
                            <option value='end'>Abajo</option>
                        </select>
                    </div>
                </React.Fragment>
            );
        };

        const renderField = (field: ReturnType<typeof getPropertyFieldsForType>[number]): React.ReactNode => {
            if (field.visible && !field.visible(type, this.selectedComponentMetadata)) {
                return undefined;
            }

            if (field.kind === 'customTextColor') {
                return (
                    <React.Fragment key="customTextColor">
                        {renderCustomTextColorFields({
                            metadata: this.selectedComponentMetadata,
                            onChange: (changedKey, changedValue) => this.handlePropertyChange(changedKey, changedValue)
                        })}
                    </React.Fragment>
                );
            }

            const propertyKey = field.key;
            const stored = (this.selectedComponentMetadata as Record<string, unknown>)[propertyKey];
            const fallback = (defaults as Record<string, unknown>)[propertyKey] ?? field.defaultValue;

            if (field.kind === 'select') {
                const selectedValue = (typeof stored === 'string' && stored.length > 0)
                    ? stored
                    : (typeof fallback === 'string' ? fallback : '');
                return (
                    <div key={propertyKey} className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>{field.label}</label>
                        <select
                            className='ozw-select ozw-select--md ozw-property-input'
                            value={selectedValue}
                            onChange={e => this.handlePropertyChange(propertyKey, e.target.value)}
                        >
                            {field.options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                );
            }

            if (field.kind === 'color') {
                const colorValue = (typeof stored === 'string' && stored.length > 0)
                    ? stored
                    : (typeof fallback === 'string' ? fallback : '#000000');
                return (
                    <div key={propertyKey} className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>{field.label}</label>
                        <input
                            type="color"
                            className='ozw-color ozw-property-input'
                            value={colorValue}
                            onChange={e => this.handlePropertyChange(propertyKey, e.target.value)}
                        />
                    </div>
                );
            }

            // input | number
            const inputType = field.kind === 'number' ? 'number' : 'text';
            const inputValue = (() => {
                if (field.kind === 'number') {
                    const parsed = typeof stored === 'number' ? stored : typeof stored === 'string' ? Number(stored) : NaN;
                    if (Number.isFinite(parsed)) {
                        return String(parsed);
                    }
                    if (typeof fallback === 'number') {
                        return String(fallback);
                    }
                    return '';
                }
                return typeof stored === 'string' ? stored : typeof fallback === 'string' ? fallback : '';
            })();

            return (
                <div key={propertyKey} className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>{field.label}</label>
                    <ControlledInput
                        type={inputType}
                        value={inputValue}
                        onChange={raw => {
                            const normalized = field.normalize ? field.normalize(raw) : raw;
                            this.handlePropertyChange(propertyKey, normalized);
                        }}
                        placeholder={field.placeholder}
                        className='ozw-input ozw-input--md ozw-property-input'
                    />
                </div>
            );
        };

        return (
            <React.Fragment>
                {renderLayoutControls()}
                {fields.map(renderField)}
            </React.Fragment>
        );
    }

    protected handlePropertiesChange(changes: Record<string, unknown>): void {
        if (!this.selectedComponentId) {
            return;
        }

        for (const [property, value] of Object.entries(changes)) {
            this.selectedComponentMetadata[property] = value;
        }
        this.update();

        if (this.onPropertyChangeCallback) {
            for (const [property, value] of Object.entries(changes)) {
                this.onPropertyChangeCallback({
                    componentId: this.selectedComponentId,
                    property,
                    value
                });
            }
        }
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
