# Failover tests

The cases below describe tests against the dedicated local kind cluster, not Azure. Raw evidence is under [docs/evidence/](docs/evidence/). Additional local `aks-*` records, where present, are separate cloud runs and are not evidence for these local cases.

| Case | Observed result | Evidence |
|---|---|---|
| Shared NFS and replacement client pod | Real NFSv4.1 mount; replacement pod UID changed; SHA256 unchanged | nfs-smoke-test.txt |
| PostgreSQL pod replacement | Test row persisted | database-smoke-test.txt |
| 4K upload and processing | Invalid MP4 rejected; four H.264 outputs, JPEG and HTTP 206 Range passed | video-smoke-test.txt |
| Backend pod replacement | Request counts and failures recorded for the latest execution | failover-test.txt |
| Frontend pod replacement | Request counts and failures recorded for the latest execution | failover-test.txt |
| Original/processed preservation | Every recorded file SHA256 unchanged after replacements | failover-test.txt |
| Configuration rollout and rollback | Pod-template revision rolled out and undone; baseline container configuration and file checksums restored | failover-test.txt |
| Upload boundaries | Invalid ID, missing preflight header, oversized declared body, interrupted upload and unpublished file access | boundaries-test.txt |
| Full deploy script rerun | Existing cluster deployment completed successfully; not a clean-machine replay | redeploy-test.txt |
| Abrupt worker container stop | Lease reclaimed; attempt count 2; READY and all five output URLs HTTP 200 | worker-recovery.txt |
| Queue correctness | Concurrent claim exclusion, expired heartbeat rejection, stale-token fencing, three-attempt bound | queue-test.txt |

These are finite observations, not a zero-downtime guarantee. Requests were sampled roughly every 100ms plus request latency.

## Fresh-clone local acceptance

The [2026-09-30 fresh-clone acceptance summary](docs/evidence/local-fresh-clone-2026-09-30.md) records deployment from GitHub into a new local cluster, browser upload of a portrait 4K clip and all six required failover cases. `failover-test.txt` and `worker-recovery.txt` now contain this run's script output. This was not a clean-machine test.

## Optional AKS acceptance run

The [2026-09-30 AKS evidence summary](docs/evidence/aks-acceptance-2026-09-30.md) records the new portrait 4K sample, backend/frontend/PostgreSQL Pod replacement, unchanged media hashes, worker retry after normal Pod replacement, queue checks, configuration rollout/restoration and input validation. It is a retrospective summary of observed results, not a raw transcript. Request sampling failed, so no downtime measurement or zero-downtime claim is available. These cloud results do not replace the required local tests above.

## Failures found and corrected

The first NFS launch was OOMKilled during rpc.mountd startup. Bounding open descriptors to 1024 allowed startup under the same 256Mi memory limit.

The first application rollback test returned HTTP 502 while fetching a checksum. It was not counted as a pass. Adding backend preStop draining and minimum readiness duration allowed the subsequent full test to pass; original failure evidence is retained in `failover-first-attempt.txt`.

A first attempt to simulate worker death using a signal from inside its PID namespace did not cause a retry. The assertion correctly failed. The corrected test stops the specific worker container through the node runtime with zero grace. It checks restart/replacement and attempt count rather than trusting the stop command alone.

PostgreSQL replacement during fresh-cluster acceptance exposed application connection failures and a test that proceeded before application recovery. Added an idle pool error handler and explicit recovery waits. The dev4 rerun passed database persistence/recovery, 4K processing, upload boundaries, backend/frontend replacement, configuration rollback and abrupt worker retry. Queue assertions also passed on the recreated cluster.

## Repeating tests

Use commands in README. The current rollback script changes a pod-template environment variable and undoes it. This exercises Kubernetes rolling replacement and rollback without unavailable historical images. It does not claim to test different application code. Earlier real-image rollback was performed during development; latest evidence deliberately represents the reproducible configuration-revision test.

`test-queue.mjs` runs in a backend container with the worker temporarily at zero replicas and no active jobs. Restore the worker to one replica even if assertions fail. It deletes only its own generated test rows.
