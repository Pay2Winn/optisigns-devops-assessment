import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const endpoint = 'http://backend:3000';
async function query(query, variables = {}) {
  const r = await fetch(`${endpoint}/graphql`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({query,variables}) });
  const data = await r.json();
  assert(!data.errors, JSON.stringify(data));
  return data.data;
}
async function upload(bytes, name) {
  const form = new FormData();
  form.set('operations', JSON.stringify({query:'mutation($file:Upload!){uploadVideo(file:$file){id status}}',variables:{file:null}}));
  form.set('map', JSON.stringify({'0':['variables.file']}));
  form.set('0', new Blob([bytes],{type:'video/mp4'}), name);
  const r = await fetch(`${endpoint}/graphql`, {method:'POST',headers:{'Apollo-Require-Preflight':'true'},body:form});
  return r.json();
}
const invalid = await upload(Buffer.from('not a video'), 'invalid.mp4');
assert(invalid.errors, 'Invalid MP4 must fail');
console.log('PASS invalid MP4 rejected');
execFileSync('ffmpeg',['-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=size=3840x2160:rate=12','-t','2','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','/tmp/assessment-4k.mp4'],{timeout:60000});
const uploaded = await upload(readFileSync('/tmp/assessment-4k.mp4'), 'assessment-4k.mp4');
assert(!uploaded.errors,JSON.stringify(uploaded));
const id = uploaded.data.uploadVideo.id;
console.log('Uploaded 3840x2160 MP4', id);
let video;
for(let i=0;i<180;i++) {
  video = (await query('query($id:ID!){video(id:$id){id status originalUrl outputs{label url width height} error}}',{id})).video;
  if(video.status==='READY'||video.status==='FAILED') break;
  await new Promise(r=>setTimeout(r,2000));
}
assert.equal(video.status,'READY',JSON.stringify(video));
assert.equal(video.outputs.length,5);
for(const output of video.outputs) {
  const file = '/uploads' + output.url.slice('/media'.length);
  const metadata = JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'}));
  const stream = metadata.streams.find(s=>s.codec_type==='video');
  assert(stream);
  if(output.label!=='thumbnail') {
    const dimensions = {'2k':[2560,1440],'1080p':[1920,1080],'720p':[1280,720],'480p':[854,480]};
    const [w,h]=dimensions[output.label];
    assert(stream.width<=w && stream.height<=h && stream.width%2===0 && stream.height%2===0);
  }
  console.log('PASS output',output.label,stream.width,stream.height,stream.codec_name);
}
const range = await fetch(endpoint+video.originalUrl,{headers:{Range:'bytes=0-99'}});
assert.equal(range.status,206);
assert.equal((await range.arrayBuffer()).byteLength,100);
console.log('PASS HTTP Range');
console.log('PASS video end-to-end',JSON.stringify(video));
