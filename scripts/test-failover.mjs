import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=['--kubeconfig',root+'.local/kubeconfig','--context','kind-optisigns-assessment','-n','optisigns-assessment'];
const log=[];
function record(s){console.log(s);log.push(s);writeFileSync(root+'evidence/failover-test.txt',log.join('\n')+'\n');}
function k(...a){return execFileSync('kubectl',[...args,...a],{encoding:'utf8',timeout:180000});}
async function video(){const r=await fetch('http://localhost:8080/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'{videos{id status originalUrl outputs{url}}}'})});const b=await r.json();assert(!b.errors);return b.data.videos.find(v=>v.status==='READY');}
async function hash(url){const r=await fetch('http://localhost:8080'+url);assert.equal(r.status,200);return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');}
async function sampleDuring(action){let stop=false,ok=0,failed=0;const loop=(async()=>{while(!stop){try{const r=await fetch('http://localhost:8080/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'{videos{id}}'}),signal:AbortSignal.timeout(3000)});const b=await r.json();if(r.ok&&!b.errors)ok++;else failed++;}catch{failed++;}await new Promise(r=>setTimeout(r,100));}})();await action();stop=true;await loop;return {ok,failed};}
function asyncK(...a){return new Promise((resolve,reject)=>{const p=spawn('kubectl',[...args,...a],{stdio:'pipe'});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',code=>code?reject(new Error(output)):resolve(output));});}
record(new Date().toISOString());
const original=await video();assert(original,'Need a READY video first');
const urls=[original.originalUrl,...original.outputs.map(o=>o.url)];
const before=await Promise.all(urls.map(hash));
for(const app of ['backend','frontend']){
  const pod=JSON.parse(k('get','pods','-l',`app=${app}`,'-o','json')).items[0];
  const result=await sampleDuring(async()=>{await asyncK('delete','pod',pod.metadata.name,'--wait=true','--timeout=60s');await asyncK('rollout','status',`deployment/${app}`,'--timeout=120s');});
  const current=JSON.parse(k('get','pods','-l',`app=${app}`,'-o','json')).items;
  assert(!current.some(p=>p.metadata.uid===pod.metadata.uid));
  record(`${app} pod replacement: ${JSON.stringify(result)}; old UID absent`);
}
assert.deepEqual(await Promise.all(urls.map(hash)),before);
record('PASS original and all processed output SHA256 unchanged after backend/frontend replacement');
const baseline=JSON.parse(k('get','deployment','backend','-o','json')).spec.template;
// A pod-template configuration revision exercises rolling replacement and undo
// on a fresh build without pretending identical image tags are different code.
const rollout=await sampleDuring(async()=>{await asyncK('set','env','deployment/backend',`ASSESSMENT_ROLLOUT_TEST=${Date.now()}`);await asyncK('rollout','status','deployment/backend','--timeout=120s');await asyncK('rollout','undo','deployment/backend');await asyncK('rollout','status','deployment/backend','--timeout=120s');});
const restored=JSON.parse(k('get','deployment','backend','-o','json')).spec.template;
assert.deepEqual(restored.spec.containers,baseline.spec.containers);
assert.deepEqual(await Promise.all(urls.map(hash)),before);
record(`PASS pod-template configuration rollout and rollback: ${JSON.stringify(rollout)}; baseline container configuration restored; all checksums unchanged`);
