// *****************************************************************************
// Copyright (C) 2026 and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;
const ZOOM_SENSITIVITY = 0.002;
const PADDING_FIT = 80;

export interface ViewportTransform {
    pan: { x: number; y: number };
    scale: number;
    screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
    worldToScreen: (worldX: number, worldY: number) => { x: number; y: number };
    isPanning: boolean;
    isSpacePressed: boolean;
    setPan: (pan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
    setScale: (scale: number | ((prev: number) => number)) => void;
    zoomToFit: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void;
    centerViewAt: (worldX: number, worldY: number) => void;
    handleWheel: (e: React.WheelEvent) => void;
    /** Use for addEventListener('wheel', ..., { passive: false }) so preventDefault works */
    handleWheelNative: (e: WheelEvent) => void;
    startPan: (clientX: number, clientY: number) => void;
    endPan: () => void;
    onPanMove: (clientX: number, clientY: number) => void;
}

export function useViewportTransform(
    containerRef: React.RefObject<HTMLDivElement | null>
): ViewportTransform {
    const [pan, setPan] = React.useState({ x: 0, y: 0 });
    const [scale, setScale] = React.useState(1);
    const [isPanning, setIsPanning] = React.useState(false);
    const [isSpacePressed, setIsSpacePressed] = React.useState(false);
    const panStartRef = React.useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);

    const screenToWorld = React.useCallback(
        (clientX: number, clientY: number): { x: number; y: number } => {
            const el = containerRef.current;
            if (!el) {
                return { x: 0, y: 0 };
            }
            const rect = el.getBoundingClientRect();
            return {
                x: (clientX - rect.left - pan.x) / scale,
                y: (clientY - rect.top - pan.y) / scale
            };
        },
        [pan, scale]
    );

    const worldToScreen = React.useCallback(
        (worldX: number, worldY: number): { x: number; y: number } => {
            const el = containerRef.current;
            if (!el) {
                return { x: 0, y: 0 };
            }
            const rect = el.getBoundingClientRect();
            return {
                x: rect.left + pan.x + worldX * scale,
                y: rect.top + pan.y + worldY * scale
            };
        },
        [pan, scale]
    );

    const handleWheel = React.useCallback(
        (e: React.WheelEvent): void => {
            const el = containerRef.current;
            if (!el) {
                return;
            }
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const cursorWorld = {
                x: (e.clientX - rect.left - pan.x) / scale,
                y: (e.clientY - rect.top - pan.y) / scale
            };
            const delta = e.deltaY !== 0 ? e.deltaY : (e.deltaX !== 0 ? e.deltaX : 0);
            const factor = 1 - delta * ZOOM_SENSITIVITY;
            const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));
            const newPan = {
                x: e.clientX - rect.left - cursorWorld.x * newScale,
                y: e.clientY - rect.top - cursorWorld.y * newScale
            };
            setPan(newPan);
            setScale(newScale);
        },
        [pan, scale]
    );

    const handleWheelNative = React.useCallback(
        (e: WheelEvent): void => {
            const el = containerRef.current;
            if (!el) {
                return;
            }
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const cursorWorld = {
                x: (e.clientX - rect.left - pan.x) / scale,
                y: (e.clientY - rect.top - pan.y) / scale
            };
            const delta = e.deltaY !== 0 ? e.deltaY : (e.deltaX !== 0 ? e.deltaX : 0);
            const factor = 1 - delta * ZOOM_SENSITIVITY;
            const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));
            const newPan = {
                x: e.clientX - rect.left - cursorWorld.x * newScale,
                y: e.clientY - rect.top - cursorWorld.y * newScale
            };
            setPan(newPan);
            setScale(newScale);
        },
        [pan, scale]
    );

    const startPan = React.useCallback((clientX: number, clientY: number): void => {
        setIsPanning(true);
        panStartRef.current = { clientX, clientY, panX: pan.x, panY: pan.y };
    }, [pan.x, pan.y]);

    const endPan = React.useCallback((): void => {
        setIsPanning(false);
        panStartRef.current = null;
    }, []);

    const onPanMove = React.useCallback((clientX: number, clientY: number): void => {
        const start = panStartRef.current;
        if (!start) {
            return;
        }
        setPan({
            x: start.panX + (clientX - start.clientX),
            y: start.panY + (clientY - start.clientY)
        });
    }, []);

    const zoomToFit = React.useCallback(
        (bounds: { minX: number; minY: number; maxX: number; maxY: number }): void => {
            const el = containerRef.current;
            if (!el) {
                return;
            }
            const rect = el.getBoundingClientRect();
            const w = bounds.maxX - bounds.minX || 200;
            const h = bounds.maxY - bounds.minY || 200;
            const scaleX = (rect.width - PADDING_FIT * 2) / w;
            const scaleY = (rect.height - PADDING_FIT * 2) / h;
            const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));
            const centerWorld = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
            const centerScreenX = rect.width / 2;
            const centerScreenY = rect.height / 2;
            setPan({
                x: centerScreenX - centerWorld.x * newScale,
                y: centerScreenY - centerWorld.y * newScale
            });
            setScale(newScale);
        },
        []
    );

    const centerViewAt = React.useCallback(
        (worldX: number, worldY: number): void => {
            const el = containerRef.current;
            if (!el) {
                return;
            }
            const rect = el.getBoundingClientRect();
            const centerScreenX = rect.width / 2;
            const centerScreenY = rect.height / 2;
            setPan({
                x: centerScreenX - worldX * scale,
                y: centerScreenY - worldY * scale
            });
        },
        [scale]
    );

    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === ' ' && !e.repeat) {
                e.preventDefault();
                setIsSpacePressed(true);
            }
        };
        const onKeyUp = (e: KeyboardEvent): void => {
            if (e.key === ' ' && !e.repeat) {
                setIsSpacePressed(false);
                if (panStartRef.current) {
                    endPan();
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [endPan]);

    return {
        pan,
        scale,
        screenToWorld,
        worldToScreen,
        isPanning,
        isSpacePressed,
        setPan,
        setScale,
        zoomToFit,
        centerViewAt,
        handleWheel,
        handleWheelNative,
        startPan,
        endPan,
        onPanMove
    };
}
