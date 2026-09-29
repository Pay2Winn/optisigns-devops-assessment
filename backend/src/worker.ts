import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { db, initialize, claim, heartbeat, complete, fail } from './db.js';
import { root, run, probe } from './media.js';
let stopped = false;
let active: AbortController | undefined;
process.on('SIGTERM', () => { stopped = true; active?.abort(); });
process.on('SIGINT', () => { stopped = true; active?.abort(); });
await initialize();
const health = createServer(async (req, res) => {
  if (req.url === '/health/live') { res.end('ok'); return; }
  try { await db.query('SELECT 1'); res.end('ok'); }
  catch { res.statusCode = 503; res.end('unavailable'); }
}).listen(3001, '0.0.0.0');
while (!stopped) {
  try {
    const job = await claim();
    if (!job) { await new Promise(r => setTimeout(r, 2000)); continue; }
    const controller = active = new AbortController();
    const dir = `${root}/${job.id}/${job.token}`;
    let renewing = false;
    const timer = setInterval(async () => {
      if (renewing) return;
      renewing = true;
      try { if (!await heartbeat(job.id, job.token)) controller.abort(); }
      catch { controller.abort(); }
      finally { renewing = false; }
    }, 10000);
    try {
      await mkdir(dir, { recursive: true });
      const outputs = [];
      for (const [name, width, height] of [['2k',2560,1440],['1080p',1920,1080],['720p',1280,720],['480p',854,480]] as const) {
        const file = `${dir}/${name}.mp4`;
        await run('ffmpeg', ['-nostdin','-v','error','-y','-threads','2','-i',`${root}/${job.id}/original.mp4`,
          '-map','0:v:0','-map','0:a:0?','-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
          '-filter_threads','1','-c:v','libx264','-threads','2','-preset','veryfast','-crf','24','-pix_fmt','yuv420p',
          '-c:a','aac','-b:a','128k','-movflags','+faststart',file], { signal: controller.signal, timeout: 1800000, maxBuffer: 1024 * 1024 });
        const { video } = await probe(file);
        outputs.push({ label: name, url: `/media/${job.id}/${job.token}/${name}.mp4`, width: video.width, height: video.height });
      }
      await run('ffmpeg', ['-nostdin','-v','error','-y','-threads','2','-i',`${root}/${job.id}/original.mp4`,'-frames:v','1','-vf','scale=480:-2','-filter_threads','1',`${dir}/thumbnail.jpg`], { signal: controller.signal, timeout: 30000 });
      outputs.push({ label: 'thumbnail', url: `/media/${job.id}/${job.token}/thumbnail.jpg`, width: null, height: null });
      if (!await complete(job.id, job.token, outputs)) throw new Error('Lease lost before publication');
      console.log(JSON.stringify({ event: 'ready', id: job.id, attempt: job.attempts }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'processing-failed', id: job.id, error: String(error).slice(0, 500) }));
      // A lost database response may hide a committed READY update. Never delete
      // attempt files here; offline reconciliation checks published references.
      await fail(job.id, job.token);
    } finally { clearInterval(timer); active = undefined; }
  } catch (error) {
    console.error(String(error));
    await new Promise(r => setTimeout(r, 3000));
  }
}
health.close();
await db.end();
