import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const run = promisify(execFile);
export const root = process.env.UPLOAD_ROOT || '/uploads';
export async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], { timeout: 30000, maxBuffer: 1024 * 1024 });
  const data = JSON.parse(stdout);
  const video = data.streams?.find((s: any) => s.codec_type === 'video');
  if (!video || !Number.isFinite(Number(data.format?.duration)) || Number(data.format.duration) <= 0) throw new Error('Invalid video');
  return { data, video };
}
