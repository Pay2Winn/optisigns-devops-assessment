# AKS acceptance evidence — 2026-09-30

## Scope and provenance

This is a retrospective summary of observed command and browser-tool results from the 2026-09-30 assessment session, not an unedited terminal transcript or a newly executed test suite. Only results observed in that session are marked passed. Commands below describe the executed procedure; they are not a standalone replay script.

The required submission runs on local Kubernetes. These results cover the optional Azure Kubernetes Service (AKS) deployment and do not replace local evidence in this directory. Submission source/documentation is on `main`; Argo CD consumes workload configuration from `gitops`. The observed GitOps revision was `3ba1334e9ed37e64b87c586e9df7a890e94e409a`; no claim is made that this identifies every running application image.

Target: context `aks-devops-assessment`; application namespace `optisigns-assessment`; PostgreSQL namespace `assessment-data`. The intended Azure subscription/tenant was checked before the run. Credentials, cookies, identity identifiers and kubeconfig are deliberately omitted.

The operator approved disruptive tests and deletion of old test videos. Five old video records and their five media directories were removed before uploading the new sample. The shared volume's certificate directory and `lost+found` were preserved; no database schema or storage volume was deleted.

## Functional acceptance

Sample: `6864596-uhd_2160_4096_25fps.mp4`, downloaded by the operator from https://www.pexels.com/video/playing-catch-the-bait-with-a-cat-6864596/ . The binary is not included in Git.

- Browser login succeeded, followed by a real file-picker upload.
- Uploaded size: 105,197,844 bytes. Server-side `ffprobe` identified H.264, 2160 × 4096, 25 frames/second, duration 36.28 seconds.
- Video ID: `9ea86fd0-50b5-4c91-86da-d5f231f94436`.
- Observed states: `QUEUED`, `PROCESSING`, `READY`.
- SHA-256 of the uploaded original matched the local downloaded file.
- Browser fetches returned HTTP 200 for all six files. Blob-backed video elements started playback for the original and all four renditions; this is not a full-duration visual/audio inspection.
- A `Range: bytes=0-1023` request returned HTTP 206 with the expected Content-Range for all five MP4 files.
- The thumbnail decoded successfully. Reloading the page preserved the authenticated session and READY video.

| Asset | Observed dimensions | Bytes | Duration |
|---|---|---:|---:|
| Original | 2160 × 4096 | 105197844 | 36.28 s |
| 2K/QHD rendition | 758 × 1440 | 6493841 | 36.28 s |
| 1080p rendition | 570 × 1080 | 4110190 | 36.28 s |
| 720p rendition | 380 × 720 | 2154028 | 36.28 s |
| 480p rendition | 252 × 480 | 1173809 | 36.28 s |
| Thumbnail | 480 × 910 | 19546 | Not applicable |

Rendition dimensions above were observed in the UI/browser metadata, not independently re-probed for every output. This is a portrait sample. The project's documented interpretation of the assignment's unspecified “2K” is QHD for landscape input; portrait output is scaled proportionally rather than stretched to 2560 × 1440.

## Required workload failover cases

| Case | Executed procedure | Observed result | Limitation |
|---|---|---|---|
| Backend restart/failover | Select one `app=backend` Pod; normal `kubectl delete pod`; wait for deployment rollout | PASS: old UID absent; rollout succeeded; all six file hashes unchanged | No usable request-availability measurements |
| Frontend restart/failover | Select one `app=frontend` Pod; normal deletion; wait for rollout | PASS: old UID absent; rollout succeeded; all six file hashes unchanged | No usable request-availability measurements |
| Original survives backend restart | Compare original SHA-256 with pre-test baseline | PASS: unchanged | One sample, not storage/node failure |
| Processed files survive backend restart | Compare four renditions and thumbnail against baseline | PASS: all unchanged | Same scope |
| Processing recovers after worker replacement | Copy the new cat original into a new job directory, insert its queue row, wait for PROCESSING, normally delete worker Pod, wait for replacement and completion | PASS: replacement UID, attempt count 2, READY, five output metadata entries; later all five output URLs returned HTTP 200 with nonempty content | Job seeded internally, not a second browser upload; normal Pod termination, not forced process death |
| Rolling update/configuration restoration | Add temporary `ASSESSMENT_ROLLOUT_TEST` environment variable, wait for rollout, remove it, wait again, compare full Pod template to baseline | PASS: both rollouts completed; complete Pod template restored | Configuration change only; no application-image change and no `rollout undo` in this AKS run |

Worker recovery job: `11adbf42-ec4e-47ca-b8d0-ef7d07c8e52b`, display name `cat-worker-recovery.mp4`. The original cat upload was preserved. The recovery check returned:

```json
{"status":"READY","attempts":2,"outputs":5}
```

