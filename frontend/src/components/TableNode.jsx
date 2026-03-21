import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const TableNode = memo(({ data }) => {
    const isSearchMatch = data.isSearchMatch;
    const isSearchActive = data.isSearchActive;

    return (
        <div className={`table-node min-w-[200px] transition-all duration-200 rounded-lg overflow-hidden
            bg-white dark:bg-gray-800 
            border border-gray-200 dark:border-gray-600 
            shadow-sm dark:shadow-gray-900/30
            ${data.isHighlighted ? '!border-cyan-500 !ring-2 !ring-cyan-500/50' : ''} 
            ${data.isDimmed ? 'opacity-40' : ''}
            ${isSearchActive && isSearchMatch ? '!border-emerald-500 !ring-2 !ring-emerald-400/50' : ''}
            ${isSearchActive && !isSearchMatch ? 'opacity-30' : ''}`}
        >
            {/* Header */}
            <div className={`table-header p-2.5 border-b font-semibold text-sm flex justify-between items-center
                bg-slate-50 dark:bg-gray-750 
                border-gray-200 dark:border-gray-600
                text-gray-800 dark:text-gray-200
                ${data.isHighlighted ? '!bg-cyan-50 dark:!bg-cyan-900/30' : ''}
                ${isSearchActive && isSearchMatch ? '!bg-emerald-50 dark:!bg-emerald-900/20' : ''}`}
            >
                <span className="truncate">{data.label}</span>
                <div className="flex items-center gap-1">
                    {data.table_node_type === 'table' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium">
                            TABLE
                        </span>
                    )}
                    {data.is_first && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onToggleMinimize && data.onToggleMinimize(data.id);
                            }}
                            className="ml-1 text-xs px-1.5 py-0.5 rounded 
                                       bg-gray-200 dark:bg-gray-600 
                                       hover:bg-gray-300 dark:hover:bg-gray-500 
                                       text-gray-600 dark:text-gray-300 transition-colors"
                            title={data.isMinimized ? "Expand Lineage" : "Collapse Lineage"}
                        >
                            {data.isMinimized ? "▸" : "▾"}
                        </button>
                    )}
                </div>
            </div>

            {/* Columns */}
            <div className="table-columns p-1.5">
                {data.columns.map((col) => {
                    const isColHighlighted = data.highlightedColumns && data.highlightedColumns.has(col.id);
                    const isColSearchMatch = data.searchMatchColumns && data.searchMatchColumns.has(col.id);

                    return (
                        <div
                            key={col.id}
                            className={`relative flex items-center justify-between py-1.5 text-xs transition-colors duration-200 cursor-pointer rounded px-2 mx-0.5
                                text-gray-700 dark:text-gray-300
                                hover:bg-gray-50 dark:hover:bg-gray-700/50
                                ${isColHighlighted ? '!text-purple-700 dark:!text-purple-300 font-semibold !bg-purple-50 dark:!bg-purple-900/20' : ''}
                                ${isColSearchMatch ? '!bg-emerald-50 dark:!bg-emerald-900/20 !text-emerald-700 dark:!text-emerald-300 font-medium' : ''}`}
                            onMouseEnter={() => data.onColumnHover && data.onColumnHover(col.id)}
                            onMouseLeave={() => data.onColumnLeave && data.onColumnLeave()}
                            onClick={(e) => { e.stopPropagation(); data.onColumnClick && data.onColumnClick(data.label, col.name); }}
                        >
                            {/* Left handle */}
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={col.id}
                                className={`!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500 ${isColHighlighted ? '!bg-purple-500' : ''}`}
                                style={{ left: -10 }}
                            />

                            <span>{col.name}</span>

                            {/* Right handle */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={col.id}
                                className={`!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500 ${isColHighlighted ? '!bg-purple-500' : ''}`}
                                style={{ right: -10 }}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Table level handles */}
            <Handle type="target" position={Position.Left} id="table-target" style={{ top: 16, background: 'transparent', border: 'none' }} />
            <Handle type="source" position={Position.Right} id="table-source" style={{ top: 16, background: 'transparent', border: 'none' }} />
        </div>
    );
});

export default TableNode;
