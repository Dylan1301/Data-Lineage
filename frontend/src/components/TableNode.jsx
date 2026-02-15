import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const TableNode = memo(({ data }) => {
    return (
        <div className={`table-node bg-white border border-gray-300 rounded shadow-sm min-w-[200px] transition-all duration-200 ${data.isHighlighted ? '!border-cyan-500 !ring-2 !ring-cyan-500' : ''} ${data.isDimmed ? 'opacity-40' : ''}`}>
            <div className={`table-header bg-slate-100 p-2 border-b border-gray-200 font-bold text-sm rounded-t ${data.isHighlighted ? '!bg-cyan-50' : ''}`}>
                {data.label}
            </div>
            <div className="table-columns p-2">
                {data.columns.map((col) => {
                    const isColHighlighted = data.highlightedColumns && data.highlightedColumns.has(col.id);
                    return (
                        <div
                            key={col.id}
                            className={`relative flex items-center justify-between py-1 text-xs transition-colors duration-200 cursor-pointer hover:bg-gray-50 rounded px-1 ${isColHighlighted ? '!text-purple-700 font-semibold !bg-purple-50' : ''}`}
                            onMouseEnter={() => data.onColumnHover && data.onColumnHover(col.id)}
                            onMouseLeave={() => data.onColumnLeave && data.onColumnLeave()}
                        >
                            {/* Left handle for incoming connections (upstream) */}
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={col.id}
                                className={`!w-2 !h-2 !bg-gray-400 ${isColHighlighted ? '!bg-purple-500' : ''}`}
                                style={{ left: -10 }}
                            />

                            <span>{col.name}</span>

                            {/* Right handle for outgoing connections (downstream) */}
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={col.id}
                                className={`!w-2 !h-2 !bg-gray-400 ${isColHighlighted ? '!bg-purple-500' : ''}`}
                                style={{ right: -10 }}
                            />
                        </div>
                    );
                })}
            </div>
            {/* Table level handles (optional, for table-to-table lineage if preferred) */}
            <Handle type="target" position={Position.Left} id="table-target" style={{ top: 20 }} className="!w-3 !h-3 !bg-blue-500 !rounded-none" />
            <Handle type="source" position={Position.Right} id="table-source" style={{ top: 20 }} className="!w-3 !h-3 !bg-blue-500 !rounded-none" />
        </div>
    );
});

export default TableNode;
