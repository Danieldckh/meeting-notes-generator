'use client';

import type { MeetingSummary } from '@/lib/types';
import { formatDuration, formatRelativeDate } from '@/lib/format';

type Props = {
  meetings: MeetingSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
};

export default function MeetingHistory({ meetings, activeId, onSelect, onDelete, onNew }: Props) {
  return (
    <aside className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700/60">
        <h2 className="text-xs uppercase tracking-wider text-ink-400">Meetings</h2>
        <button
          type="button"
          onClick={onNew}
          className="text-xs rounded-md bg-accent-600 hover:bg-accent-500 px-2.5 py-1 text-white font-medium transition"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {meetings.length === 0 ? (
          <p className="px-4 py-6 text-xs text-ink-500">
            No meetings yet. Record or upload audio to get started.
          </p>
        ) : (
          <ul className="py-1">
            {meetings.map((m) => {
              const isActive = m.id === activeId;
              return (
                <li key={m.id}>
                  <div
                    className={`group flex items-start gap-2 px-4 py-2.5 cursor-pointer transition ${
                      isActive
                        ? 'bg-accent-600/15 border-l-2 border-accent-600'
                        : 'border-l-2 border-transparent hover:bg-ink-800/50'
                    }`}
                    onClick={() => onSelect(m.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-100 truncate font-medium">{m.title}</p>
                      <p className="text-[11px] text-ink-500 mt-0.5">
                        {formatRelativeDate(m.createdAt)} · {formatDuration(m.durationSeconds)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${m.title}"?`)) onDelete(m.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-400 text-xs transition"
                      aria-label="Delete meeting"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
