# Local versus cloud

| Area | Required local solution (`main`) | Optional Terraform reference (`infrastructure`) |
|---|---|---|
| Cluster | kind on a local Docker host | AKS Free management tier, two paid VM nodes |
| Access | localhost:8080, local-only unauthenticated default | Restricted public management API; application HTTPS/authentication must be configured separately |
| Images | Local image builds/loading | Basic ACR, kubelet identity pull; image build/push outside Terraform |
| Media | Local NFS server and shared persistent volume | Existing self-hosted NFS server and application-managed volumes; no Azure Files; Blob is state only |
| Database | Local PostgreSQL persistent volume | Database workload/storage/bootstrap must be provided by GitOps/operator |
| Secrets | Local Kubernetes setup | Entra Workload Identity, dedicated vault, CSI secret synchronization; values supplied outside state |
| Deployment | Local shell scripts and manifests | Terraform Azure/platform, Argo CD for application workloads |
| State | No Terraform needed | Separate Blob keys and per-key lease locking |
| Resilience | Pod replacement; single-host/NFS/database limitations | Two nodes do not remove database/storage single points of failure; no claim of zone redundancy |
| Cost | Local host resources; no paid cloud required | Compute, disks, registry, network, storage and operations |
| Cleanup | Local cleanup script | Ordered platform/foundation teardown, retained state and data handled separately |

The existing AKS acceptance evidence on `main` is from a manually assembled environment. This Terraform configuration has not been applied or proven to reproduce that environment. The reviewer can run the mandatory local solution without using Azure or this branch. Public/private endpoints, identity authentication and storage protocols differ; do not copy local assumptions into cloud unchanged.
