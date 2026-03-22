import React from 'react';

const TabBar = ({
    files, activeFileId,
    onSelect, onClose, onAdd, onImport, onImportFolder,
    editingTabId, editingTabName,
    onTabDoubleClick, onRenameChange, onRenameSubmit, onRenameKeyDown,
}) => {
    return (
        <div className="flex gap-1 overflow-x-auto pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
            {files.map(file => (
                <div
                    key={file.id}
                    onClick={() => onSelect(file.id)}
                    onDoubleClick={() => onTabDoubleClick(file)}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-xs font-medium cursor-pointer transition-colors whitespace-nowrap border-t border-l border-r ${activeFileId === file.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 z-10'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    style={{ marginBottom: '-1px' }}
                >
                    {editingTabId === file.id ? (
                        <input
                            type="text"
                            value={editingTabName}
                            onChange={onRenameChange}
                            onBlur={onRenameSubmit}
                            onKeyDown={onRenameKeyDown}
                            autoFocus
                            className="w-20 px-1 py-0 text-xs bg-white dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded outline-none text-gray-800 dark:text-gray-200"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span title="Double-click to rename">{file.name}</span>
                    )}
                    {files.length > 1 && (
                        <button
                            onClick={(e) => onClose(file.id, e)}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            <button
                onClick={onAdd}
                className="px-2 py-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors"
                title="New Query"
            >
                +
            </button>
            <label
                className="px-2 py-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                title="Import .sql file"
            >
                <input
                    type="file"
                    accept=".sql"
                    className="hidden"
                    onChange={(e) => onImport(e.target.files[0])}
                />
                ↑
            </label>
            <label
                className="px-2 py-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                title="Import folder of .sql files"
            >
                <input
                    type="file"
                    accept=".sql"
                    webkitdirectory=""
                    multiple
                    className="hidden"
                    onChange={(e) => onImportFolder(e.target.files)}
                />
                &#128193;
            </label>
        </div>
    );
};

export default TabBar;
