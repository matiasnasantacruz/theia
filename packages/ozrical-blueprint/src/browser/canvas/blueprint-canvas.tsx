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

const NODE_WIDTH = 160;
const NODE_HEIGHT = 44;
const GRID_SIZE = 20;
const EDGE_HIT_WIDTH = 14;

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
}

export const BlueprintCanvas: React.FC<BlueprintCanvasProps> = props => {
    const { document: doc, selectedNodeId, selectedEdgeId, layerFilter } = props;
    // eslint-disable-next-line no-null/no-null -- React ref API uses null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [pan] = React.useState({ x: 0, y: 0 });
    const [scale] = React.useState(1);
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

    const clientToGraph = (clientX: number, clientY: number): Position => {
        const el = containerRef.current;
        if (!el) {
            return { x: 0, y: 0 };
        }
        const rect = el.getBoundingClientRect();
        const x = (clientX - rect.left - pan.x) / scale;
        const y = (clientY - rect.top - pan.y) / scale;
        return { x: snap(x), y: snap(y) };
    };

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
            const el = containerRef.current;
            if (!el) { return; }
            const rect = el.getBoundingClientRect();
            const x = (e.clientX - rect.left - pan.x) / scale;
            const y = (e.clientY - rect.top - pan.y) / scale;
            const point = { x: snap(x), y: snap(y) };
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
    }, [connectingFromNodeId, pan.x, pan.y, scale, filteredNodes]);

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

    return (
        <div
            ref={containerRef}
            className='blueprint-canvas-container'
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onClick={() => { props.onRequestFocus(); props.onSelectNode(undefined); props.onSelectEdge(undefined); }}
            onMouseUp={handleCanvasMouseUp}
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            <div
                className='blueprint-canvas-viewport'
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
                }}
            >
                <svg
                    className='blueprint-canvas-edges'
                    width={8000}
                    height={8000}
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
                {filteredNodes.map(node => (
                    <div
                        key={node.id}
                        className={`blueprint-canvas-node ${node.type === 'app_router' ? 'blueprint-canvas-node--app-router' : ''} ${selectedNodeId === node.id ? 'selected' : ''}`}
                        style={{
                            left: node.position.x,
                            top: node.position.y,
                            width: NODE_WIDTH,
                            height: NODE_HEIGHT
                        }}
                        onMouseDown={e => handleNodeMouseDown(e, node.id)}
                        onMouseUp={e => handleNodeMouseUp(e, node.id)}
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
                ))}
            </div>
        </div>
    );
};
