import assert from 'node:assert/strict';
import http from 'node:http';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const logs=[];
function log(s){logs.push(s);console.log(s);writeFileSync(fileURLToPath(new URL('../docs/evidence/boundaries-test.txt',import.meta.url)),logs.join('\n')+'\n');}
async function request(query,variables={}){return (await fetch('http://localhost:8080/graphql',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables})})).json();}
log(new Date().toISOString());
assert((await request('query($id:ID!){video(id:$id){id}}',{id:"not-a-uuid'"})).errors);log('PASS invalid video ID rejected');
const missingHeader=new FormData();missingHeader.set('operations','{}');
assert.equal((await fetch('http://localhost:8080/graphql',{method:'POST',body:missingHeader})).status,400);log('PASS multipart without required preflight header rejected');
const oversized=await new Promise((resolve,reject)=>{
  const r=http.request('http://localhost:8080/graphql',{method:'POST',headers:{'Content-Length':514*1024*1024,'Content-Type':'multipart/form-data; boundary=test','Apollo-Require-Preflight':'true'}},res=>{res.resume();resolve(res.statusCode);r.destroy();});
  r.on('error',reject);r.setTimeout(10000,()=>r.destroy(new Error('Timeout')));r.flushHeaders();
});assert.equal(oversized,413);log('PASS ingress rejects oversized Content-Length without sending a huge body (streamed size enforcement not tested here)');
const before=(await request('{videos{id}}')).data.videos.length;
const operations=JSON.stringify({query:'mutation($file:Upload!){uploadVideo(file:$file){id}}',variables:{file:null}});
await new Promise(resolve=>{
  const r=http.request('http://localhost:8080/graphql',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=interrupted','Apollo-Require-Preflight':'true'}},res=>res.resume());
  r.on('error',()=>resolve());
  r.write(`--interrupted\r\nContent-Disposition: form-data; name="operations"\r\n\r\n${operations}\r\n--interrupted\r\nContent-Disposition: form-data; name="map"\r\n\r\n{"0":["variables.file"]}\r\n--interrupted\r\nContent-Disposition: form-data; name="0"; filename="interrupted.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
  r.write(Buffer.alloc(1024));setTimeout(()=>{r.destroy();resolve();},500);
});
await new Promise(r=>setTimeout(r,1500));
assert.equal((await request('{videos{id}}')).data.videos.length,before);log('PASS interrupted multipart upload creates no video row (run without concurrent uploads)');
assert.equal((await fetch('http://localhost:8080/media/00000000-0000-0000-0000-000000000000/upload.tmp')).status,404);log('PASS unregistered temporary media path denied');
