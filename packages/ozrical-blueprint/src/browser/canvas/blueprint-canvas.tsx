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
import type { BlueprintDocument, BlueprintNode, BlueprintEdge, Position } from '../../domain/entities/blueprint-types';
import { useViewportTransform } from './use-viewport-transform';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 44;
const GRID_SIZE = 20;
const EDGE_HIT_WIDTH = 14;
const CANVAS_SIZE = 8000;

function snap(p: number): number {
    return Math.round(p / GRID_SIZE) * GRID_SIZE;
}

/** Snaps a node top-left position so the node center lies on the grid */
function snapNodeCenterToGrid(position: Position): Position {
    const centerX = position.x + NODE_WIDTH / 2;
    const centerY = position.y + NODE_HEIGHT / 2;
    return {
        x: snap(centerX) - NODE_WIDTH / 2,
        y: snap(centerY) - NODE_HEIGHT / 2
    };
}

/** Position of connection handle on node (snapped to grid); right = output, left = input */
function nodeHandlePosition(node: BlueprintNode, side: 'left' | 'right'): Position {
    const x = side === 'right' ? node.position.x + NODE_WIDTH : node.position.x;
    const y = node.position.y + NODE_HEIGHT / 2;
    return { x: snap(x), y: snap(y) };
}

/** Find node containing the point and which handle (left/right) is nearest to the point */
function findNodeAndNearestHandle(
    nodes: BlueprintNode[],
    point: Position
): { node: BlueprintNode; handle: 'left' | 'right' } | undefined {
    for (const node of nodes) {
        const { x, y } = node.position;
        if (point.x >= x && point.x <= x + NODE_WIDTH && point.y >= y && point.y <= y + NODE_HEIGHT) {
            const left = nodeHandlePosition(node, 'left');
            const right = nodeHandlePosition(node, 'right');
            const dLeft = (point.x - left.x) ** 2 + (point.y - left.y) ** 2;
            const dRight = (point.x - right.x) ** 2 + (point.y - right.y) ** 2;
            return { node, handle: dLeft <= dRight ? 'left' : 'right' };
        }
    }
    return undefined;
}

export interface ViewportApi {
    zoomToFit: () => void;
    centerViewAt: (worldX: number, worldY: number) => void;
}

export interface BlueprintCanvasProps {
    document: BlueprintDocument;
    selectedNodeId: string | undefined;
    selectedEdgeId: string | undefined;
    layerFilter: 'all' | 'navigation' | 'logic' | 'data';
    onSelectNode: (nodeId: string | undefined) => void;
    onSelectEdge: (edgeId: string | undefined) => void;
    onDropNode: (type: string, label: string, position: Position) => void;
    onMoveNode: (nodeId: string, position: Position) => void;
    onDeleteNode: (nodeId: string) => void;
    onCreateEdge: (sourceNodeId: string, targetNodeId: string, targetHandle?: 'left' | 'right') => void;
    onDeleteEdge: (edgeId: string) => void;
    onRequestFocus: () => void;
    /** Double-click on a node (e.g. open linked .ozw for menu/view/modal). */
    onNodeDoubleClick?: (nodeId: string) => void;
    /** Optional ref to get viewport actions (zoom to fit, center). */
    viewportApiRef?: React.MutableRefObject<ViewportApi | null>;
}

