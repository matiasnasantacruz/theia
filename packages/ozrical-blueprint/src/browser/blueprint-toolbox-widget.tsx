// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, Message } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import type { BlueprintNodeType } from '../domain/entities/blueprint-types';

export interface ToolboxNodeItem {
    type: BlueprintNodeType;
    label: string;
    icon: string;
    description: string;
    category: 'root' | 'navigation' | 'logic' | 'data';
}

const TOOLBOX_ITEMS: ToolboxNodeItem[] = [
    { type: 'app_router', label: 'App Router', icon: 'fa fa-sitemap', description: 'Punto de entrada de la aplicación (raíz)', category: 'root' },
    { type: 'menu', label: 'Menu', icon: 'fa fa-bars', description: 'Navigation menu', category: 'navigation' },
    { type: 'view', label: 'View', icon: 'fa fa-window-maximize', description: 'Screen or view', category: 'navigation' },
    { type: 'modal', label: 'Modal', icon: 'fa fa-window-restore', description: 'Modal dialog', category: 'navigation' },
    { type: 'auth', label: 'Auth', icon: 'fa fa-lock', description: 'Authentication point', category: 'logic' },
    { type: 'access_gate', label: 'Access Gate', icon: 'fa fa-door-open', description: 'Role-based gate', category: 'logic' },
    { type: 'access_context', label: 'Access Context', icon: 'fa fa-filter', description: 'Read/write context', category: 'logic' },
    { type: 'redirector', label: 'Redirector', icon: 'fa fa-forward', description: 'Redirect flow', category: 'logic' },
    { type: 'switch_role', label: 'Switch (roles)', icon: 'fa fa-code-branch', description: 'Branch by role', category: 'logic' },
    { type: 'connector', label: 'Connector', icon: 'fa fa-plug', description: 'Data connector', category: 'data' },
    { type: 'state_injection', label: 'State Injection', icon: 'fa fa-database', description: 'Inject state', category: 'data' }
];

@injectable()
export class BlueprintToolboxWidget extends BaseWidget {

    static readonly ID = 'blueprint-toolbox';
    static readonly LABEL = 'Blueprint Toolbox';

    private root: Root | undefined;

    @postConstruct()
    protected init(): void {
        this.id = BlueprintToolboxWidget.ID;
        this.title.label = BlueprintToolboxWidget.LABEL;
        this.title.caption = BlueprintToolboxWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-th-large';
        this.addClass('blueprint-toolbox-widget');
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

    protected handleDragStart(e: React.DragEvent, item: ToolboxNodeItem): void {
        e.dataTransfer.setData('application/x-blueprint-node-type', item.type);
        e.dataTransfer.setData('application/x-blueprint-node-label', item.label);
        e.dataTransfer.effectAllowed = 'copy';
    }

    protected render(): React.ReactNode {
        const root = TOOLBOX_ITEMS.filter(i => i.category === 'root');
        const nav = TOOLBOX_ITEMS.filter(i => i.category === 'navigation');
        const logic = TOOLBOX_ITEMS.filter(i => i.category === 'logic');
        const data = TOOLBOX_ITEMS.filter(i => i.category === 'data');
        return (
            <div className='blueprint-toolbox-container'>
                <div className='blueprint-toolbox-header'>
                    <h3>+ Nodes</h3>
                    <p>Arrastra al lienzo. Empieza por App Router.</p>
                </div>
                <div className='blueprint-toolbox-section blueprint-toolbox-section--root'>
                    <h4>Raíz (punto de entrada)</h4>
                    {root.map(item => (
                        <div
                            key={item.type}
                            className='blueprint-toolbox-item blueprint-toolbox-item--app-router'
                            draggable={true}
                            onDragStart={e => this.handleDragStart(e, item)}
                            title={item.description}
                        >
                            <i className={item.icon}></i>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
                <div className='blueprint-toolbox-section'>
                    <h4>Navigation</h4>
                    {nav.map(item => (
                        <div
                            key={item.type}
                            className='blueprint-toolbox-item'
                            draggable={true}
                            onDragStart={e => this.handleDragStart(e, item)}
                            title={item.description}
                        >
                            <i className={item.icon}></i>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
                <div className='blueprint-toolbox-section'>
                    <h4>Logic</h4>
                    {logic.map(item => (
                        <div
                            key={item.type}
                            className='blueprint-toolbox-item'
                            draggable={true}
                            onDragStart={e => this.handleDragStart(e, item)}
                            title={item.description}
                        >
                            <i className={item.icon}></i>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
                <div className='blueprint-toolbox-section'>
                    <h4>Data</h4>
                    {data.map(item => (
                        <div
                            key={item.type}
                            className='blueprint-toolbox-item'
                            draggable={true}
                            onDragStart={e => this.handleDragStart(e, item)}
                            title={item.description}
                        >
                            <i className={item.icon}></i>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}
