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

import { addComponent, canHaveChildren, findParentId, moveComponent, TreeInsertPosition } from '../model/ozw-document-model';
import { OzwDocument } from '../model/ozw-types';

export class OzwDndService {
    protected draggedComponentId: string | undefined;
    protected dropIndicator: HTMLDivElement | undefined;
    protected dropPosition: TreeInsertPosition | undefined;
    protected lastIndicatorTargetId: string | undefined;
    protected dragOverRaf: number | undefined;
    protected pendingDragOver: { target: HTMLElement; clientX: number; clientY: number } | undefined;

    setDraggedComponentId(id: string | undefined): void {
        this.draggedComponentId = id;
    }

    getDropPosition(): TreeInsertPosition | undefined {
        return this.dropPosition;
    }

    handleDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = this.draggedComponentId ? 'move' : 'copy';
        }

        this.pendingDragOver = {
            target: event.currentTarget as HTMLElement,
            clientX: event.clientX,
            clientY: event.clientY
        };

        if (this.dragOverRaf === undefined) {
            this.dragOverRaf = window.requestAnimationFrame(() => {
                this.dragOverRaf = undefined;
                const pending = this.pendingDragOver;
                this.pendingDragOver = undefined;
                if (pending) {
                    this.flushDragOver(pending.target, pending.clientX, pending.clientY);
                }
            });
        }
    }

    handleDragLeave(event: DragEvent): void {
        const target = event.currentTarget as HTMLElement;
        const relatedTarget = event.relatedTarget as HTMLElement;
        if (relatedTarget && target.contains(relatedTarget)) {
            return;
        }
        target.classList.remove('ozw-drop-target');
        this.hideDropIndicator();
    }

    handleDrop(doc: OzwDocument, event: DragEvent): { changed: boolean } {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget as HTMLElement;
        target.classList.remove('ozw-drop-target');
        this.hideDropIndicator();

        const actualTarget = this.findDropTarget(event);

        const componentDataStr = event.dataTransfer?.getData('application/ozw-component');
        if (componentDataStr) {
            const componentData = JSON.parse(componentDataStr) as { type?: string };
            if (typeof componentData.type !== 'string') {
                return { changed: false };
            }
            return { changed: this.addComponentToTarget(doc, componentData.type, actualTarget) };
        }

        if (this.draggedComponentId) {
            return { changed: this.moveComponentToTarget(doc, this.draggedComponentId, actualTarget) };
        }

        return { changed: false };
    }

    clearAfterDrop(): void {
        this.dropPosition = undefined;
        this.lastIndicatorTargetId = undefined;
    }

    cleanupAfterDragEnd(): void {
        this.draggedComponentId = undefined;
        this.dropPosition = undefined;
        this.lastIndicatorTargetId = undefined;
        if (this.dragOverRaf !== undefined) {
            window.cancelAnimationFrame(this.dragOverRaf);
            this.dragOverRaf = undefined;
        }
        this.pendingDragOver = undefined;
        document.querySelectorAll('.ozw-drop-target').forEach(el => el.classList.remove('ozw-drop-target'));
        this.removeDropIndicator();
    }

    protected flushDragOver(target: HTMLElement, clientX: number, clientY: number): void {
        const targetId = target.getAttribute('data-component-id') ?? undefined;
        const targetType = target.getAttribute('data-component-type') ?? undefined;

        if (targetId && targetId === this.draggedComponentId) {
            this.hideDropIndicator();
            return;
        }

        if (targetType && canHaveChildren(targetType)) {
            this.dropPosition = 'inside';
            target.classList.add('ozw-drop-target');
            this.hideDropIndicator();
            return;
        }

        if (targetId) {
            this.showDropIndicator(target, clientX, clientY);
            target.classList.remove('ozw-drop-target');
            return;
        }

        target.classList.add('ozw-drop-target');
        this.hideDropIndicator();
    }

    protected findDropTarget(event: DragEvent): HTMLElement {
        const elementsUnderMouse = document.elementsFromPoint(event.clientX, event.clientY);
        let smallestComponent: HTMLElement | undefined;
        let smallestArea = Infinity;

        for (const element of elementsUnderMouse) {
            if (!(element instanceof HTMLElement)) {
                continue;
            }
            if (element.classList.contains('ozw-container-label') ||
                element.classList.contains('ozw-container-placeholder') ||
                element.classList.contains('ozw-delete-button')) {
                continue;
            }
            if (element.classList.contains('ozw-component')) {
                const rect = element.getBoundingClientRect();
                const area = rect.width * rect.height;
                if (area < smallestArea) {
                    smallestArea = area;
                    smallestComponent = element;
                }
            }
            if (!smallestComponent && element.classList.contains('ozw-canvas-workspace')) {
                return element;
            }
        }

        if (smallestComponent) {
            return smallestComponent;
        }

        let current = event.target as HTMLElement | undefined;
        while (current) {
            if (current.classList.contains('ozw-component') || current.classList.contains('ozw-canvas-workspace')) {
                return current;
            }
            current = current.parentElement ?? undefined;
        }

        return event.currentTarget as HTMLElement;
    }

    protected addComponentToTarget(doc: OzwDocument, type: string, targetElement: HTMLElement): boolean {
        const targetId = targetElement.getAttribute('data-component-id');
        const targetType = targetElement.getAttribute('data-component-type');

        if (targetElement.classList.contains('ozw-canvas-workspace')) {
            if (doc.schema.tree.length === 0 && type !== 'column') {
                return false;
            }
            addComponent(doc, type, undefined);
            return true;
        }

        if (targetId && targetType) {
            if (canHaveChildren(targetType)) {
                addComponent(doc, type, targetId);
                return true;
            }
            const parentId = findParentId(doc.schema.tree, targetId);
            addComponent(doc, type, parentId);
            return true;
        }

        return false;
    }

    protected moveComponentToTarget(doc: OzwDocument, componentId: string, targetElement: HTMLElement): boolean {
        const targetId = targetElement.getAttribute('data-component-id');
        const targetType = targetElement.getAttribute('data-component-type');

        if (targetElement.classList.contains('ozw-canvas-workspace')) {
            return moveComponent(doc, componentId, { kind: 'root' }, 'inside');
        }

        if (targetId && targetType) {
            if (canHaveChildren(targetType)) {
                return moveComponent(doc, componentId, { kind: 'node', id: targetId, type: targetType }, 'inside');
            }
            const pos = (this.dropPosition === 'before' || this.dropPosition === 'after') ? this.dropPosition : 'after';
            return moveComponent(doc, componentId, { kind: 'node', id: targetId, type: targetType }, pos);
        }

        return false;
    }

    protected showDropIndicator(targetElement: HTMLElement, clientX: number, clientY: number): void {
        const rect = targetElement.getBoundingClientRect();
        const mouseY = clientY;
        const mouseX = clientX;

        const parentElement = targetElement.parentElement;
        if (!parentElement) {
            return;
        }
        // Much cheaper + more reliable than getComputedStyle on every dragover.
        const isHorizontal = parentElement.classList.contains('ozw-layout-content--row');

        const nextPosition: TreeInsertPosition = (() => {
            if (isHorizontal) {
                const midX = rect.left + rect.width / 2;
                return mouseX < midX ? 'before' : 'after';
            }
            const midY = rect.top + rect.height / 2;
            return mouseY < midY ? 'before' : 'after';
        })();

        const targetId = targetElement.getAttribute('data-component-id') ?? undefined;
        if (targetId && this.lastIndicatorTargetId === targetId && this.dropPosition === nextPosition) {
            return;
        }
        this.lastIndicatorTargetId = targetId;
        this.dropPosition = nextPosition;

        if (!this.dropIndicator) {
            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'ozw-drop-indicator';
            dropIndicator.style.pointerEvents = 'none';
            document.body.appendChild(dropIndicator);
            this.dropIndicator = dropIndicator;
        }
        this.dropIndicator.style.display = 'block';

        if (isHorizontal) {
            this.dropIndicator.style.position = 'fixed';
            this.dropIndicator.style.width = '3px';
            this.dropIndicator.style.height = `${rect.height - 8}px`;
            this.dropIndicator.style.backgroundColor = '#007acc';
            this.dropIndicator.style.top = `${rect.top + 4}px`;
            this.dropIndicator.style.left = this.dropPosition === 'before' ? `${rect.left - 6}px` : `${rect.right + 3}px`;
            this.dropIndicator.style.zIndex = '10000';
            this.dropIndicator.style.pointerEvents = 'none';
            this.dropIndicator.style.boxShadow = '0 0 6px rgba(0, 122, 204, 0.8)';
            this.dropIndicator.style.borderRadius = '2px';
        } else {
            this.dropIndicator.style.position = 'fixed';
            this.dropIndicator.style.width = `${rect.width - 8}px`;
            this.dropIndicator.style.height = '3px';
            this.dropIndicator.style.backgroundColor = '#007acc';
            this.dropIndicator.style.left = `${rect.left + 4}px`;
            this.dropIndicator.style.top = this.dropPosition === 'before' ? `${rect.top - 6}px` : `${rect.bottom + 3}px`;
            this.dropIndicator.style.zIndex = '10000';
            this.dropIndicator.style.pointerEvents = 'none';
            this.dropIndicator.style.boxShadow = '0 0 6px rgba(0, 122, 204, 0.8)';
            this.dropIndicator.style.borderRadius = '2px';
        }
    }

    protected hideDropIndicator(): void {
        if (this.dropIndicator) {
            this.dropIndicator.style.display = 'none';
        }
    }

    protected removeDropIndicator(): void {
        if (this.dropIndicator) {
            this.dropIndicator.remove();
            this.dropIndicator = undefined;
        }
    }
}

