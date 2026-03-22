import React from 'react';
import ThemeToggle from './ThemeToggle';
import SqlEditor from './SqlEditor';
import TabBar from './TabBar';

const Sidebar = ({
    files, activeFile, activeFileId,
    updateFileContent, addTab, closeTab, selectTab,
    loadDemoQueries, importFile, importFolder, downloadAllFiles,
    onVisualize, onClearGraph, onRunAll, onClearFile,
    loading, dialect, setDialect, viewOptions, setViewOptions,
    sidebarWidth, isDark, hasGraph,
    editingTabId, editingTabName, setEditingTabId, setEditingTabName,
    onTabDoubleClick, onTabRenameSubmit, onTabRenameKeyDown,
}) => {
    return (
        <div
            className="border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 flex flex-col shadow-lg z-10 transition-colors duration-300"
            style={{ width: sidebarWidth, minWidth: 280, maxWidth: 800 }}
        >
            {/* Header */}
            <div className="p-4 pb-0">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                        Lineage Visualizer
                    </h1>
                    <ThemeToggle />
                </div>

                <TabBar
                    files={files}
                    activeFileId={activeFileId}
                    onSelect={selectTab}
                    onClose={closeTab}
                    onAdd={addTab}
                    onImport={importFile}
                    onImportFolder={importFolder}
                    editingTabId={editingTabId}
                    editingTabName={editingTabName}
                    onTabDoubleClick={onTabDoubleClick}
                    onRenameChange={(e) => setEditingTabName(e.target.value)}
                    onRenameSubmit={onTabRenameSubmit}
                    onRenameKeyDown={onTabRenameKeyDown}
                />
            </div>

            {/* SQL Editor */}
            <div className="flex-grow flex flex-col px-4 mb-3 min-h-0">
                <SqlEditor
                    value={activeFile.content}
                    onChange={updateFileContent}
                    darkMode={isDark}
                />
            </div>

            {/* Action Buttons */}
            <div className="px-4 pb-4 space-y-3 flex-shrink-0 overflow-y-auto">
                {/* Primary action */}
                <button
                    onClick={onVisualize}
                    disabled={loading}
                    className={`w-full py-2 px-4 rounded-lg font-bold text-white text-sm transition-all duration-200 ${loading
                        ? 'bg-blue-300 dark:bg-blue-800 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 shadow hover:shadow-md'
                        }`}
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Processing...
                        </span>
                    ) : 'Visualize Lineage'}
                </button>

                {/* Secondary actions */}
                <div className="flex gap-2">
                    <button
                        onClick={onRunAll}
                        disabled={loading}
                        className="flex-1 py-2 px-4 rounded-lg font-semibold text-sm transition-colors
                                   border border-gray-300 dark:border-gray-600
                                   text-gray-700 dark:text-gray-300
                                   hover:bg-gray-50 dark:hover:bg-gray-700
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Send all open tabs to the backend at once"
                    >
                        Run All
                    </button>

                    <button
                        onClick={onClearFile}
                        disabled={loading || !hasGraph}
                        className="flex-1 py-2 px-4 rounded-lg font-semibold text-sm
                                   text-red-600 dark:text-red-400
                                   border border-red-200 dark:border-red-800
                                   hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Clear File"
                    >
                        Clear File
                    </button>
                </div>

                {/* Dialect Selector */}
                <div>
                    <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1 block uppercase tracking-widest">SQL Dialect</label>
                    <select
                        value={dialect}
                        onChange={(e) => setDialect(e.target.value)}
                        className="w-full py-1.5 px-2 rounded-lg text-xs border
                                   bg-white dark:bg-gray-800
                                   border-gray-200 dark:border-gray-700
                                   text-gray-700 dark:text-gray-300
                                   focus:outline-none focus:border-blue-400"
                    >
                        <option value="">Auto</option>
                        <option value="bigquery">BigQuery</option>
                        <option value="snowflake">Snowflake</option>
                        <option value="spark">Spark</option>
                        <option value="duckdb">DuckDB</option>
                        <option value="postgres">PostgreSQL</option>
                    </select>
                </div>

                {/* View Options */}
                <div>
                    <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1 block uppercase tracking-widest">View</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewOptions(prev => ({ ...prev, showTable: !prev.showTable }))}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${viewOptions.showTable
                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            {viewOptions.showTable ? '✓ Tables' : 'Tables'}
                        </button>
                        <button
                            onClick={() => setViewOptions(prev => ({ ...prev, showColumn: !prev.showColumn }))}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${viewOptions.showColumn
                                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            {viewOptions.showColumn ? '✓ Columns' : 'Columns'}
                        </button>
                    </div>
                </div>

                {/* Footer utilities */}
                <div className="flex gap-2 border-t border-gray-100 dark:border-gray-700 mt-1 pt-3">
                    <button
                        onClick={loadDemoQueries}
                        disabled={loading}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors
                                   text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Reset all tabs to demo queries"
                    >
                        ↻ Reset Demos
                    </button>
                    <button
                        onClick={downloadAllFiles}
                        disabled={loading}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors
                                   text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Download all tabs as .zip"
                    >
                        ↓ Download All
                    </button>
                    <button
                        onClick={onClearGraph}
                        disabled={loading || !hasGraph}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors
                                   text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Clear graph"
                    >
                        Clear All
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
