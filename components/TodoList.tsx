'use client';

import { useState } from 'react';
import type { TodoItem } from '@/lib/types';
import { formatTimestamp } from '@/lib/format';

type Props = {
  todos: TodoItem[];
  onJumpToTimestamp: (seconds: number) => void;
  onChange: (next: TodoItem[]) => void;
};

export default function TodoList({ todos, onJumpToTimestamp, onChange }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  }

  function removeTodo(id: string) {
    onChange(todos.filter((t) => t.id !== id));
    setChecked((c) => {
      const { [id]: _drop, ...rest } = c;
      return rest;
    });
  }

  function addTodo() {
    const newItem: TodoItem = {
      id: `todo_manual_${Date.now()}`,
      text: '',
      timestamp: 0,
      context: 'Manually added',
    };
    onChange([...todos, newItem]);
  }

  function updateText(id: string, text: string) {
    onChange(todos.map((t) => (t.id === id ? { ...t, text } : t)));
  }

  if (todos.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-ink-400 text-sm">No action items were extracted from this meeting.</p>
        <button
          type="button"
          onClick={addTodo}
          className="rounded-lg border border-ink-600 hover:border-ink-500 px-3 py-1.5 text-sm text-ink-200"
        >
          + Add manually
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {todos.map((t) => {
          const isDone = !!checked[t.id];
          return (
            <li
              key={t.id}
              className="group rounded-xl border border-ink-700/60 bg-ink-800/40 hover:bg-ink-800/70 p-3 transition"
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggle(t.id)}
                  className="mt-1.5 h-4 w-4 rounded border-ink-500 bg-ink-900 text-accent-600 focus:ring-accent-600 focus:ring-offset-0 cursor-pointer"
                  aria-label="Mark complete"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <input
                      type="text"
                      value={t.text}
                      onChange={(e) => updateText(t.id, e.target.value)}
                      placeholder="(action item)"
                      className={`flex-1 min-w-0 bg-transparent border-0 border-b border-transparent focus:border-ink-600 focus:outline-none text-sm font-medium ${
                        isDone ? 'text-ink-500 line-through' : 'text-ink-100'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => onJumpToTimestamp(t.timestamp)}
                      title="Jump to this moment in the transcript"
                      className="font-mono text-[10px] text-accent-500/90 hover:text-accent-500 underline decoration-dotted underline-offset-4 align-sub"
                    >
                      [{formatTimestamp(t.timestamp)}]
                    </button>
                    {t.owner && (
                      <span className="ml-1 rounded-full bg-accent-600/20 text-accent-500 text-[10px] uppercase tracking-wider px-2 py-0.5">
                        {t.owner}
                      </span>
                    )}
                  </div>
                  {t.context && (
                    <p className="mt-1 text-xs text-ink-400 italic">"{t.context}"</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeTodo(t.id)}
                  className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-400 transition text-xs"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={addTodo}
          className="rounded-lg border border-ink-600 hover:border-ink-500 px-3 py-1.5 text-sm text-ink-200"
        >
          + Add manually
        </button>
        <span className="text-xs text-ink-500">
          Click a <span className="font-mono text-accent-500/90">[timestamp]</span> to jump to that moment in the transcript and confirm context.
        </span>
      </div>
    </div>
  );
}
