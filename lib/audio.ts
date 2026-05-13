import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

const MAX_CHUNK_BYTES = 24 * 1024 * 1024;
const TARGET_BITRATE_KBPS = 32;

export type AudioChunk = {
  path: string;
  offsetSeconds: number;
  durationSeconds: number;
};

export type PreparedAudio = {
  chunks: AudioChunk[];
  totalDurationSeconds: number;
  cleanup: () => Promise<void>;
};

function runProcess(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(cmd, args);
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

async function probeDurationSeconds(file: string): Promise<number> {
  const { stdout } = await runProcess('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error('Could not determine audio duration.');
  return d;
}

function extensionFromMime(mimeType: string, fallbackName?: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('aac')) return 'aac';
  if (fallbackName) {
    const ext = path.extname(fallbackName).replace('.', '').toLowerCase();
    if (ext) return ext;
  }
  return 'bin';
}

export async function prepareAudio(buffer: Buffer, mimeType: string, originalName?: string): Promise<PreparedAudio> {
  const tmpDir = path.join(os.tmpdir(), `mng-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const cleanup = async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    const inputExt = extensionFromMime(mimeType, originalName);
    const inputPath = path.join(tmpDir, `input.${inputExt}`);
    await fs.writeFile(inputPath, buffer);

    const compressedPath = path.join(tmpDir, 'compressed.webm');
    await runProcess('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'libopus',
      '-b:a', `${TARGET_BITRATE_KBPS}k`,
      '-application', 'voip',
      compressedPath,
    ]);

    const stat = await fs.stat(compressedPath);
    const totalDuration = await probeDurationSeconds(compressedPath);

    if (stat.size <= MAX_CHUNK_BYTES) {
      return {
        chunks: [{ path: compressedPath, offsetSeconds: 0, durationSeconds: totalDuration }],
        totalDurationSeconds: totalDuration,
        cleanup,
      };
    }

    const chunkCount = Math.ceil(stat.size / MAX_CHUNK_BYTES);
    const chunkDuration = Math.ceil(totalDuration / chunkCount);
    const chunks: AudioChunk[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const offset = i * chunkDuration;
      const remaining = totalDuration - offset;
      if (remaining <= 0.5) break;
      const dur = Math.min(chunkDuration, remaining);
      const out = path.join(tmpDir, `chunk_${i}.webm`);
      await runProcess('ffmpeg', [
        '-y',
        '-ss', String(offset),
        '-i', compressedPath,
        '-t', String(dur),
        '-c', 'copy',
        out,
      ]);
      chunks.push({ path: out, offsetSeconds: offset, durationSeconds: dur });
    }

    return { chunks, totalDurationSeconds: totalDuration, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runProcess('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}
