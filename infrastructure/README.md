# Azure infrastructure reference

This branch is a reviewable Terraform design, **not an export/import of the running assessment and not a verified deployment**. `main` remains the submission branch; `gitops` holds application manifests. No Azure resources were created by authoring this reference.

## Layout

```text
infrastructure/
├── bootstrap/                         # one-time Azure Blob remote-state bootstrap
├── modules/                           # reusable network, AKS, registry, identity and Argo CD modules
└── projects/
    └── optisigns-assessment/
        ├── envs/                      # non-secret .tfvars.example templates
        ├── backend.tf                 # Azure foundation remote-state backend
        ├── main.tf                    # Azure foundation resources
        ├── variables.tf
        ├── outputs.tf
        ├── tests/                     # mocked Azure foundation checks
        └── platform/                  # Kubernetes/Helm Terraform root
            ├── backend.tf
            ├── main.tf
            ├── variables.tf
            └── outputs.tf
```

The project root and `platform/` remain separate state roots. The project root creates the Azure resource group, network, Azure Kubernetes Service (AKS), Azure Container Registry (ACR), Key Vault and workload identity. Platform requires a kubeconfig for that new cluster, then installs Argo CD, the namespace, ServiceAccount, Key Vault bootstrap resources and a retained PostgreSQL StorageClass.

The project root has `backend.tf`, `main.tf`, `variables.tf` and `outputs.tf`; `platform/` has the same root files for Kubernetes and Helm resources. `envs/` provides templates only. Copy a template to an ignored `.tfvars` file and replace placeholders outside Git.

## Scope and ownership

| Area | Responsibility |
|---|---|
| `bootstrap` | Separate state Resource Group, Standard General-purpose v2 locally redundant storage account, private Blob container and operator data role |
| project root | Private virtual network/subnet; restricted public AKS management API; two Standard_D2s_v5 nodes; Basic ACR; Key Vault and backend workload identity |
| `platform` | Pinned non-high-availability Argo CD Helm installation, ClusterIP dashboard, assessment namespace and bootstrap chart |
| `modules` | Shared Terraform units invoked by the project roots |
| Argo CD | Application workloads only, after explicit activation and target-specific configuration |

Virtual network itself is not public. This budget reference uses public service endpoints (ACR, vault, state storage); containers are private and access is authenticated. Private endpoints, network isolation, advanced monitoring and highly available Argo CD are not included. Standard Load Balancer is intentional; “Basic budget” does not mean obsolete Basic networking SKUs.

**Application storage:** retain the project's self-hosted Network File System (NFS) server and existing application storage manifests. Terraform does not replace them with Azure Files. Blob Storage stores Terraform state only. NFS server, export and uploads PersistentVolume/PersistentVolumeClaim remain application-managed; this reference does not provision a second NFS service or media Storage Account.

`projects/optisigns-assessment/platform/storage.tf` provides only the `assessment-disk-retain` StandardSSD_LRS StorageClass for PostgreSQL. Its PersistentVolumeClaim/workload remain application-managed. Exclude this StorageClass from Argo's resource set if using the Terraform definition; never give both tools ownership. Disk allocation occurs when a consumer uses the class.

**Not included:** deployment of the existing NFS server, PostgreSQL workload/data bootstrap, application ingress/Transport Layer Security, container builds, secret values and private Git credentials. Adapt application storage bindings, image digests and origin to the target cluster before enabling Argo. The reference is Azure infrastructure, not a one-command application reproduction.

## Prerequisites

Terraform >=1.7,<2; Azure CLI, kubectl, kubelogin; Helm CLI for optional render checks. Provider/chart versions are pinned in source; lock files pin downloaded providers. Review supported versions/security updates before actual deployment.

Use a dedicated subscription/resource prefix. The operator needs resource creation and role-assignment permissions; Microsoft Entra administrator group membership is required for cluster access. Never use a backend workload identity to administer the cluster. All commands below are operator instructions, not actions performed during this reference's creation.

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

The azurerm backend uses **Azure Blob Lease** for automatic state locking. No separate lock service is required. Use `-lock-timeout=5m` for contention; never use `-lock=false` or force-unlock an active operation. Each key has its own lock, not a global lock across all roots.

