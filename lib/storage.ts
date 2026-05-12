import { promises as fs } from 'fs';
import path from 'path';
import type { Meeting, MeetingSummary } from './types';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function meetingFile(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function saveMeeting(meeting: Meeting): Promise<void> {
  await ensureDir();
  await fs.writeFile(meetingFile(meeting.id), JSON.stringify(meeting, null, 2), 'utf-8');
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  try {
    const raw = await fs.readFile(meetingFile(id), 'utf-8');
    return JSON.parse(raw) as Meeting;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listMeetings(): Promise<MeetingSummary[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const summaries: MeetingSummary[] = [];

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf-8');
      const m = JSON.parse(raw) as Meeting;
      summaries.push({
        id: m.id,
        title: m.title,
        createdAt: m.createdAt,
        durationSeconds: m.durationSeconds,
      });
    } catch {
      // skip corrupt files
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteMeeting(id: string): Promise<boolean> {
  try {
    await fs.unlink(meetingFile(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export function newId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
