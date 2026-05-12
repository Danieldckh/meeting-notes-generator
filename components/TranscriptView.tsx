'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { TranscriptSegment } from '@/lib/types';
import { formatTimestamp } from '@/lib/format';

type Props = {
  segments: TranscriptSegment[];
};

export type TranscriptViewHandle = {
  scrollToTime: (seconds: number) => void;
};

const TranscriptView = forwardRef<TranscriptViewHandle, Props>(function TranscriptView(
  { segments },
  ref,
) {
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useImperativeHandle(ref, () => ({
    scrollToTime(seconds) {
      const target = segments.find((s) => seconds >= s.start && seconds <= s.end)
        ?? segments.reduce<TranscriptSegment | null>((closest, s) => {
          if (!closest) return s;
          return Math.abs(s.start - seconds) < Math.abs(closest.start - seconds) ? s : closest;
        }, null);
      if (!target) return;
      const el = segmentRefs.current.get(target.id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 1600);
    },
  }));

  if (segments.length === 0) {
    return <p className="text-ink-400 text-sm">No transcript segments available.</p>;
  }

  return (
    <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-2">
      {segments.map((s) => (
        <div
          key={s.id}
          ref={(el) => {
            if (el) segmentRefs.current.set(s.id, el);
            else segmentRefs.current.delete(s.id);
          }}
          className="group flex gap-3 rounded-lg px-3 py-2 transition hover:bg-ink-800/60"
        >
          <span className="font-mono text-xs text-ink-400 whitespace-nowrap pt-0.5 w-16 shrink-0">
            {formatTimestamp(s.start)}
          </span>
          <p className="text-sm text-ink-100 leading-relaxed">{s.text}</p>
        </div>
      ))}
      <style jsx>{`
        :global(.flash-highlight) {
          animation: flash 1.6s ease-out;
        }
        @keyframes flash {
          0% { background-color: rgba(99, 102, 241, 0.35); }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
});

export default TranscriptView;
