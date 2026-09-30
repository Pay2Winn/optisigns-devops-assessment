# Azure infrastructure reference

This branch is a reviewable Terraform design, **not an export/import of the running assessment and not a verified deployment**. `main` remains the submission branch; `gitops` holds application manifests. No Azure resources were created by authoring this reference.

## Scope and ownership

| Root/module | Responsibility |
|---|---|
| bootstrap | Separate state Resource Group, Standard GPv2 LRS account, private Blob container, operator data role |
| azure/network | Private VNet/subnet; public AKS API restricted to administrator CIDRs |
| azure/aks | Free control-plane tier, two Standard_D2s_v5 nodes, managed disks, Entra access, OIDC/Workload Identity, managed Key Vault CSI addon |
| azure/registry | Basic ACR, admin password disabled, kubelet AcrPull role |
| azure/workload-identity | Standard Key Vault, backend identity, federation, Secrets User role |
| platform/argocd | Pinned non-HA Helm installation, ClusterIP dashboard |
| platform/chart | SecretProviderClass and optional Argo Application; ServiceAccount is a Kubernetes Terraform resource |
| Argo CD | Application workloads only, after explicit activation and target-specific configuration |

VNet itself is not public. This budget reference uses public service endpoints (ACR, vault, state storage); containers are private and access is authenticated. Private endpoints, network isolation, advanced monitoring and highly available Argo CD are not included. Standard Load Balancer is intentional; “Basic budget” does not mean obsolete Basic networking SKUs.

**Not included:** application shared NFS storage, PostgreSQL disks/data/bootstrap, application ingress/TLS, container builds, secret values and private Git credentials. State Blob storage is NOT application NFS storage. Supply these prerequisites and adapt the GitOps manifests before enabling the Application. Existing `gitops` images, storage bindings, public origin and external names are environment-specific; pointing a fresh cluster at them does not produce a working clone automatically.

## Prerequisites

Terraform >=1.7,<2; Azure CLI, kubectl, kubelogin; Helm CLI for optional render checks. Provider/chart versions are pinned in source; lock files pin downloaded providers. Review supported versions/security updates before actual deployment.

Use a dedicated subscription/resource prefix. The operator needs resource creation and role-assignment permissions; Entra administrator group membership is required for cluster access. Never use a backend workload identity to administer the cluster. All commands below are operator instructions, not actions performed during this reference's creation.

## 1. Bootstrap remote state

From this directory, authenticate to the intended tenant/subscription and verify `az account show`. Provide variables through ignored `.tfvars` files or environment variables. Never put secret values in either committed variables or Terraform-managed secret resources.

```sh
terraform -chdir=bootstrap init
terraform -chdir=bootstrap plan -out=bootstrap.tfplan
terraform -chdir=bootstrap apply bootstrap.tfplan
```

Required bootstrap inputs: `subscription_id`, `state_account_name` (globally unique), `operator_object_id` (current principal object ID). Default region is Southeast Asia. The account disables shared keys; the container uses Entra authentication. Role propagation can delay container creation: wait and rerun after confirming permissions rather than opening anonymous access.

Create ignored `state.backend.hcl` with non-secret target identifiers:

```hcl
resource_group_name  = "rg-assessment-tfstate"
storage_account_name = "<unique-state-account>"
container_name       = "tfstate"
use_azuread_auth     = true
```

Set `ARM_SUBSCRIPTION_ID` and `ARM_TENANT_ID` for the intended backend identity; the Azure CLI login provides authentication. After bootstrap succeeds, add `bootstrap/backend.tf` containing `terraform { backend "azurerm" {} }`, then migrate:

```sh
terraform -chdir=bootstrap init -migrate-state -backend-config=../state.backend.hcl -backend-config=key=bootstrap.tfstate
```

Inspect the remote state successfully before securely removing local state backups. State contains sensitive configuration even when variables are marked sensitive. Versioning and seven-day soft delete help recovery but do not replace access control or backups.

