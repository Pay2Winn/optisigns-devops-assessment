import pg from 'pg';
import { randomUUID } from 'node:crypto';
export const db = new pg.Pool({ host: process.env.PGHOST || 'postgres', database: 'videos', user: process.env.PGUSER || 'video_app', password: process.env.PGPASSWORD, max: 5, connectionTimeoutMillis: 5000 });
// Idle connections can fail during a database restart; pg removes these clients.
db.on('error', error => console.error('Database idle connection error:', error.message));
export async function initialize() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(725010)');
    await client.query(`CREATE TABLE IF NOT EXISTS videos (
    id uuid PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'QUEUED'
      CHECK (status IN ('QUEUED','PROCESSING','READY','FAILED')),
    created_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
    token uuid, lease_until timestamptz, outputs jsonb NOT NULL DEFAULT '[]', error text
    )`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function claim() {
  await db.query(`UPDATE videos SET status='FAILED', error='Processing retry limit reached', token=NULL, lease_until=NULL
    WHERE status='PROCESSING' AND lease_until < now() AND attempts>=3`);
  const result = await db.query(`WITH next AS (
    SELECT id FROM videos WHERE attempts<3 AND (status='QUEUED' OR (status='PROCESSING' AND lease_until<now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE videos v SET status='PROCESSING', attempts=attempts+1, token=$1,
    lease_until=now()+interval '60 seconds', error=NULL FROM next WHERE v.id=next.id RETURNING v.*`, [randomUUID()]);
  return result.rows[0];
}
export async function heartbeat(id: string, token: string) {
  return (await db.query(`UPDATE videos SET lease_until=now()+interval '60 seconds'
    WHERE id=$1 AND token=$2 AND status='PROCESSING' AND lease_until>now()`, [id, token])).rowCount === 1;
}
export async function complete(id: string, token: string, outputs: unknown[]) {
  return (await db.query(`UPDATE videos SET status='READY', outputs=$3, token=NULL, lease_until=NULL
    WHERE id=$1 AND token=$2 AND status='PROCESSING' AND lease_until>now()`, [id, token, JSON.stringify(outputs)])).rowCount === 1;
}
export async function fail(id: string, token: string) {
  await db.query(`UPDATE videos SET status=CASE WHEN attempts>=3 THEN 'FAILED' ELSE 'QUEUED' END,
    error='Video processing failed', token=NULL, lease_until=NULL WHERE id=$1 AND token=$2 AND status='PROCESSING'`, [id, token]);
}
