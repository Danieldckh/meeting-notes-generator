import { promises as fs } from 'fs';
import path from 'path';
import OpenAI, { toFile } from 'openai';
import type { TranscriptSegment, TodoItem } from './types';
import { ffmpegAvailable, prepareAudio, type AudioChunk } from './audio';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DIRECT_UPLOAD_LIMIT_BYTES = 24 * 1024 * 1024;

type WhisperResult = {
  text: string;
  duration?: number;
  language?: string;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
};

async function transcribeChunkFile(filePath: string, fileName: string): Promise<WhisperResult> {
  const buffer = await fs.readFile(filePath);
  const upload = await toFile(buffer, fileName, { type: 'audio/webm' });
  return (await client.audio.transcriptions.create({
    file: upload,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  })) as unknown as WhisperResult;
}

async function transcribeFileDirect(file: File): Promise<WhisperResult> {
  return (await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  })) as unknown as WhisperResult;
}

function applyOffset(result: WhisperResult, chunk: AudioChunk, idBase: number): TranscriptSegment[] {
  return (result.segments ?? []).map((s, i) => ({
    id: idBase + i,
    start: s.start + chunk.offsetSeconds,
    end: s.end + chunk.offsetSeconds,
    text: s.text.trim(),
  }));
}

export async function transcribeAudio(
  file: File,
): Promise<{ segments: TranscriptSegment[]; text: string; duration: number; language?: string }> {
  if (file.size <= DIRECT_UPLOAD_LIMIT_BYTES) {
    const result = await transcribeFileDirect(file);
    const segments: TranscriptSegment[] = (result.segments ?? []).map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));
    return {
      segments,
      text: result.text,
      duration: result.duration ?? segments.at(-1)?.end ?? 0,
      language: result.language,
    };
  }

  if (!(await ffmpegAvailable())) {
    throw new Error(
      `Audio is ${(file.size / 1024 / 1024).toFixed(1)} MB which exceeds OpenAI Whisper's 25 MB limit, and ffmpeg is not available on this server to compress it.`,
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const prepared = await prepareAudio(Buffer.from(arrayBuf), file.type, file.name);

  try {
    const results = await Promise.all(
      prepared.chunks.map((c) => transcribeChunkFile(c.path, path.basename(c.path))),
    );

    let allSegments: TranscriptSegment[] = [];
    let idBase = 0;
    const textParts: string[] = [];
    let language: string | undefined;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const segs = applyOffset(r, prepared.chunks[i], idBase);
      allSegments = allSegments.concat(segs);
      idBase += segs.length;
      if (r.text?.trim()) textParts.push(r.text.trim());
      if (!language && r.language) language = r.language;
    }

    return {
      segments: allSegments,
      text: textParts.join(' '),
      duration: prepared.totalDurationSeconds,
      language,
    };
  } finally {
    await prepared.cleanup();
  }
}

const SYSTEM_PROMPT = `You are an expert meeting note-taker. You will be given a transcript broken into time-stamped segments like:

[12.4s] Speaker said something here.
[18.9s] Another segment of speech.

Your job:
1. Produce a polished MEETING SUMMARY in Markdown with sections: ## Overview, ## Key Discussion Points (bulleted), ## Decisions, ## Open Questions.
2. Extract a TO-DO LIST of action items mentioned or implied. For each to-do, include:
   - "text": short imperative action item (e.g., "Send pricing proposal to ACME")
   - "timestamp": numeric seconds (float) of the segment where the action was discussed. ALWAYS copy this from the [N.Ns] tag of the nearest relevant segment. NEVER invent timestamps.
   - "owner": person assigned (or null if not stated)
   - "context": one sentence quoting/paraphrasing the surrounding discussion so the user can confirm

Respond ONLY with valid JSON in this exact shape:
{
  "title": "Short meeting title (5-8 words)",
  "summary": "Markdown summary...",
  "todos": [
    {"text": "...", "timestamp": 12.4, "owner": "Alice" | null, "context": "..."}
  ]
}

If there are no action items, return an empty todos array. Be concise but capture every commitment.`;

export type GeneratedNotes = {
  title: string;
  summary: string;
  todos: TodoItem[];
};

export async function generateNotes(segments: TranscriptSegment[]): Promise<GeneratedNotes> {
  if (segments.length === 0) {
    return {
      title: 'Empty Meeting',
      summary: '## Overview\n\nNo speech was detected in the recording.',
      todos: [],
    };
  }

  const timestampedTranscript = segments
    .map((s) => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join('\n');

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Here is the meeting transcript:\n\n${timestampedTranscript}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let parsed: {
    title?: string;
    summary?: string;
    todos?: Array<{ text: string; timestamp: number; owner?: string | null; context?: string }>;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const todos: TodoItem[] = (parsed.todos ?? []).map((t, i) => ({
    id: `todo_${Date.now()}_${i}`,
    text: t.text,
    timestamp: typeof t.timestamp === 'number' ? t.timestamp : 0,
    owner: t.owner ?? undefined,
    context: t.context,
  }));

  return {
    title: parsed.title?.trim() || 'Untitled Meeting',
    summary: parsed.summary || '## Overview\n\n(Summary generation failed — please retry.)',
    todos,
  };
}
