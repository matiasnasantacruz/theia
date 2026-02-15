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

@injectable()
export class BlueprintInspectorWidget extends BaseWidget {

    static readonly ID = 'blueprint-inspector';
    static readonly LABEL = 'Blueprint Inspector';

    private root: Root | undefined;

    @postConstruct()
    protected init(): void {
        this.id = BlueprintInspectorWidget.ID;
        this.title.label = BlueprintInspectorWidget.LABEL;
        this.title.caption = BlueprintInspectorWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-cog';
        this.addClass('blueprint-inspector-widget');
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
            <div className='blueprint-inspector-container'>
                <div className='blueprint-inspector-header'>
                    <h3>Definitions</h3>
                    <p>Access gates, Access contexts, User profile</p>
                </div>
                <div className='blueprint-inspector-section'>
                    <h4>Access gates</h4>
                    <p className='blueprint-inspector-hint'>Select an Access Gate node to edit.</p>
                </div>
                <div className='blueprint-inspector-section'>
                    <h4>Access contexts</h4>
                    <p className='blueprint-inspector-hint'>Select an Access Context node to edit.</p>
                </div>
                <div className='blueprint-inspector-section'>
                    <h4>User Profile</h4>
                    <p className='blueprint-inspector-hint'>+ Add role</p>
                </div>
            </div>
        );
    }
}
