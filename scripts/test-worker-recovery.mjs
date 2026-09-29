import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=['--kubeconfig',root+'.local/kubeconfig','--context','kind-optisigns-assessment','-n','optisigns-assessment'];
const logs=[];
function log(s){console.log(s);logs.push(s);writeFileSync(root+'docs/evidence/worker-recovery.txt',logs.join('\n')+'\n');}
function k(...a){return execFileSync('kubectl',[...args,...a],{encoding:'utf8',timeout:180000});}
async function query(id){const r=await fetch('http://localhost:8080/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($id:ID!){video(id:$id){id status outputs{label url} error}}',variables:{id}})});const b=await r.json();assert(!b.errors,JSON.stringify(b));return b.data.video;}
log(new Date().toISOString());
const form=new FormData();form.set('operations',JSON.stringify({query:'mutation($file:Upload!){uploadVideo(file:$file){id}}',variables:{file:null}}));form.set('map',JSON.stringify({'0':['variables.file']}));form.set('0',new Blob([readFileSync(root+'.local/browser-sample.mp4')],{type:'video/mp4'}),'worker-recovery.mp4');
const result=await(await fetch('http://localhost:8080/graphql',{method:'POST',headers:{'Apollo-Require-Preflight':'true'},body:form})).json();assert(!result.errors,JSON.stringify(result));const id=result.data.uploadVideo.id;assert(/^[a-f0-9-]{36}$/.test(id));
let running=false;
for(let i=0;i<200;i++){const v=await query(id);if(v.status==='PROCESSING'){running=true;break;}assert.notEqual(v.status,'FAILED');await new Promise(r=>setTimeout(r,100));}
assert(running,'Worker did not enter PROCESSING');
const before=JSON.parse(k('get','pods','-l','app=worker','-o','json')).items[0];
log(`Job ${id} PROCESSING; stop worker container abruptly in pod ${before.metadata.name}`);
// PID 1 can ignore unhandled namespace-local signals; stop via the node runtime.
const containerId=before.status.containerStatuses[0].containerID.replace('containerd://','');
assert(/^[a-f0-9]{64}$/.test(containerId));
execFileSync('docker',['exec','optisigns-assessment-control-plane','crictl','stop','--timeout','0',containerId],{encoding:'utf8',timeout:30000});
let video;
for(let i=0;i<180;i++){video=await query(id);if(['READY','FAILED'].includes(video.status))break;await new Promise(r=>setTimeout(r,2000));}
assert.equal(video.status,'READY',JSON.stringify(video));assert.equal(video.outputs.length,5);
const attempts=Number(k('exec','deployment/postgres','--','psql','-U','postgres','-d','videos','-At','-c',`SELECT attempts FROM videos WHERE id='${id}';`).trim());assert(attempts>=2,`Expected retry, got ${attempts}`);
const pod=JSON.parse(k('get','pods','-l','app=worker','-o','json')).items[0];
assert(pod.status.containerStatuses[0].restartCount>=1||pod.metadata.uid!==before.metadata.uid);
for(const o of video.outputs){const response=await fetch('http://localhost:8080'+o.url);assert.equal(response.status,200);await response.arrayBuffer();}
log(`PASS abrupt worker failure recovered, attempts=${attempts}, status=READY, all five outputs HTTP 200`);
