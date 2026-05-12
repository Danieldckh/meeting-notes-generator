import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meeting Notes Generator',
  description: 'Record or upload meetings, transcribe with Whisper, and auto-generate notes, to-dos, and timestamped transcripts.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-900 text-ink-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
