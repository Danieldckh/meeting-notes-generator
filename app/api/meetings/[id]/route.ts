import { NextRequest, NextResponse } from 'next/server';
import { getMeeting, deleteMeeting, saveMeeting } from '@/lib/storage';
import type { Meeting } from '@/lib/types';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  return NextResponse.json({ meeting });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ok = await deleteMeeting(id);
  if (!ok) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const existing = await getMeeting(id);
  if (!existing) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

  let body: Partial<Pick<Meeting, 'title' | 'todos' | 'summary'>>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated: Meeting = {
    ...existing,
    title: body.title?.trim() || existing.title,
    summary: body.summary ?? existing.summary,
    todos: Array.isArray(body.todos) ? body.todos : existing.todos,
  };

  await saveMeeting(updated);
  return NextResponse.json({ meeting: updated });
}
