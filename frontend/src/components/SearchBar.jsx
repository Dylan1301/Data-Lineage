import React, { useState, useCallback } from 'react';

const SearchBar = ({ onSearchChange, fileNames = [], onFileFilterChange, activeFileFilter }) => {
    const [query, setQuery] = useState('');

    const handleChange = useCallback((e) => {
        const value = e.target.value;
        setQuery(value);
        onSearchChange(value);
    }, [onSearchChange]);

    const handleClear = useCallback(() => {
        setQuery('');
        onSearchChange('');
    }, [onSearchChange]);

    return (
        <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
                <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    placeholder="Search tables or columns..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg
                               border border-gray-200 dark:border-gray-600
                               bg-white dark:bg-gray-800
                               text-gray-700 dark:text-gray-300
                               placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400
                               transition-colors"
                />
                {query && (
                    <button
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>

            {/* File Filter */}
            {fileNames.length > 1 && (
                <select
                    value={activeFileFilter || ''}
                    onChange={(e) => onFileFilterChange(e.target.value || null)}
                    className="text-xs py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-600
                               bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
                               focus:outline-none focus:ring-2 focus:ring-blue-500/40
                               cursor-pointer"
                >
                    <option value="">All Files</option>
                    {fileNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
            )}
        </div>
    );
};

export default SearchBar;
