# Assessment GitOps

Argo CD watches `apps/assessment` on this branch. Image digests are maintained by the existing build workflow on `main`.

## Backend secrets

The backend uses Azure Key Vault through Azure Workload Identity. OpenID Connect (OIDC) establishes trust between the Kubernetes ServiceAccount and a user-assigned managed identity; OIDC does not transport application secrets.

The Azure provider for Secrets Store Container Storage Interface (CSI) retrieves three secrets and synchronizes them into the Kubernetes Secret `backend-keyvault-env`:

| Environment variable | Key Vault content |
|---|---|
| `PGPASSWORD` | Existing database application password |
| `AUTH_USERNAME` | Reviewer username |
| `AUTH_PASSWORD_HASH` | Existing salt:scrypt password hash, not plaintext |

The backend mounts the CSI volume and reads the synchronized Secret as environment variables. No Azure application SDK is required. Worker, frontend, PostgreSQL, image digests and persistent uploads remain unchanged. Existing Kubernetes Secrets are retained for rollback.

## Resource ownership

An authorized operator provisions ServiceAccount `backend-keyvault` and SecretProviderClass `backend-keyvault` once in `optisigns-assessment`. Their actual identity and vault configuration is kept outside Git. Argo CD manages the backend Deployment referencing these prerequisites; GitHub Actions does not deploy these resources or need cluster administrator credentials. GitHub Secrets are not automatically substituted by Argo CD and are not used for this manually provisioned configuration.

The cluster requires OIDC, Workload Identity and the Azure CSI provider with Secret synchronization enabled. The backend identity trusts the cluster issuer with subject `system:serviceaccount:optisigns-assessment:backend-keyvault` and audience `api://AzureADTokenExchange`. It has **Key Vault Secrets User** access to the vault and does not need cluster deployment permissions.

## Activation and operations

The ServiceAccount, SecretProviderClass and matching identity federation have been verified. End-to-end vault retrieval and backend authentication remain unverified until the updated Deployment is synchronized and its pods successfully mount the CSI volume. The synchronized Secret is created when a consuming pod mounts the volume, not when SecretProviderClass is created.

Kubernetes stores the synchronized Secret, so restrict Secret reads and pod creation. Environment-variable changes require a controlled backend restart. Changing Key Vault alone does not rotate PostgreSQL credentials; coordinate database and consumer updates.

Rollback restores the previous backend Secret references through Git and Argo CD, without deleting existing Secrets or persistent data.
