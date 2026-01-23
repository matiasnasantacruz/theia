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
import { BaseWidget, Message } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';

export interface ToolboxComponent {
    type: string;
    label: string;
    icon: string;
    description: string;
}

const TOOLBOX_COMPONENTS: ToolboxComponent[] = [
    { type: 'column', label: 'Column', icon: 'fa fa-bars', description: 'Vertical layout container - stacks children vertically' },
    { type: 'row', label: 'Row', icon: 'fa fa-grip-lines', description: 'Horizontal layout container - arranges children horizontally' },
    { type: 'button', label: 'Button', icon: 'fa fa-hand-pointer', description: 'Clickable button element' },
    { type: 'input', label: 'Input', icon: 'fa fa-keyboard', description: 'Text input field' },
    { type: 'card', label: 'Card', icon: 'fa fa-id-card', description: 'Container card component' },
    { type: 'container', label: 'Container', icon: 'fa fa-square', description: 'Generic container' },
    { type: 'text', label: 'Text', icon: 'fa fa-font', description: 'Text label element' },
    { type: 'image', label: 'Image', icon: 'fa fa-image', description: 'Image placeholder' },
];

@injectable()
export class OzwToolboxWidget extends BaseWidget {

    static readonly ID = 'ozw-toolbox';
    static readonly LABEL = 'Component Toolbox';
    
    private root: Root | undefined;

    @postConstruct()
    protected init(): void {
        this.id = OzwToolboxWidget.ID;
        this.title.label = OzwToolboxWidget.LABEL;
        this.title.caption = OzwToolboxWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-toolbox';

        this.addClass('ozw-toolbox-widget');
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

    protected render(): React.ReactNode {
        return (
            <div className='ozw-toolbox-container'>
                <div className='ozw-toolbox-header'>
                    <h3>Components</h3>
                    <p>Drag components to the canvas</p>
                </div>
                <div className='ozw-toolbox-list'>
                    {TOOLBOX_COMPONENTS.map(component => (
                        <div
                            key={component.type}
                            className='ozw-toolbox-item'
                            draggable={true}
                            onDragStart={(e) => this.handleDragStart(e, component)}
                            title={component.description}
                        >
                            <div className='ozw-toolbox-item-icon'>
                                <i className={component.icon}></i>
                            </div>
                            <div className='ozw-toolbox-item-content'>
                                <div className='ozw-toolbox-item-label'>{component.label}</div>
                                <div className='ozw-toolbox-item-description'>{component.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className='ozw-toolbox-footer'>
                    <div className='ozw-toolbox-info'>
                        <i className='fa fa-info-circle'></i>
                        <span>More components coming soon!</span>
                    </div>
                </div>
            </div>
        );
    }

    protected handleDragStart(event: React.DragEvent<HTMLDivElement>, component: ToolboxComponent): void {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/ozw-component', JSON.stringify(component));
        
        // Create a visual drag image
        const dragImage = document.createElement('div');
        dragImage.className = 'ozw-drag-preview';
        dragImage.innerHTML = `<i class="${component.icon}"></i> ${component.label}`;
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        dragImage.style.padding = '8px 12px';
        dragImage.style.backgroundColor = 'var(--theia-badge-background)';
        dragImage.style.color = 'var(--theia-badge-foreground)';
        dragImage.style.borderRadius = '4px';
        dragImage.style.fontSize = '12px';
        document.body.appendChild(dragImage);
        event.dataTransfer.setDragImage(dragImage, 0, 0);
        
        // Clean up drag image after drag starts
        setTimeout(() => {
            document.body.removeChild(dragImage);
        }, 0);
    }
}
