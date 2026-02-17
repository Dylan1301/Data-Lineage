import { useState } from 'react'
import LineageGraph from './components/LineageGraph'
import LineageGraphModel from './models/LineageGraphModel'
import './App.css'

function App() {
    // State for SQL files (tabs)
    const [files, setFiles] = useState([
        {
            id: '1',
            name: 'Query 1',
            content: `SELECT
    ranked_customers.customer_id,
    ranked_customers.first_name,
    ranked_customers.last_name,
    ranked_customers.total_spent
FROM (
    SELECT
        c.customer_id,
        c.first_name,
        c.last_name,
        SUM(o.total_amount) AS total_spent
    FROM customers c
    INNER JOIN orders o
        ON o.customer_id = c.customer_id
    WHERE o.status = 'COMPLETED'
    GROUP BY
        c.customer_id,
        c.first_name,
        c.last_name
) AS ranked_customers
WHERE ranked_customers.total_spent > (
    SELECT AVG(o2.total_amount)
    FROM orders o2
    WHERE o2.status = 'COMPLETED'
)
ORDER BY ranked_customers.total_spent DESC`
        }
    ]);
    const [activeFileId, setActiveFileId] = useState('1');

    const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [viewOptions, setViewOptions] = useState({ showTable: true, showColumn: true })

    const activeFile = files.find(f => f.id === activeFileId) || files[0];

    const handleFileChange = (content) => {
        setFiles(files.map(f => f.id === activeFileId ? { ...f, content } : f));
    }

    const handleNewTab = () => {
        const newId = Date.now().toString();
        const newFile = { id: newId, name: `Query ${files.length + 1}`, content: '' };
        setFiles([...files, newFile]);
        setActiveFileId(newId);
    }

    const handleCloseTab = (id, e) => {
        e.stopPropagation();
        if (files.length === 1) return; // Don't close last tab

        const newFiles = files.filter(f => f.id !== id);
        setFiles(newFiles);

        if (activeFileId === id) {
            setActiveFileId(newFiles[newFiles.length - 1].id);
        }
    }

    const handleClearGraph = async () => {
        if (!confirm("Are you sure you want to clear the lineage graph? This will reset the visualization.")) return;

        setLoading(true);
        try {
            const response = await fetch('/api/clear', { method: 'POST' });
            if (!response.ok) throw new Error('Failed to clear graph');
            setGraphData({ nodes: [], edges: [] });
        } catch (err) {
            console.error(err);
            setError("Failed to clear graph");
        } finally {
            setLoading(false);
        }
    }

    const handleVisualize = async (sqlToParse) => {
        setLoading(true)
        setError(null)
        try {
            const payload = {};
            // If sqlToParse is a string, include it in the request to be parsed.
            // If it's not provided (undefined/null) or not a string (e.g. event object), 
            // we don't send 'sql', so the backend just returns the current graph state.
            if (typeof sqlToParse === 'string') {
                payload.sql = sqlToParse;
                payload.file_name = activeFile.name;
            }

            const response = await fetch('/api/visualize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`)
            }

            const data = await response.json()
            const graphModel = LineageGraphModel.fromJSON(data)
            console.log(graphModel)
            setGraphData(graphModel)
        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleClearFile = async () => {
        if (!confirm("Are you sure you want to clear the current file?")) return;

        setLoading(true);
        try {
            const response = await fetch('/api/clear-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ file_name: activeFile.name }),
            });
            if (!response.ok) throw new Error('Failed to clear file');
            setGraphData({ nodes: [], edges: [] });

            // Refresh graph without parsing new SQL
            handleVisualize(null);
        } catch (err) {
            console.error(err);
            setError("Failed to clear file");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
            {/* Sidebar - SQL Input */}
            <div className="w-1/3 min-w-[300px] border-r border-gray-200 bg-white flex flex-col shadow-lg z-10">
                <div className="p-4 pb-0">
                    <h1 className="text-xl font-bold mb-4 text-gray-800">Lineage Visualizer</h1>

                    {/* Tabs */}
                    <div className="flex gap-1 overflow-x-auto pb-2 mb-2 border-b border-gray-200">
                        {files.map(file => (
                            <div
                                key={file.id}
                                onClick={() => setActiveFileId(file.id)}
                                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-sm font-medium cursor-pointer transition-colors whitespace-nowrap border-t border-l border-r ${activeFileId === file.id
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 z-10'
                                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                    }`}
                                style={{ marginBottom: '-1px' }}
                            >
                                <span>{file.name}</span>
                                {files.length > 1 && (
                                    <button
                                        onClick={(e) => handleCloseTab(file.id, e)}
                                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={handleNewTab}
                            className="px-2 py-1 text-gray-400 hover:text-blue-600 font-bold"
                            title="New Query"
                        >
                            +
                        </button>
                    </div>
                </div>

                <div className="flex-grow flex flex-col px-4 mb-4">
                    <textarea
                        className="flex-grow w-full p-3 font-mono text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-slate-50"
                        value={activeFile.content}
                        onChange={(e) => handleFileChange(e.target.value)}
                        placeholder="Paste your SQL here..."
                    />
                </div>

                <div className="px-4 pb-4 space-y-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleVisualize(activeFile.content)}
                            disabled={loading}
                            className={`flex-1 py-2 px-4 rounded font-bold text-white transition-colors ${loading
                                ? 'bg-blue-300 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 shadow'
                                }`}
                        >
                            {loading ? 'Processing...' : 'Visualize Lineage'}
                        </button>

                        <button
                            onClick={handleClearGraph}
                            disabled={loading || graphData.nodes.length === 0}
                            className="px-4 py-2 rounded font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Clear Visualization"
                        >
                            Clear
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleClearFile}
                            disabled={loading || graphData.nodes.length === 0}
                            className="flex-1 py-2 px-4 rounded font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Clear File"
                        >
                            Clear File
                        </button>
                    </div>

                    <div className="">
                        <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wide">View Options</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewOptions(prev => ({ ...prev, showTable: !prev.showTable }))}
                                className={`flex-1 py-1.5 px-3 rounded text-sm font-medium border transition-colors ${viewOptions.showTable
                                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                                    : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {viewOptions.showTable ? '✓ Tables' : 'Tables'}
                            </button>
                            <button
                                onClick={() => setViewOptions(prev => ({ ...prev, showColumn: !prev.showColumn }))}
                                className={`flex-1 py-1.5 px-3 rounded text-sm font-medium border transition-colors ${viewOptions.showColumn
                                    ? 'bg-orange-50 border-orange-200 text-orange-700'
                                    : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {viewOptions.showColumn ? '✓ Columns' : 'Columns'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Area - Graph */}
            <div className="flex-grow h-full bg-gray-50">
                {graphData.nodes.length > 0 ? (
                    <LineageGraph
                        initialNodes={graphData.nodes}
                        initialEdges={graphData.edges}
                        viewOptions={viewOptions}
                    />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                        <p>Enter SQL and click Visualize to see the lineage.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App
