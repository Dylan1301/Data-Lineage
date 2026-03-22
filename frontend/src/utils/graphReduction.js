export const reduceGraphEdges = (edges, visibleNodeIds) => {
    const resultEdges = [];
    const resultEdgeKeys = new Set();

    const edgeMap = new Map();
    edges.forEach(e => {
        const sourceKey = e.edge_type === 'column_edge' ? e.sourceHandle : e.source;
        if (!edgeMap.has(sourceKey)) edgeMap.set(sourceKey, []);
        edgeMap.get(sourceKey).push(e);
    });

    const findPaths = (startEdge, visited = new Set(), currentPath = []) => {
        let paths = [];
        const targetKey = startEdge.edge_type === 'column_edge' ? startEdge.targetHandle : startEdge.target;
        const targetNodeId = startEdge.target;

        const newPath = [...currentPath, startEdge.id];

        if (visibleNodeIds.has(targetNodeId)) {
            paths.push({ targetEdge: startEdge, originalEdgeIds: newPath });
        } else if (!visited.has(targetKey)) {
            const newVisited = new Set(visited).add(targetKey);
            const nextEdges = edgeMap.get(targetKey) || [];
            for (const nextEdge of nextEdges) {
                paths = paths.concat(findPaths(nextEdge, newVisited, newPath));
            }
        }
        return paths;
    };

    edges.forEach(edge => {
        if (visibleNodeIds.has(edge.source)) {
            const paths = findPaths(edge);
            paths.forEach(pathInfo => {
                const { targetEdge, originalEdgeIds } = pathInfo;
                const newEdgeKey = `${edge.sourceHandle || edge.source}-${targetEdge.targetHandle || targetEdge.target}`;
                if (!resultEdgeKeys.has(newEdgeKey)) {
                    resultEdgeKeys.add(newEdgeKey);
                    resultEdges.push({
                        ...edge,
                        id: `reduced-${edge.id}-${targetEdge.id}`,
                        target: targetEdge.target,
                        targetHandle: targetEdge.targetHandle,
                        originalEdgeIds: originalEdgeIds
                    });
                }
            });
        }
    });

    return resultEdges;
};
