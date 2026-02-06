import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const TableNode = memo(({ data }) => {
    return (
        <div className="table-node bg-white border border-gray-300 rounded shadow-sm min-w-[200px]">
            <div className="table-header bg-slate-100 p-2 border-b border-gray-200 font-bold text-sm rounded-t">
                {data.label}
            </div>
            <div className="table-columns p-2">
                {data.columns.map((col) => (
                    <div key={col.id} className="relative flex items-center justify-between py-1 text-xs">
                        {/* Left handle for incoming connections (upstream) */}
                        <Handle
                            type="target"
                            position={Position.Left}
                            id={col.id}
                            className="!w-2 !h-2 !bg-gray-400"
                            style={{ left: -10 }}
                        />

                        <span className="text-gray-700">{col.name}</span>

                        {/* Right handle for outgoing connections (downstream) */}
                        <Handle
                            type="source"
                            position={Position.Right}
                            id={col.id}
                            className="!w-2 !h-2 !bg-gray-400"
                            style={{ right: -10 }}
                        />
                    </div>
                ))}
            </div>
            {/* Table level handles (optional, for table-to-table lineage if preferred) */}
            <Handle type="target" position={Position.Left} id="table-target" style={{ top: 20 }} className="!w-3 !h-3 !bg-blue-500 !rounded-none" />
            <Handle type="source" position={Position.Right} id="table-source" style={{ top: 20 }} className="!w-3 !h-3 !bg-blue-500 !rounded-none" />
        </div>
    );
});

export default TableNode;
