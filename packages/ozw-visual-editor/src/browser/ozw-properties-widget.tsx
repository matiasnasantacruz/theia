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
    onBlur?: () => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const ControlledInput: React.FC<ControlledInputProps> = ({ value, onChange, placeholder, className, type = 'text', onBlur, onKeyDown }) => {
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
            onBlur={onBlur}
            onKeyDown={onKeyDown}
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
    private allComponentIds: string[] = [];

    private searchQuery = '';
    private disclosureOpen: Record<string, boolean> = {};

    private pendingId = '';
    private idError: string | undefined = undefined;

    private sizeModeSelection: 'auto' | 'fullWidth' | 'fullHeight' | 'fullBoth' | 'custom' = 'auto';

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

    setSelectedComponent(id: string | undefined, type: string | undefined, metadata: ComponentMetadata, allComponentIds?: string[]): void {
        this.selectedComponentId = id;
        this.selectedComponentType = type;
        this.selectedComponentMetadata = { ...metadata };
        this.allComponentIds = Array.isArray(allComponentIds) ? allComponentIds.slice() : [];
        this.searchQuery = '';
        this.pendingId = id ?? '';
        this.idError = undefined;
        this.sizeModeSelection = this.deriveSizeModeFromMetadata(this.selectedComponentMetadata);
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
                    <h3 className='ozw-panel-title'>Propiedades</h3>
                    <span className='ozw-panel-subtitle ozw-properties-type'>{this.getComponentDisplayName()} · {this.selectedComponentType}</span>
                </div>
                <div className='ozw-panel-body ozw-properties-content'>
                    <div className='ozw-panel-section'>
                        {this.renderIdentitySection()}
                        {this.renderSearchRow()}
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
        const defaults = createDefaultMetadata(type) as Record<string, unknown>;
        const allFields = getPropertyFieldsForType(type);

        // Manual fields: Identity + Size & Layout.
        const fields = allFields.filter(f => !['label', 'width', 'height', 'weight'].includes(f.key));

        const query = this.searchQuery.trim().toLowerCase();
        if (query.length > 0) {
            return this.renderSearchResults(type, defaults, fields, query);
        }

        const dataKeys = this.getDataKeysForType(type);
        const behaviorKeys = this.getBehaviorKeysForType(type);
        const appearanceKeys = this.getAppearanceKeysForType(type);
        const sizeLayoutKeys = this.getSizeLayoutKeysForType(type);

        const dataFields = fields.filter(f => dataKeys.has(f.key));
        const behaviorFields = fields.filter(f => behaviorKeys.has(f.key));
        const appearanceFields = fields.filter(f => appearanceKeys.has(f.key));
        const sizeLayoutFields = fields.filter(f => sizeLayoutKeys.has(f.key));

        const advancedFields = fields.filter(f =>
            !dataKeys.has(f.key) &&
            !behaviorKeys.has(f.key) &&
            !appearanceKeys.has(f.key) &&
            !sizeLayoutKeys.has(f.key)
        );

        return (
            <React.Fragment>
                {dataFields.length > 0
                    ? this.renderDisclosure('datos', 'Datos', true, dataFields.map(f => this.renderField(type, defaults, f, { hideDefaults: false })))
                    : undefined}

                {this.renderSizeAndLayoutSection(type, defaults, sizeLayoutFields)}

                {behaviorFields.length > 0
                    ? this.renderDisclosure('comportamiento', 'Comportamiento', true, behaviorFields.map(f => this.renderField(type, defaults, f, { hideDefaults: false })))
                    : undefined}

                {this.renderDisclosure('apariencia', 'Apariencia', false, this.renderAppearanceSection(type, defaults, appearanceFields))}

                {this.renderDisclosure('avanzado', 'Avanzado', false, advancedFields.map(f => this.renderField(type, defaults, f, { hideDefaults: true })))}
            </React.Fragment>
        );
    }

    protected renderIdentitySection(): React.ReactNode {
        const type = this.selectedComponentType || 'component';
        const labelValue = typeof this.selectedComponentMetadata.label === 'string' ? this.selectedComponentMetadata.label : '';

        const commit = () => this.commitIdIfValid();

        return (
            <div className='ozw-properties-identity'>
                <div className='ozw-properties-identity-title'>Identidad</div>

                <div className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>ID</label>
                    <ControlledInput
                        value={this.pendingId}
                        onChange={raw => {
                            this.pendingId = raw;
                            this.idError = this.validateId(raw);
                            this.update();
                        }}
                        onBlur={commit}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                commit();
                            }
                        }}
                        placeholder='id-unico'
                        className='ozw-input ozw-input--md ozw-property-input'
                    />
                    {this.idError ? <div className='ozw-properties-error'>{this.idError}</div> : undefined}
                </div>

                <div className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>Label</label>
                    <ControlledInput
                        value={labelValue}
                        onChange={raw => this.handlePropertyChange('label', raw)}
                        placeholder={this.getComponentDisplayName()}
                        className='ozw-input ozw-input--md ozw-property-input'
                    />
                </div>

                <div className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>Tipo de componente</label>
                    <div className='ozw-properties-readonly'>{type}</div>
                </div>
            </div>
        );
    }

    protected renderSearchRow(): React.ReactNode {
        return (
            <div className='ozw-field ozw-property-row'>
                <label className='ozw-field-label ozw-property-label'>Buscar propiedad</label>
                <ControlledInput
                    value={this.searchQuery}
                    onChange={raw => {
                        this.searchQuery = raw;
                        this.update();
                    }}
                    placeholder='Buscar…'
                    className='ozw-input ozw-input--md ozw-property-input'
                />
            </div>
        );
    }

    protected renderDisclosure(key: string, title: string, defaultOpen: boolean, children: React.ReactNode[]): React.ReactNode {
        const isOpen = this.disclosureOpen[key] ?? defaultOpen;
        return (
            <details
                key={key}
                className='ozw-properties-disclosure'
                open={isOpen}
                onToggle={e => {
                    this.disclosureOpen[key] = (e.currentTarget as HTMLDetailsElement).open;
                }}
            >
                <summary className='ozw-properties-disclosure-summary'>{title}</summary>
                <div className='ozw-properties-disclosure-body'>
                    {children.filter(Boolean)}
                </div>
            </details>
        );
    }

    protected renderSearchResults(
        type: string,
        defaults: Record<string, unknown>,
        fields: ReturnType<typeof getPropertyFieldsForType>,
        query: string
    ): React.ReactNode {
        const matches = (label: string, key: string): boolean => `${label} ${key}`.toLowerCase().includes(query);

        const matchedFields = fields.filter(f => matches(f.label, f.key));
        const includeAlign = matches('Alineación horizontal', 'alignH') || matches('Alineación vertical', 'alignV');

        const children: React.ReactNode[] = [];
        if (includeAlign) {
            children.push(...this.renderAlignControls(type, { alwaysShow: true }));
        }
        children.push(...matchedFields.map(f => this.renderField(type, defaults, f, { hideDefaults: false, alwaysShow: true })));
        if (children.length === 0) {
            children.push(<div key="no-results" className='ozw-properties-hint'>Sin resultados.</div>);
        }

        return this.renderDisclosure('resultados', 'Resultados', true, children);
    }

    protected renderSizeAndLayoutSection(
        type: string,
        defaults: Record<string, unknown>,
        extraFields: ReturnType<typeof getPropertyFieldsForType>
    ): React.ReactNode {
        const meta = this.selectedComponentMetadata as Record<string, unknown>;
        const width = typeof meta.width === 'string' ? meta.width.trim() : '';
        const height = typeof meta.height === 'string' ? meta.height.trim() : '';

        const storedWeight = meta.weight;
        const defaultWeight = typeof defaults.weight === 'number' ? defaults.weight : (type === 'spacer' ? 0 : 1);
        const weightValue = (() => {
            const parsed = typeof storedWeight === 'number' ? storedWeight : typeof storedWeight === 'string' ? Number(storedWeight) : NaN;
            return Number.isFinite(parsed) ? String(parsed) : String(defaultWeight);
        })();

        const customRows: React.ReactNode[] = this.sizeModeSelection === 'custom'
            ? [
                (
                    <div key="width" className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>Width</label>
                        <ControlledInput
                            value={width}
                            onChange={raw => {
                                const trimmed = raw.trim();
                                this.handlePropertyChange('width', trimmed.length > 0 ? trimmed : undefined);
                            }}
                            placeholder='auto'
                            className='ozw-input ozw-input--md ozw-property-input'
                        />
                    </div>
                ),
                (
                    <div key="height" className='ozw-field ozw-property-row'>
                        <label className='ozw-field-label ozw-property-label'>Height</label>
                        <ControlledInput
                            value={height}
                            onChange={raw => {
                                const trimmed = raw.trim();
                                this.handlePropertyChange('height', trimmed.length > 0 ? trimmed : undefined);
                            }}
                            placeholder='auto'
                            className='ozw-input ozw-input--md ozw-property-input'
                        />
                    </div>
                )
            ]
            : [];

        const rows: React.ReactNode[] = [
            (
                <div key="sizeMode" className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>Tamaño</label>
                    <select
                        className='ozw-select ozw-select--md ozw-property-input'
                        value={this.sizeModeSelection}
                        onChange={e => {
                            const value = e.target.value as typeof this.sizeModeSelection;
                            this.sizeModeSelection = value;
                            if (value === 'auto') {
                                this.handlePropertiesChange({ width: undefined, height: undefined });
                            } else if (value === 'fullWidth') {
                                this.handlePropertiesChange({ width: '100%', height: undefined });
                            } else if (value === 'fullHeight') {
                                this.handlePropertiesChange({ width: undefined, height: '100%' });
                            } else if (value === 'fullBoth') {
                                this.handlePropertiesChange({ width: '100%', height: '100%' });
                            } else {
                                // custom: do not auto-change width/height
                                this.update();
                            }
                        }}
                    >
                        <option value='auto'>Automático</option>
                        <option value='fullWidth'>Ocupar todo el ancho</option>
                        <option value='fullHeight'>Ocupar todo el alto</option>
                        <option value='fullBoth'>Ocupar todo</option>
                        <option value='custom'>Personalizado</option>
                    </select>
                </div>
            ),
            ...customRows,
            ...extraFields.map(f => this.renderField(type, defaults, f, { hideDefaults: false })),
            (
                <div key="weight" className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>Peso</label>
                    <ControlledInput
                        type='number'
                        value={weightValue}
                        onChange={raw => {
                            const trimmed = raw.trim();
                            if (!trimmed) {
                                this.handlePropertiesChange({ disableWeight: undefined, weight: undefined });
                                return;
                            }
                            const parsed = Number(trimmed);
                            const normalized = type === 'spacer'
                                ? (Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
                                : (Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
                            this.handlePropertiesChange({ disableWeight: undefined, weight: normalized });
                        }}
                        placeholder={String(defaultWeight)}
                        className='ozw-input ozw-input--md ozw-property-input'
                    />
                </div>
            )
        ];

        return this.renderDisclosure('size-layout', 'Tamaño & Layout', true, rows.filter(Boolean) as React.ReactNode[]);
    }

    protected renderAppearanceSection(
        type: string,
        defaults: Record<string, unknown>,
        appearanceFields: ReturnType<typeof getPropertyFieldsForType>
    ): React.ReactNode[] {
        const children: React.ReactNode[] = [];
        children.push(...this.renderAlignControls(type, { alwaysShow: false }));
        // For 'text' (and any type with explicit appearance fields), always show controls so the user can change font size etc.
        const hideDefaults = type !== 'text';
        children.push(...appearanceFields.map(f => this.renderField(type, defaults, f, { hideDefaults })));
        if (children.filter(Boolean).length === 0) {
            children.push(<div key="appearance-hint" className='ozw-properties-hint'>Sin ajustes de apariencia.</div>);
        }
        return children.filter(Boolean) as React.ReactNode[];
    }

    protected renderAlignControls(type: string, opts: { alwaysShow: boolean }): React.ReactNode[] {
        const isContainer = type === 'row' || type === 'column';
        if (isContainer) {
            return [];
        }

        const meta = this.selectedComponentMetadata as Record<string, unknown>;
        const storedAlignH = meta.alignH;
        const storedAlignV = meta.alignV;
        const alignH = (storedAlignH === 'start' || storedAlignH === 'center' || storedAlignH === 'end') ? storedAlignH : '';
        const alignV = (storedAlignV === 'start' || storedAlignV === 'center' || storedAlignV === 'end') ? storedAlignV : '';

        const shouldShow = opts.alwaysShow || alignH !== '' || alignV !== '';
        if (!shouldShow) {
            return [];
        }

        return [
            (
                <div key="alignH" className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>Alineación horizontal</label>
                    <select
                        className='ozw-select ozw-select--md ozw-property-input'
                        value={alignH}
                        onChange={e => {
                            const value = e.target.value;
                            this.handlePropertyChange('alignH', value ? value : undefined);
                        }}
                    >
                        <option value=''>Por defecto</option>
                        <option value='start'>Izquierda</option>
                        <option value='center'>Centro</option>
                        <option value='end'>Derecha</option>
                    </select>
                </div>
            ),
            (
                <div key="alignV" className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>Alineación vertical</label>
                    <select
                        className='ozw-select ozw-select--md ozw-property-input'
                        value={alignV}
                        onChange={e => {
                            const value = e.target.value;
                            this.handlePropertyChange('alignV', value ? value : undefined);
                        }}
                    >
                        <option value=''>Por defecto</option>
                        <option value='start'>Arriba</option>
                        <option value='center'>Centro</option>
                        <option value='end'>Abajo</option>
                    </select>
                </div>
            )
        ];
    }

    protected renderField(
        type: string,
        defaults: Record<string, unknown>,
        field: ReturnType<typeof getPropertyFieldsForType>[number],
        opts: { hideDefaults: boolean; alwaysShow?: boolean }
    ): React.ReactNode {
        if (field.visible && !field.visible(type, this.selectedComponentMetadata)) {
            return undefined;
        }

        const meta = this.selectedComponentMetadata as Record<string, unknown>;
        const stored = meta[field.key];
        const fallback = defaults[field.key] ?? ('defaultValue' in field ? field.defaultValue : undefined);

        const alwaysShow = opts.alwaysShow === true;

        const isEffectivelyDefault = (() => {
            if (alwaysShow) {
                return false;
            }
            if (field.kind === 'customTextColor') {
                const mode = meta.textColorMode;
                const hasLegacy = typeof meta.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(meta.textColor);
                const hasLight = typeof meta.textColorLight === 'string' && /^#[0-9a-fA-F]{6}$/.test(meta.textColorLight);
                const hasDark = typeof meta.textColorDark === 'string' && /^#[0-9a-fA-F]{6}$/.test(meta.textColorDark);
                const hasCustom = mode === 'custom' || hasLegacy || hasLight || hasDark;
                return !hasCustom;
            }
            if (stored === undefined) {
                return true;
            }
            if (typeof stored === 'string' && typeof fallback === 'string') {
                return stored === fallback;
            }
            if (typeof stored === 'number' && typeof fallback === 'number') {
                return stored === fallback;
            }
            return false;
        })();

        if (opts.hideDefaults && isEffectivelyDefault) {
            return undefined;
        }

        if (field.kind === 'customTextColor') {
            return (
                <React.Fragment key={`field:${field.key}`}>
                    {renderCustomTextColorFields({
                        metadata: this.selectedComponentMetadata,
                        onChange: (changedKey, changedValue) => this.handlePropertyChange(changedKey, changedValue)
                    })}
                </React.Fragment>
            );
        }

        if (field.kind === 'select') {
            const current = typeof stored === 'string' && stored.length > 0 ? stored : '';
            return (
                <div key={`field:${field.key}`} className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>{field.label}</label>
                    <select
                        className='ozw-select ozw-select--md ozw-property-input'
                        value={current}
                        onChange={e => {
                            const value = e.target.value;
                            this.handlePropertyChange(field.key, value ? value : undefined);
                        }}
                    >
                        <option value=''>Por defecto</option>
                        {field.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            );
        }

        if (field.kind === 'color') {
            const current = typeof stored === 'string' && stored.length > 0
                ? stored
                : (typeof fallback === 'string' ? fallback : '#000000');
            return (
                <div key={`field:${field.key}`} className='ozw-field ozw-property-row'>
                    <label className='ozw-field-label ozw-property-label'>{field.label}</label>
                    <input
                        type="color"
                        className='ozw-color ozw-property-input'
                        value={current}
                        onChange={e => this.handlePropertyChange(field.key, e.target.value)}
                    />
                </div>
            );
        }

        const inputType = field.kind === 'number' ? 'number' : 'text';
        const currentValue = (() => {
            if (field.kind === 'number') {
                const parsed = typeof stored === 'number' ? stored : typeof stored === 'string' ? Number(stored) : NaN;
                return Number.isFinite(parsed) ? String(parsed) : '';
            }
            return typeof stored === 'string' ? stored : '';
        })();

        return (
            <div key={`field:${field.key}`} className='ozw-field ozw-property-row'>
                <label className='ozw-field-label ozw-property-label'>{field.label}</label>
                <ControlledInput
                    type={inputType}
                    value={currentValue}
                    onChange={raw => {
                        const normalized = field.normalize ? field.normalize(raw) : raw;
                        this.handlePropertyChange(field.key, normalized);
                    }}
                    placeholder={field.placeholder}
                    className='ozw-input ozw-input--md ozw-property-input'
                />
            </div>
        );
    }

    protected deriveSizeModeFromMetadata(metadata: ComponentMetadata): typeof this.sizeModeSelection {
        const meta = metadata as Record<string, unknown>;
        const width = typeof meta.width === 'string' ? meta.width.trim() : '';
        const height = typeof meta.height === 'string' ? meta.height.trim() : '';
        const isFullW = width === '100%';
        const isFullH = height === '100%';
        if (!width && !height) {
            return 'auto';
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
    }

    protected validateId(raw: string): string | undefined {
        const value = raw.trim();
        if (!value) {
            return 'El ID no puede estar vacío.';
        }
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
            return 'Formato inválido. Usá letras/números/guiones y que no empiece con número.';
        }
        if (this.selectedComponentId && value === this.selectedComponentId) {
            return undefined;
        }
        if (this.allComponentIds.includes(value)) {
            return 'Ese ID ya existe. Debe ser único.';
        }
        return undefined;
    }

    protected commitIdIfValid(): void {
        if (!this.selectedComponentId) {
            return;
        }
        const oldId = this.selectedComponentId;
        const newId = this.pendingId.trim();
        this.idError = this.validateId(newId);
        if (this.idError) {
            this.update();
            return;
        }
        if (newId && newId !== oldId) {
            // Emit a special event so the editor can rename ids across the document.
            if (this.onPropertyChangeCallback) {
                this.onPropertyChangeCallback({ componentId: oldId, property: '__renameId', value: newId });
            }
            // Optimistic local update so subsequent edits target the new id.
            this.selectedComponentId = newId;
            this.pendingId = newId;
            this.allComponentIds = this.allComponentIds.map(id => id === oldId ? newId : id);
            this.update();
        }
    }

    protected getDataKeysForType(type: string): Set<string> {
        if (type === 'input') {
            return new Set(['inputType', 'placeholder']);
        }
        return new Set<string>();
    }

    protected getBehaviorKeysForType(type: string): Set<string> {
        if (type === 'button') {
            return new Set(['variant', 'size']);
        }
        return new Set<string>();
    }

    protected getAppearanceKeysForType(type: string): Set<string> {
        if (type === 'row' || type === 'column') {
            return new Set(['gap', 'padding', 'alignment']);
        }
        if (type === 'text') {
            return new Set(['fontSize', 'fontWeight', 'textColorMode', 'textColorLight', 'textColorDark', 'textColor']);
        }
        return new Set<string>();
    }

    protected getSizeLayoutKeysForType(type: string): Set<string> {
        if (type === 'spacer') {
            return new Set(['space']);
        }
        return new Set<string>();
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
