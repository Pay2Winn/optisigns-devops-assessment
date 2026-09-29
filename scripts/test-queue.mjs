import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,initialize,claim,heartbeat,complete,fail} from '/app/dist/db.js';
// Run in a backend container with workers temporarily scaled to zero.
await initialize();
const ids=[];
async function insert(){const id=randomUUID();ids.push(id);await db.query('INSERT INTO videos(id,name) VALUES($1,$2)',[id,'queue-self-test']);return id;}
try{
  assert.equal(Number((await db.query("SELECT count(*) FROM videos WHERE status IN ('QUEUED','PROCESSING')")).rows[0].count),0,'Wait for active jobs before queue tests');
  const id=await insert();
  const claims=await Promise.all([claim(),claim()]);
  assert.equal(claims.filter(Boolean).length,1);
  const first=claims.find(Boolean);assert.equal(first.id,id);
  assert.equal(await heartbeat(id,first.token),true);
  assert.equal(await complete(id,randomUUID(),[]),false);
  await db.query("UPDATE videos SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
  assert.equal(await heartbeat(id,first.token),false);
  const second=await claim();assert.equal(second.id,id);assert.notEqual(second.token,first.token);
  assert.equal(await complete(id,first.token,[]),false);
  await fail(id,first.token);
  assert.equal((await db.query('SELECT token FROM videos WHERE id=$1',[id])).rows[0].token,second.token);
  await fail(id,second.token);
  const third=await claim();assert.equal(third.attempts,3);
  await fail(id,third.token);
  assert.equal((await db.query('SELECT status FROM videos WHERE id=$1',[id])).rows[0].status,'FAILED');
  assert.equal(await claim(),undefined);
  console.log('PASS concurrent claim exclusivity, heartbeat expiry, stale completion/failure fencing, bounded retries');
}finally{
  await db.query('DELETE FROM videos WHERE id=ANY($1::uuid[])',[ids]);
  await db.end();
}
