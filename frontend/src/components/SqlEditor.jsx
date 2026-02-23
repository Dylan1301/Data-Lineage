import React, { useRef, useEffect } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';

const lightTheme = EditorView.theme({
    '&': {
        height: '100%',
        fontSize: '13px',
    },
    '.cm-scroller': {
        overflow: 'auto',
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
    },
    '.cm-content': {
        caretColor: '#2563eb',
    },
    '.cm-gutters': {
        backgroundColor: '#f8fafc',
        borderRight: '1px solid #e2e8f0',
        color: '#94a3b8',
    },
    '&.cm-focused .cm-cursor': {
        borderLeftColor: '#2563eb',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: '#dbeafe',
    },
    '.cm-activeLine': {
        backgroundColor: '#f1f5f9',
    },
    '.cm-activeLineGutter': {
        backgroundColor: '#f1f5f9',
    },
});

const darkThemeOverride = EditorView.theme({
    '&': {
        height: '100%',
        fontSize: '13px',
    },
    '.cm-scroller': {
        overflow: 'auto',
        fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
    },
});

const SqlEditor = ({ value, onChange, darkMode = false }) => {
    const editorRef = useRef(null);
    const viewRef = useRef(null);
    const isExternalUpdate = useRef(false);
    const onChangeRef = useRef(onChange);

    // Always keep the ref pointing to the latest onChange
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (!editorRef.current) return;

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged && !isExternalUpdate.current) {
                const newValue = update.state.doc.toString();
                onChangeRef.current(newValue);
            }
        });

        const extensions = [
            basicSetup,
            sql(),
            updateListener,
            EditorView.lineWrapping,
            darkMode ? [oneDark, darkThemeOverride] : lightTheme,
        ];

        const state = EditorState.create({
            doc: value || '',
            extensions,
        });

        const view = new EditorView({
            state,
            parent: editorRef.current,
        });

        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, [darkMode]); // Recreate when theme changes

    // Sync external value changes
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        const currentContent = view.state.doc.toString();
        if (currentContent !== value) {
            isExternalUpdate.current = true;
            view.dispatch({
                changes: {
                    from: 0,
                    to: currentContent.length,
                    insert: value || '',
                },
            });
            isExternalUpdate.current = false;
        }
    }, [value]);

    return (
        <div
            ref={editorRef}
            className="flex-grow w-full border border-gray-300 dark:border-gray-600 rounded overflow-hidden 
                        bg-white dark:bg-gray-900"
        />
    );
};

export default SqlEditor;
