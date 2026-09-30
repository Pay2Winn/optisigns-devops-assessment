# Video upload and processing platform

A React frontend and NestJS GraphQL backend for uploading MP4 videos, including 4K input. A separate FFmpeg worker generates 2K, 1080p, 720p, 480p versions and a JPEG thumbnail. Backend pods and workers share files through Network File System (NFS) storage; PostgreSQL stores metadata and processing jobs.

The required solution runs on local Kubernetes without paid cloud services. Azure deployment and delivery automation are optional additions.

## What to review

| Assessment requirement | Implementation or document |
|---|---|
| Upload, status, thumbnails and video links | [frontend/](frontend/) |
| GraphQL API, health checks and video processing | [backend/](backend/) |
| Local Kubernetes, shared storage, replicas and probes | [deploy/](deploy/) — root-level YAML manifests |
| Deployment, verification and cleanup utilities | [scripts/](scripts/) |
| Architecture, data flow and trade-offs | [architecture.md](architecture.md) |
| Failover cases, results and limitations | [failover-test.md](failover-test.md) |
| Production scaling, security, cost and operations | [production-notes.md](production-notes.md) |
| AI usage, corrections and verification | [ai-usage-log.md](ai-usage-log.md) |
| Detailed reproduction commands | [docs/local-guide.md](docs/local-guide.md) |
| Recorded test results | [docs/evidence/](docs/evidence/) |

```text
.
├── README.md
├── architecture.md
├── failover-test.md
├── production-notes.md
├── ai-usage-log.md
├── frontend/               # React source and Dockerfile
├── backend/                # NestJS, worker and Dockerfile
├── deploy/                 # Local manifests; optional aks/ and argocd/
├── scripts/                # Deployment, verification and cleanup
├── docs/                   # Detailed guide and supporting evidence
└── .github/workflows/      # Build and GitOps automation
```

## 1. Prerequisites

- Docker running Linux containers; Docker Desktop with WSL2 on Windows.
- kind, kubectl, Git, Bash and OpenSSL.
- Node.js 22+ for verification scripts.
- Approximately 8 GiB Docker memory, 20–30 GB free disk, internet access and free port 8080.
- A Docker host kernel supporting NFS. See [platform requirements](docs/local-guide.md#1-prerequisites).

Run commands in **Git Bash on Windows or Bash on Linux** from the repository root.

## 2. Build and deploy

```bash
git clone https://github.com/Pay2Winn/optisigns-devops-assessment.git
cd optisigns-devops-assessment
bash scripts/deploy.sh
```

The script creates the local kind cluster, deploys NFS and PostgreSQL, builds the application images and starts frontend, backend and worker workloads. It does not deploy to Azure. Run the same deployment command to rebuild after source changes.

## 3. Upload and verify a video

1. Open **http://localhost:8080**.
2. Select a short MP4 video, preferably 4K, and click **Upload & process**.
3. Confirm upload success and wait for status `READY`.
4. Play the original, view the thumbnail and open all four generated video versions.

For a 3840×2160 sample, expected outputs are 2560×1440 (2K/QHD), 1920×1080, 1280×720, 852×480 and a 480×270 thumbnail. QHD is this project's interpretation of the assignment's unspecified “2K”.

A repeatable sample generator and automated output checks are documented in [the video verification guide](docs/local-guide.md#4-create-and-verify-a-short-4k-sample). That step also creates the sample needed by the worker-recovery test.

## 4. Run failover tests

First complete the sample verification above. Wait for processing to finish and stop browser uploads. Run these commands one at a time; stop if any test fails:

```bash
bash scripts/test-storage.sh
bash scripts/test-database.sh
node scripts/test-boundaries.mjs
node scripts/test-failover.mjs
node scripts/test-worker-recovery.mjs
```

These tests check shared storage, database persistence, upload validation, backend/frontend replacement, file preservation, configuration rollout/rollback and worker retry. They intentionally interrupt local workloads. Results and limitations are in [failover-test.md](failover-test.md); detailed steps are in [the local guide](docs/local-guide.md#6-run-persistence-and-failover-tests).

## 5. Cleanup

**Warning: this deletes the local `optisigns-assessment` cluster and all video/database data inside it. Export anything needed first. It does not remove Azure resources.**

```bash
bash scripts/cleanup.sh --delete-assessment-data
```

Source, recorded evidence, local credential files and cached images remain. See [cleanup details and known limitations](docs/local-guide.md#8-cleanup).

## Optional: Azure and delivery automation

An additional deployment has run on Azure Kubernetes Service (AKS), using Azure Container Registry and Argo CD.

- GitHub Actions builds changed frontend/backend components independently and pushes commit-tagged images.
- The workflow updates immutable image digests on the separate `gitops` branch.
- Kustomize manages image references; one Argo CD Application automatically synchronizes changes to the cluster.
- Configuration: [GitHub Actions workflow](.github/workflows/ci.yml) and [Argo CD Application](deploy/argocd/application.yaml). Workload manifests are on `gitops` under `apps/assessment/`.

The assignment's explicit optional bonus is cloud deployment; this automation supports it. See [cloud bonus scope and evidence](docs/cloud-bonus.md), [AKS acceptance results](docs/evidence/aks-acceptance-2026-09-30.md), and the separate [infrastructure branch](https://github.com/Pay2Winn/optisigns-devops-assessment/tree/infrastructure) for Terraform, cost assumptions and cleanup instructions. `main` is the submission branch; cloud resources are not needed for the local instructions above.

## Limits and troubleshooting

The local configuration is unauthenticated and intended for localhost only. One node, one PostgreSQL instance and one NFS server do not provide machine-level high availability. Uploads are limited to 512 MiB and ten minutes.

Keep `.local/` private: it contains ignored credentials and local state. For troubleshooting, detailed commands and verification caveats, use [the local guide](docs/local-guide.md#7-troubleshooting-and-redeployment).
