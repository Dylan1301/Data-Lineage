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

const LineageGraphContent = ({ initialNodes, initialEdges }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView } = useReactFlow();

    useEffect(() => {
        if (initialNodes && initialNodes.length > 0) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                initialNodes,
                initialEdges
            );
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            // Delay fitView slightly to allow render
            setTimeout(() => fitView({ padding: 0.2 }), 50);
        }
    }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge(params, eds)),
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
