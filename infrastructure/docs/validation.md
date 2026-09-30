# Local validation

Authoring session 2026-09-30, Terraform 1.14.6 on Windows.

- `terraform fmt -recursive`: applied formatting.
- `terraform init -backend=false` and `terraform validate`: passed for `bootstrap`, `projects/optisigns-assessment` and `projects/optisigns-assessment/platform` using pinned providers. No Azure backend was initialized.
- `terraform test` in `projects/optisigns-assessment`: 1 passed, 0 failed. Providers are mocked and AKS module outputs overridden. This is a narrow default-size/root wiring check, NOT validation of AKS provisioning, node capacity or Azure policy.
- First mock test failed on absent computed kubelet identity in mock data. Explicit AKS output overrides corrected the harness; no live Azure test was substituted.
- The local platform Helm chart at `projects/optisigns-assessment/platform/chart` rendered successfully with dummy identifiers and Application enabled.
- Pinned Argo chart archive URL returned HTTP 200. This does not establish security support or successful installation.

Not performed: Azure plan/apply/import, Helm install, remote state migration, Blob lease contention, numeric price verification or end-to-end application reproduction. No live Azure resource changes were made for this reference.
