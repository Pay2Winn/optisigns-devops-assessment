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
function Session() {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function check() {
    setError('');
    try {
      const response = await fetch('/auth/session', { cache: 'no-store' });
      if (response.status === 401) { setState('login'); return; }
      if (!response.ok) throw new Error('Login service unavailable. Please retry.');
      const data = await response.json();
      setState(data.enabled ? 'authenticated' : 'local');
    } catch (e) { setError(e.message); setState('unavailable'); }
  }
  useEffect(() => { check(); }, []);
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = JSON.stringify({ username: fields.get('username'), password: fields.get('password') });
    form.elements.password.value = '';
    try {
      const response = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!response.ok) throw new Error(response.status === 401 ? 'Invalid username or password.' : response.status === 429 ? 'Too many attempts. Retry in one minute.' : 'Login unavailable. Please retry.');
      setState('authenticated');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/auth/logout', { method: 'POST' });
      if (!response.ok && response.status !== 401) throw new Error('Logout failed. Please retry.');
      setState('login');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  if (state === 'authenticated' || state === 'local') return <>
    {state === 'authenticated' && <header><button onClick={logout} disabled={busy}>Sign out</button>{error && <p role="alert">{error}</p>}</header>}
    <App onUnauthorized={() => setState('login')} authenticated={state === 'authenticated'}/>
  </>;
  return <main><h1>Assessment reviewer login</h1>
    {state === 'login' && <form onSubmit={login}>
      <label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required maxLength={100} disabled={busy}/>
      <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy}/>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>}
    {state === 'loading' && <p role="status">Checking session…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {state === 'unavailable' && <button onClick={check}>Retry</button>}
  </main>;
}
function App({ onUnauthorized, authenticated }) {
  const [videos, setVideos] = useState([]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    const response = await fetch('/graphql', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`{ videos { ${fields} } }`})});
    if (response.status === 401) { onUnauthorized(); return; }
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
      const response = await fetch('/graphql',{method:'POST',headers:{'Apollo-Require-Preflight':'true'},body:form});
      if (response.status === 401) { onUnauthorized(); return; }
      await readResponse(response);
      setMessage('Upload complete. Processing continues in the background.');
      await refresh();
    } catch(e) { setError(e.message); setMessage(''); }
    finally { setBusy(false); }
  }
  return <main>
    <header><p className="eyebrow">{authenticated ? 'KUBERNETES ASSESSMENT' : 'LOCAL KUBERNETES ASSESSMENT'}</p><h1>Video processing lab</h1><p>Upload an MP4. Follow its processing and inspect every output.</p></header>
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
createRoot(document.getElementById('root')).render(<Session/>);
