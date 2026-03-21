import React from 'react';

/**
 * Slide-in panel showing upstream and downstream column impact.
 *
 * Props:
 *   impactData — { column, upstream: [{table, column}], downstream: [{table, column}] }
 *   onClose    — called when the panel is dismissed
 */
export default function ImpactPanel({ impactData, onClose }) {
    if (!impactData) return null;

    return (
        <div className="absolute top-0 right-0 h-full w-72 bg-white dark:bg-gray-800
                        border-l border-gray-200 dark:border-gray-700
                        shadow-xl z-30 flex flex-col
                        animate-[slideIn_0.2s_ease-out]">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3
                            border-b border-gray-200 dark:border-gray-700
                            bg-gray-50 dark:bg-gray-750">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">
                        Column Impact
                    </p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono truncate max-w-[200px]">
                        {impactData.column}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xl leading-none"
                    title="Close (Esc)"
                >
                    ×
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <ImpactSection
                    title="Upstream"
                    entries={impactData.upstream}
                    emptyLabel="No upstream columns — this is a base column."
                    color="blue"
                />
                <ImpactSection
                    title="Downstream"
                    entries={impactData.downstream}
                    emptyLabel="No downstream columns — nothing reads from this column."
                    color="orange"
                />
            </div>
        </div>
    );
}

function ImpactSection({ title, entries, emptyLabel, color }) {
    const colorMap = {
        blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700',
        orange: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700',
    };

    const badgeMap = {
        blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
        orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    {title}
                </h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeMap[color]}`}>
                    {entries.length}
                </span>
            </div>

            {entries.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">{emptyLabel}</p>
            ) : (
                <ul className="space-y-1">
                    {entries.map((entry, i) => (
                        <li key={i} className={`text-xs px-2 py-1.5 rounded border font-mono ${colorMap[color]}`}>
                            <span className="opacity-60">{entry.table}.</span>
                            <span className="font-semibold">{entry.column}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
