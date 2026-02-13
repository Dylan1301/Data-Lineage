import TableModel from './TableModel';

/**
 * Represents the entire lineage graph.
 */
class LineageGraphModel {
    /**
     * @param {Object} data - The graph data.
     * @param {Array<TableModel>} data.nodes - The nodes in the graph.
     * @param {Array<Object>} data.edges - The edges in the graph.
     */
    constructor({ nodes = [], edges = [] }) {
        this.nodes = nodes;
        this.edges = edges;
    }

    /**
     * Creates a LineageGraphModel instance from a raw JSON object.
     * @param {Object} json - The raw JSON object.
     * @returns {LineageGraphModel}
     */
    static fromJSON(json) {
        const nodes = (json.nodes || []).map(node => TableModel.fromJSON(node));
        const edges = json.edges || [];
        return new LineageGraphModel({ nodes, edges });
    }

    /**
     * usage: const { nodes, edges } = graphModel.toReactFlow();
     * @returns {{ nodes: Array, edges: Array }}
     */
    toReactFlow() {
        return {
            nodes: this.nodes, // TableModel structure is already compatible with React Flow nodes
            edges: this.edges
        };
    }
}

export default LineageGraphModel;