export const BlueprintCanvas: React.FC<BlueprintCanvasProps> = props => {
    const { document: doc, selectedNodeId, selectedEdgeId, layerFilter } = props;
    // eslint-disable-next-line no-null/no-null -- React ref API uses null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const viewport = useViewportTransform(containerRef);
    const { pan, scale, screenToWorld, handleWheelNative, startPan, endPan, onPanMove, centerViewAt, zoomToFit, isPanning, isSpacePressed } = viewport;
    const [draggingNode, setDraggingNode] = React.useState<string | undefined>(undefined);
    const [dragStart, setDragStart] = React.useState<{ nodePos: Position; clientX: number; clientY: number } | undefined>(undefined);
    /** When dragging from a node's output handle to create an edge */
    const [connectingFromNodeId, setConnectingFromNodeId] = React.useState<string | undefined>(undefined);
    const [connectionPreview, setConnectionPreview] = React.useState<Position | undefined>(undefined);
    /** When over a node during connect, which handle we're snapping to (for drop) */
    const [snappedTarget, setSnappedTarget] = React.useState<{ nodeId: string; handle: 'left' | 'right' } | undefined>(undefined);

    const filterNodes = (nodes: BlueprintNode[]): BlueprintNode[] => {
        if (layerFilter === 'all') {
            return nodes;
        }
        if (layerFilter === 'navigation') {
            return nodes.filter(n => ['app_router', 'menu', 'view', 'modal'].includes(n.type));
        }
        if (layerFilter === 'logic') {
            return nodes.filter(n => ['auth', 'access_gate', 'access_context', 'redirector', 'switch_role'].includes(n.type));
        }
        if (layerFilter === 'data') {
            return nodes.filter(n => ['connector', 'state_injection'].includes(n.type));
        }
        return nodes;
    };

    const filteredNodes = filterNodes(doc.nodes);
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = doc.edges.filter(e => filteredNodeIds.has(e.sourceNodeId) && filteredNodeIds.has(e.targetNodeId));

    const nodeMap = new Map(doc.nodes.map(n => [n.id, n]));

    const clientToGraph = React.useCallback((clientX: number, clientY: number): Position => {
        const w = screenToWorld(clientX, clientY);
        return { x: snap(w.x), y: snap(w.y) };
    }, [screenToWorld]);

    const handlePanAreaMouseDown = React.useCallback((e: React.MouseEvent): void => {
        if (e.button === 0 || e.button === 1) {
            startPan(e.clientX, e.clientY);
        }
    }, [startPan]);

    const handleCanvasMouseDownCapture = React.useCallback((e: React.MouseEvent): void => {
        if (isSpacePressed && e.button === 0) {
            startPan(e.clientX, e.clientY);
            e.preventDefault();
            e.stopPropagation();
        }
    }, [isSpacePressed, startPan]);

    const handleDoubleClickBackground = React.useCallback((e: React.MouseEvent): void => {
        if ((e.target as HTMLElement).classList.contains('blueprint-canvas-background')) {
            const w = screenToWorld(e.clientX, e.clientY);
            centerViewAt(w.x, w.y);
        }
    }, [screenToWorld, centerViewAt]);

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        const onWheel = (e: WheelEvent): void => handleWheelNative(e);
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [handleWheelNative]);

    React.useEffect(() => {
        if (!isPanning) {
            return;
        }
        const onMouseMove = (e: MouseEvent): void => { onPanMove(e.clientX, e.clientY); };
        const onMouseUp = (): void => { endPan(); };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isPanning, onPanMove, endPan]);

    const bounds = React.useMemo(() => {
        if (filteredNodes.length === 0) {
            return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of filteredNodes) {
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
            maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
        }
        return { minX, minY, maxX, maxY };
    }, [filteredNodes]);

    React.useEffect(() => {
        const ref = props.viewportApiRef;
        if (!ref) {
            return;
        }
        ref.current = {
            zoomToFit: () => zoomToFit(bounds),
            centerViewAt
        };
        return () => { ref.current = null; };
    }, [props.viewportApiRef, zoomToFit, centerViewAt, bounds]);

    const handleDrop = (e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const type = e.dataTransfer.getData('application/x-blueprint-node-type');
        const label = e.dataTransfer.getData('application/x-blueprint-node-label');
        if (!type || !label) {
            return;
        }
        const raw = clientToGraph(e.clientX, e.clientY);
        const pos = snapNodeCenterToGrid(raw);
        props.onDropNode(type, label, pos);
    };

    const handleDragOver = (e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDragEnter = (e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-blueprint-node-type')) {
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string): void => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest('[data-handle]')) {
            return;
        }
        props.onSelectNode(nodeId);
        props.onSelectEdge(undefined);
        const node = nodeMap.get(nodeId);
        if (!node) {
            return;
        }
        setDraggingNode(nodeId);
        setDragStart({ nodePos: { ...node.position }, clientX: e.clientX, clientY: e.clientY });
    };

    const handleOutputHandleMouseDown = (e: React.MouseEvent, sourceNodeId: string): void => {
        e.stopPropagation();
        e.preventDefault();
        props.onSelectNode(sourceNodeId);
        props.onSelectEdge(undefined);
        setConnectingFromNodeId(sourceNodeId);
        setSnappedTarget(undefined);
        setConnectionPreview(clientToGraph(e.clientX, e.clientY));
    };

    const handleNodeMouseUp = (e: React.MouseEvent, targetNodeId: string): void => {
        if (!connectingFromNodeId) {
            return;
        }
        e.stopPropagation();
        if (targetNodeId !== connectingFromNodeId) {
            const targetHandle = snappedTarget?.nodeId === targetNodeId ? snappedTarget.handle : 'left';
            props.onCreateEdge(connectingFromNodeId, targetNodeId, targetHandle);
        }
        setConnectingFromNodeId(undefined);
        setConnectionPreview(undefined);
        setSnappedTarget(undefined);
    };

    const handleCanvasMouseUp = (): void => {
        if (connectingFromNodeId) {
            setConnectingFromNodeId(undefined);
            setConnectionPreview(undefined);
            setSnappedTarget(undefined);
        }
    };

    const handleEdgeClick = (e: React.MouseEvent, edgeId: string): void => {
        e.stopPropagation();
        props.onSelectEdge(edgeId);
        props.onSelectNode(undefined);
    };

    React.useEffect(() => {
        if (!draggingNode || !dragStart) {
            return;
        }
        const onMouseMove = (e: MouseEvent): void => {
            const dx = (e.clientX - dragStart.clientX) / scale;
            const dy = (e.clientY - dragStart.clientY) / scale;
            const newPos = {
                x: dragStart.nodePos.x + dx,
                y: dragStart.nodePos.y + dy
            };
            props.onMoveNode(draggingNode, snapNodeCenterToGrid(newPos));
        };
        const onMouseUp = (): void => {
            setDraggingNode(undefined);
            setDragStart(undefined);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [draggingNode, dragStart, scale]);

    React.useEffect(() => {
        if (!connectingFromNodeId) {
            return;
        }
        const onMouseMove = (e: MouseEvent): void => {
            const w = screenToWorld(e.clientX, e.clientY);
            const point = { x: snap(w.x), y: snap(w.y) };
            const hit = findNodeAndNearestHandle(filteredNodes, point);
            if (hit && hit.node.id !== connectingFromNodeId) {
                const handlePos = nodeHandlePosition(hit.node, hit.handle);
                setConnectionPreview(handlePos);
                setSnappedTarget({ nodeId: hit.node.id, handle: hit.handle });
            } else {
                setConnectionPreview(point);
                setSnappedTarget(undefined);
            }
        };
        const onMouseUp = (): void => {
            setConnectingFromNodeId(undefined);
            setConnectionPreview(undefined);
            setSnappedTarget(undefined);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [connectingFromNodeId, screenToWorld, filteredNodes]);

    const handleKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Delete') {
            if (selectedEdgeId) {
                props.onDeleteEdge(selectedEdgeId);
                props.onSelectEdge(undefined);
            } else if (selectedNodeId) {
                props.onDeleteNode(selectedNodeId);
            }
        }
        if (e.key === 'Escape') {
            props.onSelectNode(undefined);
            props.onSelectEdge(undefined);
            if (connectingFromNodeId) {
                setConnectingFromNodeId(undefined);
                setConnectionPreview(undefined);
                setSnappedTarget(undefined);
            }
        }
    };

    const getNodeIcon = (type: string): string => {
        if (type === 'app_router') {
            return 'fa fa-sitemap';
        }
        if (type === 'access_gate') {
            return 'fa fa-door-open';
        }
        if (type === 'connector') {
            return 'fa fa-plug';
        }
        if (type === 'auth') {
            return 'fa fa-lock';
        }
        if (type === 'menu' || type === 'view' || type === 'modal') {
            return 'fa fa-bars';
        }
        return 'fa fa-circle';
    };

    const transformStyle = { transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` };

    return (
        <div
            ref={containerRef}
            className={`blueprint-canvas-container ${isSpacePressed ? 'blueprint-canvas-container--pan-cursor' : ''} ${isPanning ? 'blueprint-canvas-container--grabbing' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onClick={() => { props.onRequestFocus(); props.onSelectNode(undefined); props.onSelectEdge(undefined); }}
            onMouseUp={handleCanvasMouseUp}
            onKeyDown={handleKeyDown}
            onMouseDownCapture={handleCanvasMouseDownCapture}
            tabIndex={0}
            style={{ overflow: 'hidden' }}
        >
            <div
                className='blueprint-canvas-viewport'
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                style={transformStyle}
            >
                <div
                    className='blueprint-canvas-background'
                    onMouseDown={handlePanAreaMouseDown}
                    onDoubleClick={handleDoubleClickBackground}
                    data-canvas-background
                />
                <svg className='blueprint-canvas-grid' width={CANVAS_SIZE} height={CANVAS_SIZE}>
                    <defs>
                        <pattern id='blueprint-grid-pattern' width={GRID_SIZE} height={GRID_SIZE} patternUnits='userSpaceOnUse'>
                            <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill='none' stroke='var(--theia-panel-border)' strokeWidth='0.5' />
                        </pattern>
                    </defs>
                    <rect width='100%' height='100%' fill='url(#blueprint-grid-pattern)' />
                </svg>
                <svg
                    className='blueprint-canvas-edges'
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
                >
                    <g style={{ pointerEvents: 'auto' }}>
                        {filteredEdges.map((edge: BlueprintEdge) => {
                            const src = nodeMap.get(edge.sourceNodeId);
                            const tgt = nodeMap.get(edge.targetNodeId);
                            if (!src || !tgt) {
                                return undefined;
                            }
                            const sourceSide = (edge.sourceHandle === 'left' || edge.sourceHandle === 'right') ? edge.sourceHandle : 'right';
                            const targetSide = (edge.targetHandle === 'left' || edge.targetHandle === 'right') ? edge.targetHandle : 'left';
                            const from = nodeHandlePosition(src, sourceSide);
                            const to = nodeHandlePosition(tgt, targetSide);
                            const selected = selectedEdgeId === edge.id;
                            return (
                                <g key={edge.id} pointerEvents='bounding-box'>
                                    <line
                                        x1={from.x}
                                        y1={from.y}
                                        x2={to.x}
                                        y2={to.y}
                                        stroke={selected ? 'var(--theia-focusBorder)' : '#666'}
                                        strokeWidth={selected ? 3 : 2}
                                        pointerEvents='none'
                                    />
                                    <line
                                        x1={from.x}
                                        y1={from.y}
                                        x2={to.x}
                                        y2={to.y}
                                        stroke='transparent'
                                        strokeWidth={EDGE_HIT_WIDTH}
                                        pointerEvents='stroke'
                                        style={{ cursor: 'pointer' }}
                                        onClick={e => handleEdgeClick(e, edge.id)}
                                    />
                                </g>
                            );
                        })}
                        {connectingFromNodeId && connectionPreview && (() => {
                            const src = nodeMap.get(connectingFromNodeId);
                            if (!src) { return null; }
                            const from = nodeHandlePosition(src, 'right');
                            return (
                                <line
                                    x1={from.x}
                                    y1={from.y}
                                    x2={connectionPreview.x}
                                    y2={connectionPreview.y}
                                    stroke='var(--theia-focusBorder)'
                                    strokeWidth={2}
                                    strokeDasharray='6 4'
                                    pointerEvents='none'
                                />
                            );
                        })()}
                    </g>
                </svg>
                <div className='blueprint-canvas-nodes-layer' style={{ position: 'absolute', left: 0, top: 0, zIndex: 3 }}>
                {filteredNodes.map(node => {
                    const isOzwNode = ['menu', 'view', 'modal'].includes(node.type);
                    const linkStatus = isOzwNode ? (node as { linkedResourceStatus?: string }).linkedResourceStatus : undefined;
                    const linkClass = !isOzwNode ? '' : linkStatus === 'linked' ? 'blueprint-canvas-node--linked' : linkStatus === 'missing' ? 'blueprint-canvas-node--missing' : 'blueprint-canvas-node--unassigned';
                    return (
                    <div
                        key={node.id}
                        className={`blueprint-canvas-node ${node.type === 'app_router' ? 'blueprint-canvas-node--app-router' : ''} ${linkClass} ${selectedNodeId === node.id ? 'selected' : ''}`}
                        style={{
                            left: node.position.x,
                            top: node.position.y,
                            width: NODE_WIDTH,
                            height: NODE_HEIGHT
                        }}
                        onMouseDown={e => handleNodeMouseDown(e, node.id)}
                        onMouseUp={e => handleNodeMouseUp(e, node.id)}
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => {
                            e.stopPropagation();
                            props.onNodeDoubleClick?.(node.id);
                        }}
                    >
                        <div
                            className='blueprint-canvas-node-handle blueprint-canvas-node-handle--input'
                            data-handle='input'
                            title='Conectar desde otro nodo'
                        />
                        <i className={getNodeIcon(node.type)}></i>
                        <span className='blueprint-canvas-node-label'>{node.label || node.type}</span>
                        <div
                            className='blueprint-canvas-node-handle blueprint-canvas-node-handle--output'
                            data-handle='output'
                            title='Arrastra hasta otro nodo para conectar'
                            onMouseDown={e => handleOutputHandleMouseDown(e, node.id)}
                        />
                    </div>
                    );
                })}
                </div>
            </div>
        </div>
    );
};