Representative executed operations (names selected from live inventory):

```sh
kubectl --context aks-devops-assessment -n optisigns-assessment delete pod <selected-backend-or-frontend-pod> --wait=true --timeout=90s
kubectl --context aks-devops-assessment -n optisigns-assessment rollout status deployment/<backend-or-frontend> --timeout=180s
kubectl --context aks-devops-assessment -n optisigns-assessment set env deployment/backend ASSESSMENT_ROLLOUT_TEST=<timestamp>
kubectl --context aks-devops-assessment -n optisigns-assessment rollout status deployment/backend --timeout=180s
kubectl --context aks-devops-assessment -n optisigns-assessment set env deployment/backend ASSESSMENT_ROLLOUT_TEST-
kubectl --context aks-devops-assessment -n optisigns-assessment rollout status deployment/backend --timeout=180s
```

These operations interrupt workloads. They are evidence of the procedure, not permission to execute it on another cluster. Do not run the local kind test scripts unchanged against AKS.

## Additional checks

| Check | Observed result |
|---|---|
| PostgreSQL Pod replacement | PASS: replacement UID, rollout succeeded, original video row remained READY with attempts=1; media hashes unchanged |
| Queue correctness | PASS: concurrent claim exclusion, expired-heartbeat rejection, stale completion/failure fencing, three-attempt retry bound |
| Worker restoration after queue test | PASS: scaled from 1 to 0 for isolation, test ran in backend using `scripts/test-queue.mjs`, finally restored to 1 and waited for readiness; test deleted its own rows |
| Invalid video ID | PASS: GraphQL errors returned |
| Multipart missing required preflight header | PASS: HTTP 400 |
| Invalid MP4 content | PASS: HTTP 200 GraphQL response contained errors; before/after video IDs unchanged |
| Unregistered temporary media URL | PASS: HTTP 404 for a nonexistent video's `upload.tmp`; does not prove every temporary-file access case |
| Oversized declared request | PASS: Content-Length 538968064 returned HTTP 413 without sending a large body; unauthenticated public request |
| Direct unauthenticated backend request | PASS: internal GraphQL request returned HTTP 401 |

## Original sample SHA-256 baseline

All six hashes were compared programmatically after each backend, frontend and PostgreSQL replacement and matched. Hashes were printed again after worker recovery, but that final print alone is not a separate automated comparison assertion.

| File | SHA-256 |
|---|---|
| original.mp4 | `aac3c55530783ce23e56ccd2cd56a6985d2cba20f736a4b5f28501c2697ba4ff` |
| 2k.mp4 | `ab38bf42634dd952c0d0b41c238c00a40af4beb1436377ed6382aa364f387ea7` |
| 1080p.mp4 | `6267373f32270bfbdb7b2f10498441a6285b647c6fec89e1795669e74678327f` |
| 720p.mp4 | `0fb52f976c31fe3e55febfe71bb20ad4cd4d2b44b9fa8f29b5a3b6fef2d597e9` |
| 480p.mp4 | `c535be12be97f72f5a737aafcc3ea5b6347a959dc7dc32b24b7c2decc52a1d64` |
| thumbnail.jpg | `5b6fdf9cb7cbee31b91c587e9edf55153348acfca0576e9f7f1a768627f36c79` |

## Final observed state

- Backend 2/2, frontend 2/2, worker 1/1, gateway 1/1, PostgreSQL 1/1 ready.
- Argo CD application `assessment`: Synced / Healthy.
- Both cat video jobs READY. Old synthetic videos removed with approval.
- Backend template restored; worker replica count restored. No application source/image changes made for these tests.

These are point-in-time observations, not a live status dashboard.

## Issues and limits

- Browser-based request sampling lost its in-page state. Reading results failed with `Cannot read properties of undefined (reading 'length')`. No counts, outage duration, or zero-downtime claim can be supported for this AKS run.
- A 120-second browser wait expired while the real clip was still PROCESSING; a subsequent wait observed READY. This was a test wait timeout, not an observed failed job.
- The first server-side probe failed because Git Bash converted `/uploads` into a Windows path. Retrying with `MSYS_NO_PATHCONV=1` succeeded; the failed probe was not counted as a pass.
- No forced worker kill, node/host loss, NFS server outage, storage/database replication, backup restoration, sustained concurrent uploads, interrupted-upload cleanup, or streamed oversized-body enforcement was demonstrated in this AKS run.
- Shared file access and survival of client Pod replacement were observed; the AKS storage protocol was not independently verified here. Local NFS evidence is separate.
- The local clean-machine deployment and full cleanup path were not rerun. AKS is optional and cannot establish the mandatory local reproducibility requirement.
- These results do not constitute a production security review, production high-availability guarantee, or proof that every assignment deliverable is complete.
