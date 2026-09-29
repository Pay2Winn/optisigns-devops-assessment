# Local video processing assessment

React + NestJS GraphQL + FFmpeg on local Kubernetes. MP4 originals and generated outputs are shared through real NFSv4.1 mounts. PostgreSQL stores metadata and a leased work queue.

## Prerequisites

- Docker with Linux containers, kind, kubectl, Bash, OpenSSL. Windows: Docker Desktop with WSL2 backend and Git Bash works; Ubuntu Docker integration is not required for this route.
- Approximately 8 GiB available to Docker and 20–30 GB free disk recommended. Tested on Windows with Docker reporting about 7.4 GiB memory.
- Internet for package/container downloads. No cloud account or paid service required.
- Node.js 22+ for host-side `.mjs` test scripts, not needed for normal deployment.
- Port 8080 available. Open a new terminal after installing kind so its PATH entry is visible.

## Build and deploy

From this project directory in Git Bash or Linux Bash:

```bash
bash scripts/deploy.sh
```

This creates only the named kind cluster `optisigns-assessment`, with an isolated `.local/kubeconfig`; it does not select or modify an existing cloud cluster. The scripts load Linux NFS modules in the Docker VM through the kind node. This requires kernel support; a platform without these modules needs a different NFS implementation, not a direct hostPath substitute.

Open **http://localhost:8080**. Select an MP4, upload, and wait for READY. The page displays the original, thumbnail and rendition links. State is polled every three seconds.

Demo admission limits: 512 MiB/file, one file/request, two simultaneous multipart requests/backend, ten-minute duration and 4096 pixels per side. Uploads are streamed with temporary disk buffering; they are not resumable. Use a short 4K sample for a quick demonstration. No GPU required.

Outputs: QHD “2K” (2560×1440 bounding box), 1080p, 720p, 480p, JPEG thumbnail. The assessment does not define 2K; this project explicitly chooses QHD rather than DCI 2048×1080. Aspect ratio and even dimensions are preserved; 16:9 480p is 852×480. Small inputs may be upscaled. Portrait inputs fit inside each bounding box.

## Verify

```bash
bash scripts/test-storage.sh
bash scripts/test-database.sh
node scripts/test-failover.mjs
node scripts/test-worker-recovery.mjs
```

The database test restarts PostgreSQL; avoid concurrent uploads during that test. Worker recovery needs `.local/browser-sample.mp4`, a short MP4 input (copy your sample there). The current failover test changes a pod-template environment variable and undoes that revision, so it needs no historical image. It verifies actual pod replacement and configuration restoration, not a change in application code. Run `node scripts/test-boundaries.mjs` without concurrent uploads for additional admission/interrupt checks.

`test-video.mjs` runs inside a backend container, creates a two-second 3840×2160 sample with FFmpeg, rejects invalid MP4, uploads through GraphQL, probes every output and checks HTTP Range. Example from Git Bash:

```bash
export MSYS_NO_PATHCONV=1
ROOT="$(pwd)"
if command -v cygpath >/dev/null; then ROOT="$(cygpath -m "$ROOT")"; fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
"${K[@]}" wait --for=condition=Ready pod -l app=backend --timeout=180s
POD="$("${K[@]}" get pods -l app=backend -o jsonpath='{.items[0].metadata.name}')"
"${K[@]}" exec -i "$POD" -- sh -c 'cat > /tmp/test-video.mjs' < scripts/test-video.mjs
"${K[@]}" exec "$POD" -- node /tmp/test-video.mjs
```

Recorded output is in `evidence/`. The original cluster was deleted with user approval and `deploy.sh` successfully built a fresh cluster on the same host; see `clean-deploy-retry.txt`. This reuses installed tools, local credentials and cached images: it is a clean-cluster test, not validation on a different clean machine.

## Cleanup

Warning: the following deletes the named cluster and its database/video data:

```bash
bash scripts/cleanup.sh --delete-assessment-data
```

Source, local credential files, evidence and cached Docker images remain. No global Docker prune is used. `.local/` is excluded from Git and must not be shared. The original cluster was deleted and recreated with explicit approval. Initial deletion hung and required an approved Docker Desktop restart; the retry succeeded. Cleanup now drains NFS clients before stopping the server, but that full ordered path on a healthy populated cluster has not yet been demonstrated.

## Status and security boundary

This is a local, unauthenticated demo bound to localhost. Do not expose it publicly. See `architecture.md`, `production-notes.md`, `failover-test.md`, and `ai-usage-log.md`. The local assessment is submitted through GitHub; cloud deployment is optional and has not been performed.
