import React, { useCallback, useEffect } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Background,
    Controls,
    MiniMap,
    useReactFlow,
    ReactFlowProvider,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import TableNode from './TableNode';

const nodeTypes = {
    tableNode: TableNode,
};

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = 220;
    const nodeHeight = 36; // Base height, usually varies by content

    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        // Estimating height based on columns for better layout
        const height = 40 + (node.data.columns.length * 24);
        dagreGraph.setNode(node.id, { width: nodeWidth, height: height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            targetPosition: 'left',
            sourcePosition: 'right',
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeWithPosition.height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

const LineageGraphContent = ({ initialNodes, initialEdges, viewOptions = { showTable: true, showColumn: true } }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView } = useReactFlow();

    const [highlightedColumns, setHighlightedColumns] = React.useState(new Set());
    const [highlightedTables, setHighlightedTables] = React.useState(new Set());
    const [highlightedEdges, setHighlightedEdges] = React.useState(new Set());

    // Helper to find connected columns and edges
    const findConnectedLineage = useCallback((startColId, allEdges) => {
        const visitedCols = new Set([startColId]);
        const visitedTables = new Set();
        const visitedEdges = new Set();
        const queue = [startColId];

        // Find the table containing the start column
        const startNode = initialNodes.find(n => n.data.columns.some(c => c.id === startColId));
        if (startNode) visitedTables.add(startNode.id);

        while (queue.length > 0) {
            const currentId = queue.shift();

            // Find edges connected to this column (upstream or downstream)
            allEdges.forEach(edge => {
                if (edge.edge_type === 'column_edge') {
                    if (edge.sourceHandle === currentId && !visitedEdges.has(edge.id)) {
                        visitedEdges.add(edge.id);
                        if (!visitedCols.has(edge.targetHandle)) {
                            visitedCols.add(edge.targetHandle);
                            queue.push(edge.targetHandle);
                            // Find table for this column
                            const targetNode = initialNodes.find(n => n.data.columns.some(c => c.id === edge.targetHandle));
                            if (targetNode) visitedTables.add(targetNode.id);
                        }
                    } else if (edge.targetHandle === currentId && !visitedEdges.has(edge.id)) {
                        visitedEdges.add(edge.id);
                        if (!visitedCols.has(edge.sourceHandle)) {
                            visitedCols.add(edge.sourceHandle);
                            queue.push(edge.sourceHandle);
                            // Find table for this column
                            const sourceNode = initialNodes.find(n => n.data.columns.some(c => c.id === edge.sourceHandle));
                            if (sourceNode) visitedTables.add(sourceNode.id);
                        }
                    }
                }
            });
        }
        return { visitedCols, visitedTables, visitedEdges };
    }, [initialNodes]);

    const onColumnHover = useCallback((colId) => {
        const { visitedCols, visitedTables, visitedEdges } = findConnectedLineage(colId, initialEdges);
        setHighlightedColumns(visitedCols);
        setHighlightedTables(visitedTables);
        setHighlightedEdges(visitedEdges);
    }, [findConnectedLineage, initialEdges]);

    const onColumnLeave = useCallback(() => {
        setHighlightedColumns(new Set());
        setHighlightedTables(new Set());
        setHighlightedEdges(new Set());
    }, []);

    useEffect(() => {
        if (initialNodes && initialNodes.length > 0) {
            let processedEdges = [];
            const uniqueEdges = new Set();
            const columnConnectedTables = new Set();

            // 1. Process Column Edges if enabled
            if (viewOptions.showColumn) {
                initialEdges.forEach(edge => {
                    if (edge.edge_type === "column_edge") {
                        // Track that these two tables are connected via a column edge
                        // We need to find which tables these columns belong to.
                        // Since edge.source and edge.target are Node IDs in React Flow (Table IDs here), we can use them directly.
                        const tableConnectionKey = `${edge.source}-${edge.target}`;
                        columnConnectedTables.add(tableConnectionKey);

                        const isHighlighted = highlightedEdges.has(edge.id);
                        const isDimmed = highlightedEdges.size > 0 && !isHighlighted;

                        processedEdges.push({
                            ...edge,
                            markerEnd: { type: MarkerType.ArrowClosed },
                            animated: true,
                            style: {
                                stroke: isHighlighted ? '#a855f7' : '#f97316', // Purple-500 if highlighted, else Orange-500
                                strokeWidth: isHighlighted ? 3 : 2,
                                opacity: isDimmed ? 0.2 : 1
                            },
                            zIndex: isHighlighted ? 20 : 10,
                        });
                    }
                });
            }

            // 2. Process Table Edges if enabled
            if (viewOptions.showTable) {
                initialEdges.forEach(edge => {
                    if (edge.edge_type === "table_edge") {
                        const key = `table-${edge.source}-${edge.target}`;
                        const tableConnectionKey = `${edge.source}-${edge.target}`;

                        // Check if a column edge already connects these tables. If so, SKIP table edge.
                        // Also check if we've already processed this table edge to avoid duplicates.
                        if (!uniqueEdges.has(key) && !columnConnectedTables.has(tableConnectionKey)) {
                            uniqueEdges.add(key);
                            processedEdges.push({
                                ...edge,
                                // Enforce table handles for table edges
                                sourceHandle: 'table-source',
                                targetHandle: 'table-target',
                                markerEnd: { type: MarkerType.ArrowClosed },
                                animated: true,
                                style: { stroke: '#2563eb', strokeWidth: 2 }, // Blue-600
                                zIndex: 5, // Table edges below column edges
                            });
                        }
                    }
                });
            }

            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                initialNodes,
                processedEdges
            );

            // Enhance nodes with highlighting data and handlers
            const enhancedNodes = layoutedNodes.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    highlightedColumns: highlightedColumns,
                    isHighlighted: highlightedTables.has(node.id),
                    isDimmed: highlightedTables.size > 0 && !highlightedTables.has(node.id),
                    onColumnHover: onColumnHover,
                    onColumnLeave: onColumnLeave
                }
            }));

            setNodes(enhancedNodes);
            setEdges(layoutedEdges);

            // Only fit view on initial load, not on hover updates to avoid jumping
            if (highlightedColumns.size === 0) {
                // Delay fitView slightly to allow render
                setTimeout(() => fitView({ padding: 0.2 }), 50);
            }
        }
    }, [initialNodes, initialEdges, viewOptions, setNodes, setEdges, fitView, onColumnHover, onColumnLeave, highlightedColumns, highlightedTables, highlightedEdges]);

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
        [setEdges],
    );

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
            >
                <Controls />
                <MiniMap />
                <Background variant="dots" gap={12} size={1} />
            </ReactFlow>
        </div>
    );
};

const LineageGraph = (props) => {
    return (
        <ReactFlowProvider>
            <LineageGraphContent {...props} />
        </ReactFlowProvider>
    )
}

export default LineageGraph;
