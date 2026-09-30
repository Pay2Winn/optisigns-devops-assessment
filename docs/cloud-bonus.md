# Optional Azure deployment

`main` is the submission branch and contains the mandatory local solution. [gitops](https://github.com/Pay2Winn/optisigns-devops-assessment/tree/gitops) contains live application manifests. [infrastructure](https://github.com/Pay2Winn/optisigns-devops-assessment/tree/infrastructure) contains the separate Terraform reference and operations documentation.

## Observed deployment versus reference

The existing AKS deployment was assembled before the Terraform reference. Its [2026-09-30 acceptance evidence](evidence/aks-acceptance-2026-09-30.md) records a real portrait 4K upload, outputs, Pod replacement, persistent files, worker retry and input validation. It is not evidence of Terraform apply or clean-environment reproduction. Request sampling failed; no zero-downtime claim is made.

The reference defines Azure infrastructure, remote state and cluster platform prerequisites. Terraform owns infrastructure/platform; Argo CD owns application workloads. The AKS managed Key Vault CSI addon and workload federation allow backend secret reads without an Azure application SDK. Secret values and Git credentials must not be committed or placed into Terraform-managed secret values. Public endpoints and restricted management access are budget-oriented choices, not private-network isolation.

**Blob storage stores Terraform state only. NFS stores application media.** PostgreSQL uses a separate disk. Local deployment uses kind/NFS on one host; cloud changes identity, network access, registry, storage provisioning and cost. Two AKS nodes do not alone remove database/storage single points of failure.

## Reference documents

- [Terraform structure and operator instructions](https://github.com/Pay2Winn/optisigns-devops-assessment/blob/infrastructure/infrastructure/README.md)
- [Cost assumptions and pricing status](https://github.com/Pay2Winn/optisigns-devops-assessment/blob/infrastructure/infrastructure/docs/cost-estimate.md)
- [Cloud cleanup and data-retention warnings](https://github.com/Pay2Winn/optisigns-devops-assessment/blob/infrastructure/infrastructure/docs/cleanup.md)
- [Local/cloud differences](https://github.com/Pay2Winn/optisigns-devops-assessment/blob/infrastructure/infrastructure/docs/local-vs-cloud.md)
- [Reference validation and untested operations](https://github.com/Pay2Winn/optisigns-devops-assessment/blob/infrastructure/infrastructure/docs/validation.md)

Before using Terraform, review target-specific GitOps storage/image/origin settings and missing application prerequisites. Do not apply this new-resource configuration to the existing environment as an implicit import. Cloud cleanup must remove workload-created resources while cluster access remains available, preserve required data, and retain the state backend until all dependent states are retired. None of these instructions authorize deleting the live demo.
