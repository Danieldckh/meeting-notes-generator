'use client';

import { useEffect, useRef, useState } from 'react';
import AudioRecorder from '@/components/AudioRecorder';
import MeetingHistory from '@/components/MeetingHistory';
import SummaryView from '@/components/SummaryView';
import TodoList from '@/components/TodoList';
import TranscriptView, { type TranscriptViewHandle } from '@/components/TranscriptView';
import { formatDuration } from '@/lib/format';
import type { Meeting, MeetingSummary, TodoItem } from '@/lib/types';

type Tab = 'summary' | 'todos' | 'transcript';

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'mp3';
}

export default function Home() {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'capture' | 'meeting'>('capture');
  const transcriptRef = useRef<TranscriptViewHandle | null>(null);

  useEffect(() => {
    void refreshList();
  }, []);

  async function refreshList() {
    try {
      const r = await fetch('/api/meetings');
      const data = await r.json();
      setMeetings(data.meetings ?? []);
    } catch {
      // silent
    }
  }

  async function loadMeeting(id: string) {
    setError(null);
    try {
      const r = await fetch(`/api/meetings/${id}`);
      if (!r.ok) throw new Error('Meeting not found');
      const data = await r.json();
      setActiveMeeting(data.meeting);
      setView('meeting');
      setTab('summary');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load meeting');
    }
  }

  async function deleteMeetingById(id: string) {
    await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
    if (activeMeeting?.id === id) {
      setActiveMeeting(null);
      setView('capture');
    }
    void refreshList();
  }

  async function processAudio(blob: Blob, title: string) {
    setIsProcessing(true);
    setError(null);
    setProcessingStage('Uploading audio…');

    const ext = extensionFor(blob.type);
    const file = new File([blob], `recording.${ext}`, { type: blob.type || 'audio/webm' });

    const fd = new FormData();
    fd.append('audio', file);
    if (title) fd.append('title', title);

    try {
      setProcessingStage('Transcribing with Whisper + generating notes (this may take a minute)…');
      const r = await fetch('/api/meetings', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Processing failed');
      setActiveMeeting(data.meeting);
      setView('meeting');
      setTab('summary');
      void refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  }

  async function updateTodos(next: TodoItem[]) {
    if (!activeMeeting) return;
    const updated = { ...activeMeeting, todos: next };
    setActiveMeeting(updated);
    try {
      await fetch(`/api/meetings/${activeMeeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todos: next }),
      });
    } catch {
      // optimistic update; ignore errors
    }
  }

  function jumpToTimestamp(seconds: number) {
    setTab('transcript');
    requestAnimationFrame(() => {
      transcriptRef.current?.scrollToTime(seconds);
    });
  }

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-ink-700/60 bg-ink-900/70 backdrop-blur">
        <div className="px-4 py-4 border-b border-ink-700/60">
          <h1 className="text-base font-semibold text-ink-50">
            Meeting Notes Generator
          </h1>
          <p className="text-[11px] text-ink-500 mt-0.5">
            Whisper · GPT-4o
          </p>
        </div>
        <MeetingHistory
          meetings={meetings}
          activeId={activeMeeting?.id ?? null}
          onSelect={loadMeeting}
          onDelete={deleteMeetingById}
          onNew={() => {
            setActiveMeeting(null);
            setView('capture');
            setError(null);
          }}
        />
      </div>

      {/* Main */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {view === 'capture' || !activeMeeting ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10 space-y-6">
              <header>
                <h2 className="text-2xl font-semibold text-ink-50">Capture a meeting</h2>
                <p className="text-sm text-ink-400 mt-1">
                  Record live or upload an existing audio file. We'll transcribe with timestamps, summarize, and extract action items automatically.
                </p>
              </header>

              <AudioRecorder onSubmit={processAudio} disabled={isProcessing} />

              {isProcessing && (
                <div className="rounded-xl border border-accent-600/30 bg-accent-600/10 px-4 py-3 flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full border-2 border-accent-500 border-t-transparent animate-spin" />
                  <p className="text-sm text-accent-500">{processingStage}</p>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-800/60 bg-red-900/30 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Meeting header */}
            <header className="px-8 py-5 border-b border-ink-700/60 bg-ink-900/40">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-ink-50 truncate">
                    {activeMeeting.title}
                  </h2>
                  <p className="text-xs text-ink-400 mt-1">
                    {new Date(activeMeeting.createdAt).toLocaleString()} · {formatDuration(activeMeeting.durationSeconds)}
                    {activeMeeting.language ? ` · ${activeMeeting.language}` : ''} · {activeMeeting.todos.length} action item{activeMeeting.todos.length === 1 ? '' : 's'}
                  </p>
                </div>
                <nav className="flex rounded-lg border border-ink-700 bg-ink-800/60 p-1 shrink-0">
                  {(
                    [
                      ['summary', 'Summary'],
                      ['todos', `To-Do (${activeMeeting.todos.length})`],
                      ['transcript', 'Transcript'],
                    ] as const
                  ).map(([t, label]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                        tab === t
                          ? 'bg-accent-600 text-white'
                          : 'text-ink-300 hover:text-ink-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              </div>
            </header>

            {/* Meeting body */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-8 py-6">
                {tab === 'summary' && <SummaryView markdown={activeMeeting.summary} />}
                {tab === 'todos' && (
                  <TodoList
                    todos={activeMeeting.todos}
                    onJumpToTimestamp={jumpToTimestamp}
                    onChange={updateTodos}
                  />
                )}
                {tab === 'transcript' && (
                  <TranscriptView
                    ref={transcriptRef}
                    segments={activeMeeting.transcript.segments}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