The azurerm backend uses **Azure Blob Lease** for automatic state locking. No separate lock service is required. Use `-lock-timeout=5m` for contention; never use `-lock=false` or force-unlock an active operation. Each key has its own lock, not a global lock across all three roots.

## 2. Azure foundation

Supply `subscription_id`, `tenant_id`, globally unique `acr_name` and `vault_name`, nonempty `admin_group_ids`, and restricted `authorized_cidrs` (administrator/runner public IP CIDRs). Optional: `prefix`, `location`, `vm_size`. Default node count is fixed at two; upgrade surge can temporarily add a third node. Region availability, VM capacity and quota must be checked by the operator.

```sh
terraform -chdir=azure init -backend-config=../state.backend.hcl -backend-config=key=azure.tfstate
terraform -chdir=azure plan -lock-timeout=5m -out=azure.tfplan
terraform -chdir=azure apply azure.tfplan
terraform -chdir=azure output platform_inputs
```

No secret values are created. An authorized secret operator must populate `assessment-db-password`, `assessment-auth-username` and `assessment-auth-password-hash` outside Terraform. The latter is the application's salt:scrypt hash, not a plaintext password. Match the database password to PostgreSQL; changing Key Vault alone does not rotate database credentials. The backend identity can only read the dedicated vault. Grant secret-write access separately under your approval process.

## 3. Cluster platform

Obtain kubeconfig for the **new intended cluster** via Azure CLI, convert it using `kubelogin convert-kubeconfig -l azure` if needed, and verify the context. Do not use admin credentials. These instructions do not authorize applying against the current demo cluster.

Supply `kubeconfig_path`, `kube_context`, and `backend_client_id`, `tenant_id`, `vault_name` from the preceding outputs. Authentication is read from external kubeconfig, not returned as a Terraform output.

```sh
terraform -chdir=platform init -backend-config=../state.backend.hcl -backend-config=key=platform.tfstate
terraform -chdir=platform plan -lock-timeout=5m -out=platform.tfplan
terraform -chdir=platform apply platform.tfplan
```

Wait for the AKS Key Vault addon and its SecretProviderClass CRD before platform apply. Argo's CRD is installed by its Helm release first; a small local Helm chart installs dependent custom resources afterwards, avoiding Kubernetes manifest plan-time discovery on an absent Argo CRD. No duplicate CSI Helm release is installed.

Application creation defaults to OFF. First provision application storage/database/secrets, build images into the new registry and adapt/review the target GitOps revision. Then set `enable_application=true` and rerun platform plan/apply. Application auto-sync is intentionally OFF for first-use safety; review and perform the first sync explicitly. Do not add Terraform-owned namespaces/SA/SPC/Argo installation to Argo's resource set. Public HTTPS Git access is the default; a private repository needs credentials supplied outside Terraform. Application metadata and chart values must never contain repository passwords.

Access Argo CD through an authenticated local port-forward, not a public dashboard. Bootstrap administrator credentials are Kubernetes-generated; handle them privately and change them. Backend environment values are synchronized when consuming Pods mount CSI; secret value changes require a controlled restart.

## Verification and limits

Local checks: `terraform fmt -check -recursive`; for each root `terraform init -backend=false` then `terraform validate`. These download providers but do not provision Azure. See the mock test under `azure/tests/`; it must use mocked providers, never live apply.

Actual deployment acceptance remains outstanding: Azure plan/apply, backend state migration/lock contention, quota and RBAC propagation, addon/Argo readiness, application sync, upload/processing and cleanup. The separate AKS evidence on `main` describes the existing manually provisioned environment, **not this Terraform**.

- [Cost model](docs/cost-estimate.md)
- [Cleanup](docs/cleanup.md)
- [Local versus cloud](docs/local-vs-cloud.md)
- Backend reference: https://developer.hashicorp.com/terraform/language/backend/azurerm
- Provider reference: https://registry.terraform.io/providers/hashicorp/azurerm/4.50.0/docs
