'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onSubmit: (blob: Blob, title: string) => void;
  disabled?: boolean;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function AudioRecorder({ onSubmit, disabled }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  function clearRecordedUrl() {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
  }

  async function startRecording() {
    setError(null);
    setUploadedFile(null);
    setRecordedBlob(null);
    clearRecordedUrl();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(1000);
      setIsRecording(true);
      setElapsed(0);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startedAt) / 1000);
      }, 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone access denied');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!f.type.startsWith('audio/') && !f.type.startsWith('video/')) {
      setError('Please choose an audio or video file.');
      return;
    }
    setError(null);
    setUploadedFile(f);
    setRecordedBlob(null);
    clearRecordedUrl();
  }

  function reset() {
    setRecordedBlob(null);
    setUploadedFile(null);
    clearRecordedUrl();
    setElapsed(0);
  }

  const sourceBlob = recordedBlob ?? uploadedFile;
  const sourceLabel = uploadedFile
    ? uploadedFile.name
    : recordedBlob
      ? `Recording (${formatTime(elapsed)})`
      : null;

  function submit() {
    if (!sourceBlob) return;
    onSubmit(sourceBlob, title.trim());
  }

  return (
    <div className="rounded-2xl border border-ink-700/60 bg-ink-800/40 p-5 space-y-4">
      <div>
        <label htmlFor="title-input" className="text-xs uppercase tracking-wider text-ink-400">Meeting title (optional)</label>
        <input
          id="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Q3 product roadmap sync"
          className="mt-1 w-full rounded-lg bg-ink-900/60 border border-ink-700 px-3 py-2 text-sm outline-none focus:border-accent-600"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!isRecording && !sourceBlob && (
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
            Start recording
          </button>
        )}

        {isRecording && (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-700 hover:bg-ink-600 px-4 py-2 text-sm font-medium text-white transition"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 rec-dot" />
            Stop · {formatTime(elapsed)}
          </button>
        )}

        {!isRecording && !sourceBlob && (
          <>
            <span className="text-ink-500 text-sm">or</span>
            <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-ink-600 hover:border-ink-500 bg-ink-800 hover:bg-ink-700 px-4 py-2 text-sm font-medium text-ink-100 transition">
              <input
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={handleFile}
                disabled={disabled}
              />
              Upload audio
            </label>
          </>
        )}

        {sourceBlob && !isRecording && (
          <>
            <div className="flex-1 min-w-[200px] flex items-center gap-3 rounded-lg bg-ink-900/60 border border-ink-700 px-3 py-2 text-sm">
              <span className="text-ink-300 truncate">{sourceLabel}</span>
              {recordedUrl && (
                <audio src={recordedUrl} controls className="ml-auto h-8 max-w-[280px]" />
              )}
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              className="rounded-lg border border-ink-600 hover:border-ink-500 px-3 py-2 text-sm text-ink-200 transition"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              className="rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition"
            >
              {disabled ? 'Processing…' : 'Generate notes'}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <p className="text-xs text-ink-500">
        Recordings stay in your browser until you click <em>Generate notes</em>. Long meetings are compressed and chunked server-side, so multi-hour recordings work. Files up to 500MB.
      </p>
    </div>
  );
}
