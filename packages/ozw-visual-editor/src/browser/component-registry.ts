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

import * as React from '@theia/core/shared/react';
import { ComponentMetadata } from './model/ozw-types';

export type LayoutParentType = 'row' | 'column' | undefined;

export interface ToolboxComponentDefinition {
    type: string;
    label: string;
    icon: string;
    description: string;
    order: number;
}

export type PropertyFieldKind = 'input' | 'number' | 'select' | 'color' | 'customTextColor';

export interface PropertyFieldCommon {
    key: string; // metadata key
    label: string;
    description?: string;
    placeholder?: string;
    defaultValue?: string | number;
    /**
     * If provided, convert raw input string to stored value.
     * If omitted, raw string is stored as-is.
     */
    normalize?: (raw: string) => unknown;
    /**
     * If provided, controls visibility based on component type + current metadata.
     */
    visible?: (type: string, metadata: ComponentMetadata) => boolean;
}

export interface InputPropertyField extends PropertyFieldCommon {
    kind: 'input';
}

export interface NumberPropertyField extends PropertyFieldCommon {
    kind: 'number';
}

export interface ColorPropertyField extends PropertyFieldCommon {
    kind: 'color';
}

export interface SelectPropertyField extends PropertyFieldCommon {
    kind: 'select';
    options: Array<{ value: string; label: string }>;
}

export interface CustomTextColorField {
    kind: 'customTextColor';
    key: 'textColorMode';
    label: string;
    visible?: (type: string, metadata: ComponentMetadata) => boolean;
}

export type PropertyField =
    | InputPropertyField
    | NumberPropertyField
    | ColorPropertyField
    | SelectPropertyField
    | CustomTextColorField;

export interface LeafDomRenderContext {
    element: HTMLDivElement;
    metadata: ComponentMetadata;
    parentType: LayoutParentType;
}

export interface ComponentDefinition {
    type: string;
    toolbox?: ToolboxComponentDefinition;
    defaults: ComponentMetadata;
    propertyFields?: PropertyField[];
    /**
     * Applies HTML + inline styles for leaf nodes (non containers).
     * Container nodes are handled by the editor widget.
     */
    renderLeafDom?: (ctx: LeafDomRenderContext) => void;
}

