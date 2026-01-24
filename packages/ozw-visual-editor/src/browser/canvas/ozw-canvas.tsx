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
import { canHaveChildren } from '../model/ozw-document-model';
import { OzwDocument, TreeNode } from '../model/ozw-types';
import { ComponentRendererRegistry } from './component-renderer-registry';

export interface OzwCanvasProps {
    document: OzwDocument;
    selectedComponentId: string | undefined;
    registry: ComponentRendererRegistry;

    onSelectComponent: (id: string) => void;
    onDeselect: () => void;
    onDeleteComponent: (id: string) => void;
    onRequestFocus: () => void;

    onDragStartComponent: (componentId: string) => void;
    onDragEndComponent: (componentId: string) => void;

    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
}

export const OzwCanvas: React.FC<OzwCanvasProps> = props => {
    const { document } = props;

    const handleWorkspaceClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        props.onRequestFocus();
        if (!target.closest('.ozw-component')) {
            props.onDeselect();
        }
    };

    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const metadata = document.schema.metadata[node.id] || {};
        const isContainer = canHaveChildren(node.type);
        const isSelected = props.selectedComponentId === node.id;

        const baseStyle: React.CSSProperties = {
            position: 'relative',
        };

        const wrapperStyle: React.CSSProperties = { ...baseStyle };
        const contentStyle: React.CSSProperties = {};

        let header: React.ReactNode | undefined;
        let childrenHostClass = '';

        if (node.type === 'column') {
            Object.assign(wrapperStyle, {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '12px',
                border: '2px dashed #007acc',
                borderRadius: '4px',
                minHeight: '100px',
                minWidth: '100px',
                backgroundColor: 'rgba(0, 122, 204, 0.05)',
            } satisfies React.CSSProperties);

            const typeName = 'Columna';
            const displayName = typeof metadata.label === 'string' ? metadata.label.trim() : '';
            header = (
                <div className='ozw-container-label ozw-layout-header ozw-layout-header--column'>
                    {displayName && displayName !== typeName ? `${typeName}: ${displayName}` : typeName}
                </div>
            );
            childrenHostClass = 'ozw-layout-content ozw-layout-content--column';
        } else if (node.type === 'row') {
            Object.assign(wrapperStyle, {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '8px 10px',
                border: '2px dashed #10a37f',
                borderRadius: '4px',
                minWidth: '100px',
                backgroundColor: 'rgba(16, 163, 127, 0.05)',
            } satisfies React.CSSProperties);

            const typeName = 'Fila';
            const displayName = typeof metadata.label === 'string' ? metadata.label.trim() : '';
            header = (
                <div className='ozw-container-label ozw-layout-header ozw-layout-header--row'>
                    {displayName && displayName !== typeName ? `${typeName}: ${displayName}` : typeName}
                </div>
            );
            childrenHostClass = 'ozw-layout-content ozw-layout-content--row';
        } else {
            Object.assign(wrapperStyle, {
                padding: '8px 16px',
                cursor: 'move',
            } satisfies React.CSSProperties);
        }

        const leafRenderer = props.registry.get(node.type);
        const leafContent = !isContainer
            ? (leafRenderer ? leafRenderer(metadata) : (metadata.label as string || node.type))
            : undefined;

        // Match previous per-type wrapper styling.
        if (node.type === 'button') {
            Object.assign(wrapperStyle, {
                backgroundColor: 'transparent',
                padding: 0,
                height: '36px',
                display: 'flex',
                alignItems: 'center',
            } satisfies React.CSSProperties);
        } else if (node.type === 'input') {
            Object.assign(wrapperStyle, {
                backgroundColor: 'transparent',
                padding: 0,
                height: 'auto',
                display: 'block',
            } satisfies React.CSSProperties);
        } else if (node.type === 'text') {
            Object.assign(wrapperStyle, {
                backgroundColor: 'transparent',
                padding: '0 8px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
            } satisfies React.CSSProperties);
        } else if (node.type === 'image') {
            Object.assign(wrapperStyle, {
                padding: 0,
                height: '36px',
                display: 'flex',
                alignItems: 'center',
            } satisfies React.CSSProperties);
        } else if (node.type === 'card' || node.type === 'container') {
            Object.assign(wrapperStyle, { padding: 0 } satisfies React.CSSProperties);
        }

        const onClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            props.onRequestFocus();
            props.onSelectComponent(node.id);
        };

        const onDragStart = (e: React.DragEvent) => {
            e.stopPropagation();
            props.onRequestFocus();
            props.onDragStartComponent(node.id);
        };

        const onDragEnd = (e: React.DragEvent) => {
            e.stopPropagation();
            props.onRequestFocus();
            props.onDragEndComponent(node.id);
        };

        const onDragOver = (e: React.DragEvent) => props.onDragOver(e.nativeEvent);
        const onDrop = (e: React.DragEvent) => props.onDrop(e.nativeEvent);
        const onDragLeave = (e: React.DragEvent) => props.onDragLeave(e.nativeEvent);

        const className = [
            'ozw-component',
            `ozw-component-${node.type}`,
            isSelected ? 'ozw-selected' : ''
        ].filter(Boolean).join(' ');

        const children = node.children && node.children.length > 0
            ? node.children.map(child => renderNode(child, depth + 1))
            : undefined;

        const placeholder = isContainer && (!node.children || node.children.length === 0)
            ? (
                <div
                    className='ozw-container-placeholder'
                    style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: '#999',
                        fontSize: '12px',
                        fontStyle: 'italic',
                        pointerEvents: 'none'
                    }}
                >
                    {node.type === 'column' ? 'Arrastra componentes aquí (vertical)' : 'Arrastra componentes aquí (horizontal)'}
                </div>
            )
            : undefined;

        const deleteButton = isSelected ? (
            <button
                className='ozw-delete-button'
                title='Delete component (or press Delete key)'
                style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    zIndex: 1000,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
                onClick={e => {
                    e.stopPropagation();
                    props.onDeleteComponent(node.id);
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#c0392b')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#e74c3c')}
            >
                <i className='fa fa-times'></i>
            </button>
        ) : undefined;

        const nodeContent = isContainer ? (
            <div className={childrenHostClass} style={contentStyle}>
                {children}
                {placeholder}
            </div>
        ) : (
            leafContent
        );

        return (
            <div
                key={node.id}
                className={className}
                style={wrapperStyle}
                draggable={true}
                data-component-id={node.id}
                data-component-type={node.type}
                onClick={onClick}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragLeave={onDragLeave}
            >
                {header}
                {nodeContent}
                {deleteButton}
            </div>
        );
    };

    return (
        <React.Fragment>
            <div className='ozw-canvas-header'>
                <h3>Visual Canvas</h3>
                <p>Drag components from the toolbox to start building</p>
            </div>
            <div
                className='ozw-canvas-workspace'
                style={{
                    minHeight: '400px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0
                }}
                onDragOver={e => props.onDragOver(e.nativeEvent)}
                onDrop={e => props.onDrop(e.nativeEvent)}
                onDragLeave={e => props.onDragLeave(e.nativeEvent)}
                onClick={handleWorkspaceClick}
            >
                {document.schema.tree.length === 0 ? (
                    <div className='ozw-empty-state'>
                        <div className='ozw-empty-content'>
                            <i className='fa fa-bars' style={{ fontSize: '48px', color: '#ccc', marginBottom: '16px' }}></i>
                            <p style={{ fontSize: '16px', color: '#666' }}>
                                Arrastra una <strong>Columna</strong> aquí para empezar
                            </p>
                        </div>
                    </div>
                ) : (
                    document.schema.tree.map(node => renderNode(node))
                )}
            </div>
        </React.Fragment>
    );
};

