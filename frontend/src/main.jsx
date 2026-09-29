import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
const fields = 'id name status createdAt originalUrl error outputs {label url width height}';
async function readResponse(response) {
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const body = await response.json();
  if (body.errors) throw new Error(body.errors[0].message);
  return body.data;
}
function App() {
  const [videos, setVideos] = useState([]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    const response = await fetch('/graphql', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`{ videos { ${fields} } }`})});
    const data = await readResponse(response);
    setVideos(data.videos);
  }
  useEffect(() => {
    let stopped = false;
    let timer;
    async function poll() {
      try { if (!stopped) await refresh(); } catch (e) { if (!stopped) setError(e.message); }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    setError(''); setMessage('Uploading…'); setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith('.mp4') || file.size>512*1024*1024) throw new Error('Select an MP4 file no larger than 512 MiB.');
      const form = new FormData();
      form.set('operations',JSON.stringify({query:'mutation($file:Upload!){uploadVideo(file:$file){id}}',variables:{file:null}}));
      form.set('map',JSON.stringify({'0':['variables.file']}));
      form.set('0',file);
      await readResponse(await fetch('/graphql',{method:'POST',headers:{'Apollo-Require-Preflight':'true'},body:form}));
      setMessage('Upload complete. Processing continues in the background.');
      await refresh();
    } catch(e) { setError(e.message); setMessage(''); }
    finally { setBusy(false); }
  }
  return <main>
    <header><p className="eyebrow">LOCAL KUBERNETES ASSESSMENT</p><h1>Video processing lab</h1><p>Upload an MP4. Follow its processing and inspect every output.</p></header>
    <section aria-labelledby="upload-title"><h2 id="upload-title">Upload a video</h2><p>MP4 up to 512 MiB, 10 minutes, and 4096 pixels per side. 4K input supported.</p>
      <form onSubmit={submit}><label htmlFor="video">Video file</label><input id="video" type="file" accept="video/mp4,.mp4" disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/><button disabled={!file||busy}>{busy?'Uploading…':'Upload & process'}</button></form>
      <p role="status">{message}</p>{error&&<p role="alert" className="error">{error}</p>}
    </section>
    <section aria-labelledby="videos-title"><h2 id="videos-title">Uploaded videos</h2>{!videos.length&&<p>No videos yet.</p>}
      <div className="videos">{videos.map(video=>{
        const thumbnail=video.outputs.find(o=>o.label==='thumbnail');
        return <article key={video.id}><div className="heading"><h3>{video.name}</h3><span className={`status ${video.status.toLowerCase()}`}>{video.status}</span></div>
          <p>{new Date(video.createdAt).toLocaleString()}</p>
          <video controls preload="metadata" poster={thumbnail?.url} src={video.originalUrl} aria-label={`Original video: ${video.name}`}/>
          {thumbnail&&<a href={thumbnail.url} target="_blank" rel="noreferrer">View thumbnail</a>}
          <nav aria-label={`Outputs for ${video.name}`}><a href={video.originalUrl} target="_blank" rel="noreferrer">Original</a>{video.outputs.filter(o=>o.label!=='thumbnail').map(o=><a key={o.label} href={o.url} target="_blank" rel="noreferrer">{o.label==='2k'?'2K (QHD)':o.label} · {o.width}×{o.height}</a>)}</nav>
          {video.error&&<p className="error">{video.error}</p>}
        </article>;
      })}</div>
    </section><footer>Local demonstration · Shared NFS storage · Sequential FFmpeg processing</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
