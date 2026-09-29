# Local video processing assessment

React + NestJS GraphQL + FFmpeg on local Kubernetes. MP4 originals and generated outputs are shared through real NFSv4.1 mounts. PostgreSQL stores metadata and a durable leased work queue.

The core solution runs locally without Azure or another paid cloud service. Follow the numbered steps in order. Commands below use **Git Bash on Windows or Bash on Linux**, not PowerShell.

## 1. Prerequisites

Install and start the following before deploying:

- [Docker](https://docs.docker.com/get-started/get-docker/) with Linux containers. On Windows, use Docker Desktop with its WSL2 backend; Ubuntu Docker integration is not required for the tested Git Bash route.
- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/), [kubectl](https://kubernetes.io/docs/tasks/tools/), Git, Bash and OpenSSL, available on your terminal's PATH.
- [Node.js 22+](https://nodejs.org/) for host-side test scripts. Application dependencies and FFmpeg are installed inside Docker images, not on your host.
- Approximately 8 GiB available to Docker and 20–30 GB free disk recommended. The tested Windows host reported about 7.4 GiB Docker memory.
- Internet access for package/container downloads and an unused local port 8080.

Open a new terminal after installing tools, then check:

```bash
git --version
docker info
kind version
kubectl version --client
openssl version
node --version
```

Docker must report a running Linux engine. The storage deployment loads Linux NFS modules through the kind node; the Docker host kernel must support them. A platform without these modules needs a different NFS implementation, not a direct hostPath substitute.

## 2. Clone the repository

```bash
git clone https://github.com/Pay2Winn/optisigns-devops-assessment.git
cd optisigns-devops-assessment
```

If the repository is private, authenticate with a GitHub account that has access. Run all remaining commands from this directory. Do not put access tokens in commands or files committed to Git.

## 3. Build and deploy

```bash
bash scripts/deploy.sh
```

The script creates the named kind cluster `optisigns-assessment`, deploys shared storage and PostgreSQL, builds and loads application images, then deploys the backend, worker and frontend. No separate host-side `npm install` is required. The first run takes longer because it downloads images and dependencies.

Deployment uses `.local/kubeconfig` and the explicit context `kind-optisigns-assessment`; it does not select or modify an existing cloud cluster. Generated database credentials remain under ignored `.local/`. Do not share this directory.

Set up a shell command array for the checks below. Repeat this block if you open a new terminal:

```bash
export MSYS_NO_PATHCONV=1
ROOT="$(pwd)"
if command -v cygpath >/dev/null; then ROOT="$(cygpath -m "$ROOT")"; fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
"${K[@]}" get deployments,pods,pvc
```

Expected deployment readiness: backend **2/2**, frontend **2/2**, worker **1/1**, PostgreSQL **1/1**, NFS server **1/1**. Both persistent volume claims should be `Bound`.

## 4. Create and verify a short 4K sample

Run this before failover tests: they require a successfully processed video. The test generates a two-second 3840×2160 MP4 inside a backend container, uploads it through GraphQL and waits for processing.

```bash
"${K[@]}" wait --for=condition=Ready pod -l app=backend --timeout=180s
POD="$("${K[@]}" get pods -l app=backend -o jsonpath='{.items[0].metadata.name}')"
"${K[@]}" exec -i "$POD" -- sh -c 'cat > /tmp/test-video.mjs' < scripts/test-video.mjs
"${K[@]}" exec "$POD" -- node /tmp/test-video.mjs

# Copy the generated sample to the host for browser and worker-recovery tests.
"${K[@]}" cp "${POD}:/tmp/assessment-4k.mp4" "$ROOT/.local/browser-sample.mp4"
```

Use the same pod for copying and executing the script because `/tmp` is container-local. Stop and investigate if the test fails; do not continue as though the sample is ready.

Expected output includes `PASS invalid MP4 rejected`, five output checks, `PASS HTTP Range` and `PASS video end-to-end` with status `READY`. FFprobe inspects every output and checks rendition dimension bounds/even dimensions; the HTTP Range check expects status 206 and exactly 100 requested bytes.

| Output | Expected dimensions for this sample |
|---|---|
| 2K (QHD) | 2560×1440 |
| 1080p | 1920×1080 |
| 720p | 1280×720 |
| 480p | 852×480 |
| JPEG thumbnail | 480×270 |

The assessment does not define 2K; this project chooses QHD rather than DCI 2048×1080. Aspect ratio and even dimensions are preserved. Small inputs may be upscaled; portrait inputs fit within each bounding box.

## 5. Upload and inspect the frontend

1. Open **http://localhost:8080**. The automated sample should already appear as `READY`.
2. Select `.local/browser-sample.mp4` using the file chooser and click **Upload & process**. You may also use your own short MP4.
3. Confirm the upload-success message, then wait for `READY`. Status is polled every three seconds; short videos may transition too quickly to observe every intermediate state.
4. Play the original, open the thumbnail and access all four rendition links.
5. If a job reports `FAILED`, inspect worker logs using the troubleshooting commands below.

Admission limits: 512 MiB/file, one file/request, two simultaneous multipart requests per backend, ten-minute duration and 4096 pixels per side. Uploads are streamed with temporary disk buffering and are not resumable. No GPU is required.

## 6. Run persistence and failover tests

Wait until all videos are `READY` or `FAILED`, then run the following **sequentially**, without concurrent browser uploads:

```bash
bash scripts/test-storage.sh
bash scripts/test-database.sh
node scripts/test-boundaries.mjs
node scripts/test-failover.mjs
node scripts/test-worker-recovery.mjs
```

| Test | What it does |
|---|---|
| Storage | Verifies a real NFSv4.1 mount, shared reads and unchanged file checksum after replacing a storage-test pod. |
| Database | Restarts PostgreSQL, checks the persisted test row and waits for deployed application pods to recover. Temporary database unavailability is expected. |
| Upload boundaries | Checks invalid IDs, required preflight header, oversized declared body, interrupted upload and inaccessible unpublished media. It does not transmit a full oversized file to test streamed size enforcement. |
| Failover | Replaces backend/frontend pods, samples requests, checks original/output checksums, rolls out a configuration revision and undoes it. |
| Worker recovery | Uploads `.local/browser-sample.mp4`, abruptly stops the worker container through the node runtime and verifies retry to `READY` with all five output URLs accessible. |

The rollback test restores a pod-template environment-variable revision; it verifies actual replacement and configuration restoration, not different application code. These are finite observations, not a zero-downtime guarantee.

Most test scripts write their results under [evidence/](evidence/); the video test prints to the terminal. Re-running tests can replace recorded evidence and appear as Git changes. Additional queue ownership/retry testing is described in [failover-test.md](failover-test.md).

## 7. Troubleshooting and redeployment

Using the `K` array from step 3:

```bash
"${K[@]}" get pods,pvc
"${K[@]}" get events --sort-by=.metadata.creationTimestamp
"${K[@]}" logs deployment/backend --tail=100
"${K[@]}" logs deployment/worker --tail=100
"${K[@]}" logs deployment/nfs-server --tail=100
```

- **Docker connection error:** start Docker Desktop and verify Linux containers with `docker info`.
- **Missing tool:** install it or fix PATH, then open a new Git Bash terminal.
- **Port 8080 already in use:** stop the conflicting process before cluster creation.
- **NFS mount failure:** inspect events and server logs; verify host kernel NFS support. Do not replace NFS with hostPath and claim the same test passed.
- **Upload/processing failure:** check the documented input limits and backend/worker logs.

To rebuild and redeploy after a source change:

```bash
bash scripts/deploy.sh
```

The original cluster was deleted with approval and a fresh cluster deployed on the same host; see [clean-deploy-retry.txt](evidence/clean-deploy-retry.txt). This reused installed tools, local credentials and cached images. It is not validation on a different clean machine. The final version also passed [repeat deployment](evidence/redeploy-test.txt).

## 8. Cleanup

**Warning: this deletes the named cluster and all its database/video data.** Export anything you need first.

```bash
bash scripts/cleanup.sh --delete-assessment-data
kind get clusters
```

After successful cleanup, `optisigns-assessment` should no longer appear. The script does not delete other clusters or run a global Docker prune.

Source, local credential files, evidence and cached Docker images remain. `.local/` is excluded from Git and must not be shared. Initial cluster deletion hung and required a separately approved Docker Desktop restart; the retry succeeded. Cleanup now drains NFS clients before stopping the server, but that full ordered path on a healthy populated cluster has not yet been demonstrated. Do not restart Docker without considering other local containers it would interrupt.

## Documentation and security boundary

- [Architecture](architecture.md): components, data flow, storage, leases and limitations.
- [Failover tests](failover-test.md): results, failures, evidence and repeat instructions.
- [Production notes](production-notes.md): scaling, security, observability, cost and cloud considerations.
- [AI usage log](ai-usage-log.md): generated work, decisions, mistakes and verification.
- [Recorded evidence](evidence/): actual test output, including retained failures.

This is a **local, unauthenticated demo bound to localhost**. Do not expose it publicly. One host, one Kubernetes node, one PostgreSQL instance and one NFS server do not provide machine-level high availability. Cloud deployment is optional and has not been performed.
