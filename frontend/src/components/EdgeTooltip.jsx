import React from 'react';

const EdgeTooltip = ({ x, y, sourceLabel, targetLabel, sourceHandle, targetHandle }) => {
    if (!x || !y) return null;

    const sourceCol = sourceHandle || 'table';
    const targetCol = targetHandle || 'table';

    return (
        <div
            className="fixed z-50 pointer-events-none"
            style={{ left: x + 12, top: y - 40 }}
        >
            <div className="px-3 py-2 rounded-lg shadow-lg text-xs
                            bg-gray-900 dark:bg-gray-700 text-white
                            border border-gray-700 dark:border-gray-500">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-blue-300">{sourceLabel}</span>
                    <span className="text-gray-400">.</span>
                    <span className="text-orange-300">{sourceCol}</span>
                </div>
                <div className="flex items-center justify-center my-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <polyline points="19 12 12 19 5 12" />
                    </svg>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-medium text-blue-300">{targetLabel}</span>
                    <span className="text-gray-400">.</span>
                    <span className="text-orange-300">{targetCol}</span>
                </div>
            </div>
        </div>
    );
};

export default EdgeTooltip;
