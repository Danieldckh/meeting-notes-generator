export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type TodoItem = {
  id: string;
  text: string;
  timestamp: number;
  owner?: string;
  context?: string;
};

export type Meeting = {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  language?: string;
  audioMimeType?: string;
  transcript: {
    full: string;
    segments: TranscriptSegment[];
  };
  summary: string;
  todos: TodoItem[];
};

export type MeetingSummary = {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
};