const normalizePositiveNumberOr = (raw: unknown, fallback: number): number => {
    const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const normalizeWeight = (type: string, raw: unknown): number => {
    // Spacer: default 0 (fixed gap) unless user explicitly sets a weight.
    if (type === 'spacer') {
        const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    return normalizePositiveNumberOr(raw, 1);
};

export const normalizeSpace = (raw: unknown, fallback: string = '16px'): string => {
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : fallback;
};

export function applyFlexChildSizing(
    element: HTMLDivElement,
    type: string,
    metadata: ComponentMetadata,
    parentType: LayoutParentType
): void {
    if (parentType !== 'row' && parentType !== 'column') {
        return;
    }

    if (metadata.disableWeight === true) {
        // Opt-out: keep intrinsic sizing inside the flex layout.
        element.style.flexGrow = '0';
        element.style.flexShrink = '0';
        element.style.flexBasis = 'auto';
        return;
    }

    // All direct children participate with flex-grow based on weight (proportional).
    const weight = normalizeWeight(type, metadata.weight);
    element.style.flexGrow = String(weight);
    element.style.flexShrink = '1';

    if (type === 'spacer') {
        // Spacer: minimum size from `space`, but can expand via `weight`.
        const space = normalizeSpace(metadata.space, '16px');
        element.style.flexBasis = space;
        element.style.minWidth = parentType === 'row' ? space : '0';
        // Don't force min-height 0 (we learned that can collapse content).
        if (parentType === 'column') {
            element.style.minHeight = space;
        }
    } else {
        element.style.flexBasis = '0px';
        element.style.minWidth = '0';
    }
}

export function renderLeafDom(element: HTMLDivElement, type: string, metadata: ComponentMetadata, parentType: LayoutParentType): void {
    const def = getComponentDefinition(type);
    if (def?.renderLeafDom) {
        def.renderLeafDom({ element, metadata, parentType });
        return;
    }

    // Fallback (should be rare).
    element.textContent = typeof metadata.label === 'string' ? metadata.label : type;
}

export function createDefaultMetadata(type: string): ComponentMetadata {
    const def = getComponentDefinition(type);
    const defaults = def?.defaults ?? {};
    // Shallow clone is enough; nested objects are not used in metadata today.
    return { ...defaults };
}

export function getToolboxComponents(): ToolboxComponentDefinition[] {
    return Object.values(COMPONENT_DEFINITIONS)
        .map(def => def.toolbox)
        .filter((v): v is ToolboxComponentDefinition => Boolean(v))
        .slice()
        .sort((a, b) => a.order - b.order);
}

export function getComponentDefinition(type: string): ComponentDefinition | undefined {
    return COMPONENT_DEFINITIONS[type];
}

export function getComponentDisplayName(type: string, metadata?: ComponentMetadata): string {
    const label = metadata && typeof metadata.label === 'string' ? metadata.label : '';
    if (label.trim().length > 0) {
        return label.trim();
    }
    const def = getComponentDefinition(type);
    return def?.toolbox?.label ?? (type.charAt(0).toUpperCase() + type.slice(1));
}

const COMMON_FIELDS: PropertyField[] = [
    { kind: 'input', key: 'label', label: 'Label', placeholder: 'Component label', defaultValue: '' },
    {
        kind: 'input',
        key: 'width',
        label: 'Width',
        placeholder: 'auto',
        defaultValue: '',
        normalize: raw => {
            const trimmed = raw.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
    },
    {
        kind: 'input',
        key: 'height',
        label: 'Height',
        placeholder: 'auto',
        defaultValue: '',
        normalize: raw => {
            const trimmed = raw.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
    },
    {
        kind: 'number',
        key: 'weight',
        label: 'Peso',
        placeholder: '1',
        defaultValue: 1,
        normalize: raw => {
            const trimmed = raw.trim();
            if (!trimmed) {
                return undefined;
            }
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? parsed : 1;
        }
    },
];

export function getPropertyFieldsForType(type: string): PropertyField[] {
    const def = getComponentDefinition(type);
    const specific = def?.propertyFields ?? [];

    const common = (() => {
        return COMMON_FIELDS.map(field => {
            if (field.kind !== 'number' || field.key !== 'weight') {
                return field;
            }
            if (type === 'spacer') {
                return {
                    ...field,
                    defaultValue: 0,
                    placeholder: '0',
                    normalize: raw => {
                        const trimmed = raw.trim();
                        if (!trimmed) {
                            return undefined;
                        }
                        const parsed = Number(trimmed);
                        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
                    }
                } satisfies PropertyField;
            }
            return {
                ...field,
                normalize: raw => {
                    const trimmed = raw.trim();
                    if (!trimmed) {
                        return undefined;
                    }
                    const parsed = Number(trimmed);
                    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                }
            } satisfies PropertyField;
        });
    })();

    return [...common, ...specific];
}

// --- Definitions -------------------------------------------------------------

const COMPONENT_DEFINITIONS: Record<string, ComponentDefinition> = {
    column: {
        type: 'column',
        toolbox: {
            type: 'column',
            label: 'Column',
            icon: 'fa fa-bars',
            description: 'Vertical layout container - stacks children vertically',
            order: 10
        },
        defaults: { label: 'Columna' },
        propertyFields: [
            {
                kind: 'select',
                key: 'gap',
                label: 'Gap',
                defaultValue: '8px',
                options: [
                    { value: '0', label: 'None' },
                    { value: '4px', label: 'Small (4px)' },
                    { value: '8px', label: 'Medium (8px)' },
                    { value: '12px', label: 'Large (12px)' },
                    { value: '16px', label: 'XLarge (16px)' },
                ]
            },
            {
                kind: 'select',
                key: 'padding',
                label: 'Padding',
                defaultValue: '8px',
                options: [
                    { value: '0', label: 'None' },
                    { value: '4px', label: 'Small (4px)' },
                    { value: '8px', label: 'Medium (8px)' },
                    { value: '12px', label: 'Large (12px)' },
                    { value: '16px', label: 'XLarge (16px)' },
                ]
            },
            {
                kind: 'select',
                key: 'alignment',
                label: 'Alignment',
                defaultValue: 'start',
                options: [
                    { value: 'start', label: 'Start' },
                    { value: 'center', label: 'Center' },
                    { value: 'end', label: 'End' },
                    { value: 'stretch', label: 'Stretch' },
                ]
            }
        ]
    },
    row: {
        type: 'row',
        toolbox: {
            type: 'row',
            label: 'Row',
            icon: 'fa fa-grip-lines',
            description: 'Horizontal layout container - arranges children horizontally',
            order: 20
        },
        defaults: { label: 'Fila' },
        propertyFields: [
            {
                kind: 'select',
                key: 'gap',
                label: 'Gap',
                defaultValue: '8px',
                options: [
                    { value: '0', label: 'None' },
                    { value: '4px', label: 'Small (4px)' },
                    { value: '8px', label: 'Medium (8px)' },
                    { value: '12px', label: 'Large (12px)' },
                    { value: '16px', label: 'XLarge (16px)' },
                ]
            },
            {
                kind: 'select',
                key: 'padding',
                label: 'Padding',
                defaultValue: '8px',
                options: [
                    { value: '0', label: 'None' },
                    { value: '4px', label: 'Small (4px)' },
                    { value: '8px', label: 'Medium (8px)' },
                    { value: '12px', label: 'Large (12px)' },
                    { value: '16px', label: 'XLarge (16px)' },
                ]
            },
            {
                kind: 'select',
                key: 'alignment',
                label: 'Alignment',
                defaultValue: 'start',
                options: [
                    { value: 'start', label: 'Start' },
                    { value: 'center', label: 'Center' },
                    { value: 'end', label: 'End' },
                    { value: 'stretch', label: 'Stretch' },
                ]
            }
        ]
    },
    spacer: {
        type: 'spacer',
        toolbox: {
            type: 'spacer',
            label: 'Spacer',
            icon: 'fa fa-arrows-alt-h',
            description: 'Espaciador: crea espacio horizontal/vertical dentro de layouts',
            order: 30
        },
        defaults: { label: 'Spacer', space: '16px', weight: 0 },
        propertyFields: [
            { kind: 'input', key: 'space', label: 'Espacio', placeholder: '16px', defaultValue: '16px' },
        ],
        renderLeafDom: ({ element, metadata, parentType }) => {
            const baseHeight = '36px';
            const space = normalizeSpace(metadata.space, '16px');

            element.style.padding = '0';
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'center';
            element.style.border = '1px dashed rgba(127, 127, 127, 0.35)';
            element.style.borderRadius = '6px';
            element.style.backgroundColor = 'rgba(127, 127, 127, 0.10)';
            element.style.color = 'rgba(200, 200, 200, 0.75)';
            element.style.fontSize = '11px';
            element.style.letterSpacing = '0.4px';
            element.style.userSelect = 'none';

            if (parentType === 'row') {
                // Horizontal spacer: width is controlled by flex sizing (space = min).
                element.style.height = baseHeight;
                element.innerHTML = `<span>Spacer (${space})</span>`;
            } else if (parentType === 'column') {
                // Vertical spacer: height is controlled by flex sizing (space = min).
                element.style.width = '100%';
                element.innerHTML = `<span>Spacer (${space})</span>`;
            } else {
                element.style.width = baseHeight;
                element.style.height = baseHeight;
                element.innerHTML = `<span>Spacer</span>`;
            }
        }
    },
    button: {
        type: 'button',
        toolbox: {
            type: 'button',
            label: 'Button',
            icon: 'fa fa-hand-pointer',
            description: 'Clickable button element',
            order: 40
        },
        defaults: { label: 'Button', variant: 'primary', size: 'medium' },
        propertyFields: [
            {
                kind: 'select',
                key: 'variant',
                label: 'Variant',
                defaultValue: 'primary',
                options: [
                    { value: 'primary', label: 'Primary' },
                    { value: 'secondary', label: 'Secondary' },
                    { value: 'success', label: 'Success' },
                    { value: 'danger', label: 'Danger' },
                ]
            },
            {
                kind: 'select',
                key: 'size',
                label: 'Size',
                defaultValue: 'medium',
                options: [
                    { value: 'small', label: 'Small' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large', label: 'Large' },
                ]
            },
        ],
        renderLeafDom: ({ element, metadata }) => {
            const baseHeight = '36px';
            const rawVariant = typeof metadata.variant === 'string' ? metadata.variant : 'primary';
            const variant = ['primary', 'secondary', 'success', 'danger', 'ghost'].includes(rawVariant) ? rawVariant : 'primary';
            const rawSize = typeof metadata.size === 'string' ? metadata.size : 'medium';
            const size = rawSize === 'small' ? 'sm' : rawSize === 'large' ? 'lg' : 'md';
            const hasExplicitWidth = typeof metadata.width === 'string' && metadata.width.trim().length > 0;
            const blockClass = hasExplicitWidth ? ' ozw-btn--block' : '';
            element.innerHTML = `<button class="ozw-btn ozw-btn--${variant} ozw-btn--${size}${blockClass}">${metadata.label || 'Button'}</button>`;
            element.style.backgroundColor = 'transparent';
            element.style.padding = '0';
            element.style.height = baseHeight;
            element.style.display = 'flex';
            element.style.alignItems = 'center';
        }
    },
    input: {
        type: 'input',
        toolbox: {
            type: 'input',
            label: 'Input',
            icon: 'fa fa-keyboard',
            description: 'Text input field',
            order: 50
        },
        defaults: { label: 'Input', inputType: 'text', placeholder: '' },
        propertyFields: [
            { kind: 'input', key: 'placeholder', label: 'Placeholder', placeholder: 'Enter placeholder text', defaultValue: '' },
            {
                kind: 'select',
                key: 'inputType',
                label: 'Input Type',
                defaultValue: 'text',
                options: [
                    { value: 'text', label: 'Text' },
                    { value: 'email', label: 'Email' },
                    { value: 'password', label: 'Password' },
                    { value: 'number', label: 'Number' },
                ]
            }
        ],
        renderLeafDom: ({ element, metadata }) => {
            const rawInputType = typeof metadata.inputType === 'string' ? metadata.inputType : 'text';
            const inputType = ['text', 'email', 'password', 'number'].includes(rawInputType) ? rawInputType : 'text';
            const label = (metadata.label as string) || 'Input';
            const placeholder = (metadata.placeholder as string) || '';
            element.innerHTML = `
                <div class="ozw-field ozw-field--canvas">
                    <div class="ozw-field-label">${label}</div>
                    <input type="${inputType}" class="ozw-input ozw-input--md" placeholder="${placeholder}" />
                </div>
            `;
            element.style.backgroundColor = 'transparent';
            element.style.padding = '0';
            element.style.height = 'auto';
            element.style.display = 'block';
        }
    },
    text: {
        type: 'text',
        toolbox: {
            type: 'text',
            label: 'Text',
            icon: 'fa fa-font',
            description: 'Text label element',
            order: 60
        },
        defaults: { label: 'Text', fontSize: '13px', fontWeight: 'normal', textColorMode: 'system' },
        propertyFields: [
            {
                kind: 'select',
                key: 'fontSize',
                label: 'Font Size',
                defaultValue: '13px',
                options: [
                    { value: '11px', label: 'Small (11px)' },
                    { value: '13px', label: 'Medium (13px)' },
                    { value: '16px', label: 'Large (16px)' },
                    { value: '20px', label: 'XLarge (20px)' },
                ]
            },
            {
                kind: 'select',
                key: 'fontWeight',
                label: 'Font Weight',
                defaultValue: 'normal',
                options: [
                    { value: 'normal', label: 'Normal' },
                    { value: 'bold', label: 'Bold' },
                    { value: 'lighter', label: 'Light' },
                ]
            },
            { kind: 'customTextColor', key: 'textColorMode', label: 'Text Color' }
        ],
        renderLeafDom: ({ element, metadata }) => {
            const baseHeight = '36px';
            element.innerHTML = `<p class="ozw-modern-text">${metadata.label || 'Text'}</p>`;
            element.style.backgroundColor = 'transparent';
            element.style.padding = '0 8px';
            element.style.height = baseHeight;
            element.style.display = 'flex';
            element.style.alignItems = 'center';

            const textElement = element.querySelector('p.ozw-modern-text') as HTMLElement | null;
            if (textElement) {
                if (typeof metadata.fontSize === 'string' && metadata.fontSize.length > 0) {
                    textElement.style.fontSize = metadata.fontSize;
                }
                if (typeof metadata.fontWeight === 'string' && metadata.fontWeight.length > 0) {
                    textElement.style.fontWeight = metadata.fontWeight;
                }

                const mode = (metadata.textColorMode === 'system' || metadata.textColorMode === 'custom')
                    ? metadata.textColorMode
                    : undefined;
                const legacyTextColor = typeof metadata.textColor === 'string' ? metadata.textColor : undefined;
                const light = typeof metadata.textColorLight === 'string' ? metadata.textColorLight : legacyTextColor;
                const dark = typeof metadata.textColorDark === 'string' ? metadata.textColorDark : legacyTextColor;
                const isCustom = mode === 'custom' || (!mode && (typeof light === 'string' || typeof dark === 'string'));

                textElement.style.removeProperty('color');
                if (isCustom) {
                    if (typeof light === 'string' && light.length > 0) {
                        textElement.style.setProperty('--ozw-text-color-light', light);
                    }
                    if (typeof dark === 'string' && dark.length > 0) {
                        textElement.style.setProperty('--ozw-text-color-dark', dark);
                    }
                } else {
                    textElement.style.removeProperty('--ozw-text-color-light');
                    textElement.style.removeProperty('--ozw-text-color-dark');
                }
            }
        }
    },
    image: {
        type: 'image',
        toolbox: {
            type: 'image',
            label: 'Image',
            icon: 'fa fa-image',
            description: 'Image placeholder',
            order: 70
        },
        defaults: { label: 'Image' },
        renderLeafDom: ({ element }) => {
            const baseHeight = '36px';
            element.innerHTML = `<div class="ozw-modern-image">
                <i class="fa fa-image" style="font-size: 20px; color: #999;"></i>
            </div>`;
            element.style.padding = '0';
            element.style.height = baseHeight;
            element.style.display = 'flex';
            element.style.alignItems = 'center';
        }
    },
    card: {
        type: 'card',
        toolbox: {
            type: 'card',
            label: 'Card',
            icon: 'fa fa-id-card',
            description: 'Container card component',
            order: 80
        },
        defaults: { label: 'Card Title' },
        renderLeafDom: ({ element, metadata }) => {
            element.innerHTML = `<div class="ozw-modern-card">
                <h4>${metadata.label || 'Card Title'}</h4>
                <p>Card content</p>
            </div>`;
            element.style.padding = '0';
        }
    },
    container: {
        type: 'container',
        toolbox: {
            type: 'container',
            label: 'Container',
            icon: 'fa fa-square',
            description: 'Generic container',
            order: 90
        },
        defaults: { label: 'Container' },
        renderLeafDom: ({ element, metadata }) => {
            element.innerHTML = `<div class="ozw-modern-container">
                <p>${metadata.label || 'Container'}</p>
            </div>`;
            element.style.padding = '0';
        }
    },
};

// React helpers for properties widget (special-case complex controls).
export function renderCustomTextColorFields(args: {
    metadata: ComponentMetadata;
    onChange: (key: string, value: unknown) => void;
}): React.ReactNode {
    const { metadata, onChange } = args;
    type TextColorMode = 'system' | 'custom';
    const isValidHex6 = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

    const legacyTextColor = isValidHex6(metadata.textColor) ? metadata.textColor : undefined;
    const storedMode = metadata.textColorMode;
    const textColorMode: TextColorMode = storedMode === 'system' || storedMode === 'custom'
        ? storedMode
        : (legacyTextColor || isValidHex6(metadata.textColorLight) || isValidHex6(metadata.textColorDark))
            ? 'custom'
            : 'system';

    const textColorLight = isValidHex6(metadata.textColorLight) ? metadata.textColorLight : (legacyTextColor ?? '#000000');
    const textColorDark = isValidHex6(metadata.textColorDark) ? metadata.textColorDark : (legacyTextColor ?? '#ffffff');

    const modeRow = React.createElement(
        'div',
        { key: 'textColorMode', className: 'ozw-field ozw-property-row' },
        React.createElement('label', { className: 'ozw-field-label ozw-property-label' }, 'Text Color'),
        React.createElement(
            'select',
            {
                className: 'ozw-select ozw-select--md ozw-property-input',
                value: textColorMode,
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                    const value = e.target.value as TextColorMode;
                    onChange('textColorMode', value);
                    if (value === 'custom') {
                        if (!isValidHex6(metadata.textColorLight)) {
                            onChange('textColorLight', textColorLight);
                        }
                        if (!isValidHex6(metadata.textColorDark)) {
                            onChange('textColorDark', textColorDark);
                        }
                    }
                }
            },
            React.createElement('option', { value: 'system' }, 'System theme'),
            React.createElement('option', { value: 'custom' }, 'Custom')
        )
    );

    const customRows: React.ReactNode[] = textColorMode === 'custom'
        ? [
            React.createElement(
                'div',
                { key: 'textColorLight', className: 'ozw-field ozw-property-row' },
                React.createElement('label', { className: 'ozw-field-label ozw-property-label' }, 'Text Color (Light)'),
                React.createElement('input', {
                    type: 'color',
                    className: 'ozw-color ozw-property-input',
                    value: textColorLight,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        onChange('textColorMode', 'custom');
                        onChange('textColorLight', e.target.value);
                    }
                })
            ),
            React.createElement(
                'div',
                { key: 'textColorDark', className: 'ozw-field ozw-property-row' },
                React.createElement('label', { className: 'ozw-field-label ozw-property-label' }, 'Text Color (Dark)'),
                React.createElement('input', {
                    type: 'color',
                    className: 'ozw-color ozw-property-input',
                    value: textColorDark,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        onChange('textColorMode', 'custom');
                        onChange('textColorDark', e.target.value);
                    }
                })
            ),
        ]
        : [];

    return React.createElement(React.Fragment, null, modeRow, ...customRows);
}

