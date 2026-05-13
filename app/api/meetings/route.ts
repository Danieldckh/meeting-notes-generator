import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio, generateNotes } from '@/lib/openai';
import { saveMeeting, listMeetings, newId } from '@/lib/storage';
import type { Meeting } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 900;

export async function GET() {
  const meetings = await listMeetings();
  return NextResponse.json({ meetings });
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured on the server.' },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with an "audio" file.' }, { status: 400 });
  }

  const audio = formData.get('audio');
  const providedTitle = (formData.get('title') as string | null)?.trim();

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'Missing "audio" file in form data.' }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: 'Uploaded audio file is empty.' }, { status: 400 });
  }
  if (audio.size > 500 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio file exceeds 500MB limit.' }, { status: 413 });
  }

  try {
    const transcription = await transcribeAudio(audio);
    const notes = await generateNotes(transcription.segments);

    const meeting: Meeting = {
      id: newId(),
      title: providedTitle || notes.title,
      createdAt: new Date().toISOString(),
      durationSeconds: transcription.duration,
      language: transcription.language,
      audioMimeType: audio.type,
      transcript: {
        full: transcription.text,
        segments: transcription.segments,
      },
      summary: notes.summary,
      todos: notes.todos,
    };

    await saveMeeting(meeting);
    return NextResponse.json({ meeting });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Processing failed: ${message}` }, { status: 500 });
  }
}