## 2. Azure foundation

Copy `projects/optisigns-assessment/envs/foundation.southeastasia.tfvars.example` to an ignored file and supply `subscription_id`, `tenant_id`, globally unique `acr_name` and `vault_name`, nonempty `admin_group_ids`, and restricted `authorized_cidrs` (administrator/runner public Internet Protocol Classless Inter-Domain Routing ranges). The default node count is fixed at two; upgrade surge can temporarily add a third node. Region availability, Virtual Machine capacity and quota must be checked by the operator.

```sh
terraform -chdir=projects/optisigns-assessment init -backend-config=../../state.backend.hcl -backend-config=key=assessment-foundation.tfstate
terraform -chdir=projects/optisigns-assessment plan -lock-timeout=5m -var-file=envs/foundation.southeastasia.tfvars -out=foundation.tfplan
terraform -chdir=projects/optisigns-assessment apply foundation.tfplan
terraform -chdir=projects/optisigns-assessment output platform_inputs
```

No secret values are created. An authorized secret operator must populate `assessment-db-password`, `assessment-auth-username` and `assessment-auth-password-hash` outside Terraform. The latter is the application's salt:scrypt hash, not a plaintext password. Match the database password to PostgreSQL; changing Key Vault alone does not rotate database credentials. The backend identity can only read the dedicated vault. Grant secret-write access separately under your approval process.

## 3. Cluster platform

Obtain kubeconfig for the **new intended cluster** via Azure CLI, convert it using `kubelogin convert-kubeconfig -l azure` if needed, and verify the context. Do not use admin credentials. These instructions do not authorize applying against the current demo cluster.

Copy `projects/optisigns-assessment/envs/platform.tfvars.example` to an ignored file and supply `kubeconfig_path`, `kube_context`, and `backend_client_id`, `tenant_id`, `vault_name` from the preceding outputs. Authentication is read from external kubeconfig, not returned as a Terraform output.

```sh
terraform -chdir=projects/optisigns-assessment/platform init -backend-config=../../../state.backend.hcl -backend-config=key=assessment-platform.tfstate
terraform -chdir=projects/optisigns-assessment/platform plan -lock-timeout=5m -var-file=../envs/platform.tfvars -out=platform.tfplan
terraform -chdir=projects/optisigns-assessment/platform apply platform.tfplan
```

Wait for the AKS Key Vault addon and its SecretProviderClass CustomResourceDefinition before platform apply. Argo's CustomResourceDefinition is installed by its Helm release first; a small local Helm chart installs dependent custom resources afterwards, avoiding Kubernetes manifest plan-time discovery on an absent Argo CustomResourceDefinition. No duplicate Container Storage Interface Helm release is installed.

Application creation defaults to OFF. First provision application storage/database/secrets, build images into the new registry and adapt/review the target GitOps revision. Then set `enable_application=true` and rerun platform plan/apply. Application auto-sync is intentionally OFF for first-use safety; review and perform the first sync explicitly. Do not add Terraform-owned namespaces/ServiceAccounts/SecretProviderClasses/Argo installation to Argo's resource set. Public HTTPS Git access is the default; a private repository needs credentials supplied outside Terraform. Application metadata and chart values must never contain repository passwords.

## Verification and limits

Local checks: `terraform fmt -check -recursive`; for each root `terraform init -backend=false` then `terraform validate`. These download providers but do not provision Azure. See the mock test under `projects/optisigns-assessment/tests/`; it must use mocked providers, never live apply.

Actual deployment acceptance remains outstanding: Azure plan/apply, backend state migration/lock contention, quota and Role-Based Access Control propagation, addon/Argo readiness, application sync, upload/processing and cleanup. The separate AKS evidence on `main` describes the existing manually provisioned environment, **not this Terraform**.

- [Project guide](projects/optisigns-assessment/README.md)
- [Cost model](docs/cost-estimate.md)
- [Cleanup](docs/cleanup.md)
- [Local versus cloud](docs/local-vs-cloud.md)
- Backend reference: https://developer.hashicorp.com/terraform/language/backend/azurerm
- Provider reference: https://registry.terraform.io/providers/hashicorp/azurerm/4.50.0/docs
