import ColumnModel from './ColumnModel';

/**
 * Represents a table in the lineage graph.
 */
class TableModel {
    /**
     * @param {Object} data - The raw table data.
     * @param {string} data.id - The unique identifier for the table.
     * @param {string} data.type - The type of the table node (e.g., 'tableNode').
     * @param {Object} data.data - The node data.
     * @param {string} data.data.label - The label of the table.
     * @param {Array<Object>} data.data.columns - The columns of the table.
     * @param {string|null} [data.data.schema] - The schema of the table.
     * @param {Object} [data.position] - The position of the table node.
     */
    constructor({ id, type, data, position }) {
        if (!id || !data || !data.label) {
            throw new Error('TableModel requires id and data.label');
        }
        this.id = id;
        this.type = type || 'tableNode';
        this.data = {
            label: data.label,
            columns: (data.columns || []).map(col => ColumnModel.fromJSON(col)),
            schema: data.schema || null,
            file_name: data.file_name || null,
            table_node_type: data.table_node_type || 'query',
            is_first: data.is_first || false,

        };
        this.position = position || { x: 0, y: 0 };
    }

    /**
     * Creates a TableModel instance from a raw JSON object.
     * @param {Object} json - The raw JSON object.
     * @returns {TableModel}
     */
    static fromJSON(json) {
        return new TableModel(json);
    }
}

export default TableModel;
