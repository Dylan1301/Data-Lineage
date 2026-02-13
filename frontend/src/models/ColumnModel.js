/**
 * Represents a column in a table.
 */
class ColumnModel {
    /**
     * @param {Object} data - The raw column data.
     * @param {string} data.id - The unique identifier for the column.
     * @param {string} data.name - The name of the column.
     * @param {string} [data.type] - The type of the column (e.g., 'column').
     */
    constructor({ id, name, type = 'column' }) {
        if (!id || !name) {
            throw new Error('ColumnModel requires id and name');
        }
        this.id = id;
        this.name = name;
        this.type = type;
    }

    /**
     * Creates a ColumnModel instance from a raw JSON object.
     * @param {Object} json - The raw JSON object.
     * @returns {ColumnModel}
     */
    static fromJSON(json) {
        return new ColumnModel(json);
    }
}

export default ColumnModel;
