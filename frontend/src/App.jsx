import { useState } from 'react'
import LineageGraph from './components/LineageGraph'
import './App.css'

function App() {
    const [sql, setSql] = useState(`SELECT o.order_id, c.name 
FROM db.orders o 
JOIN db.customers c ON o.customer_id = c.id
WHERE o.amount > 100`)

    const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleVisualize = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/visualize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sql }),
            })

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`)
            }

            const data = await response.json()
            setGraphData(data)
        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
            {/* Sidebar - SQL Input */}
            <div className="w-1/3 min-w-[300px] border-r border-gray-200 bg-white p-4 flex flex-col shadow-lg z-10">
                <h1 className="text-xl font-bold mb-4 text-gray-800">Lineage Visualizer</h1>

                <div className="flex-grow flex flex-col mb-4">
                    <label className="text-sm font-semibold text-gray-600 mb-2">SQL Input</label>
                    <textarea
                        className="flex-grow w-full p-3 font-mono text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-slate-50"
                        value={sql}
                        onChange={(e) => setSql(e.target.value)}
                        placeholder="Paste your SQL here..."
                    />
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleVisualize}
                    disabled={loading}
                    className={`w-full py-2 px-4 rounded font-bold text-white transition-colors ${loading
                            ? 'bg-blue-300 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 shadow'
                        }`}
                >
                    {loading ? 'Processing...' : 'Visualize Lineage'}
                </button>
            </div>

            {/* Main Area - Graph */}
            <div className="flex-grow h-full bg-gray-50">
                {graphData.nodes.length > 0 ? (
                    <LineageGraph initialNodes={graphData.nodes} initialEdges={graphData.edges} />
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
