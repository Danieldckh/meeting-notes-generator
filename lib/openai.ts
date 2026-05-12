import OpenAI from 'openai';
import type { TranscriptSegment, TodoItem } from './types';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(
  file: File,
): Promise<{ segments: TranscriptSegment[]; text: string; duration: number; language?: string }> {
  const result = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  }) as unknown as {
    text: string;
    duration?: number;
    language?: string;
    segments?: Array<{ id: number; start: number; end: number; text: string }>;
  };

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
