# Cloud cleanup

Destructive operator procedure; not executed or verified by this reference. Confirm tenant, subscription, backend keys and Kubernetes context. Export needed videos, database backups, registry images and secret recovery material first. Terraform state is not a data backup.

1. Stop application changes and reconciliation. This reference's Application has no auto-sync or cascade-delete finalizer. If these were enabled elsewhere, deliberately disable them before cleanup.
2. While the cluster is reachable, remove application resources through their owner. Deleting the Application alone does NOT remove workloads. Remove LoadBalancer Services/ingress and wait for their Azure resources to disappear; decide explicitly which PVCs/PVs, disks and NFS data to retain. A Retain policy can leave billable disks behind.
3. Review and destroy the `projects/optisigns-assessment/platform` root (Argo CD and bootstrap resources). It owns the application namespace; its deletion can remove workloads in that namespace. Do not proceed before step 2 and backups.
4. Review and destroy the `projects/optisigns-assessment` root. This deletes AKS, registry/images, vault and managed foundation resources. Key Vault soft-delete/purge protection prevents immediate permanent removal/reuse. Do not bypass purge protection.

```sh
terraform -chdir=projects/optisigns-assessment/platform plan -destroy -out=destroy.tfplan
terraform -chdir=projects/optisigns-assessment/platform apply destroy.tfplan
terraform -chdir=projects/optisigns-assessment plan -destroy -out=destroy.tfplan
terraform -chdir=projects/optisigns-assessment apply destroy.tfplan
```

Run from `infrastructure/`, with each root already initialized against its correct backend. A saved plan can contain sensitive data; do not commit it. Review each plan separately, not as an unattended combined command.

5. Inspect remaining node resource group resources, disks, public IPs, load balancers, storage, logs and resources provisioned outside Terraform. Retained application storage is outside this reference and requires its own approved cleanup.
6. Keep bootstrap state storage by default. `prevent_destroy` guards its account/container in configuration but is not a security boundary (removing resource definitions or deleting through Azure can bypass it). Deny unnecessary delete permissions and retain state backups. Decommission the state account only after all dependent states are retired, archived securely and a separate destructive change is approved; never delete the backend while using it for active operations.

Rollback is not generally possible after data/image/resource deletion. Restore from verified backups or redeploy where supported. Stopping nodes is not equivalent to removing all billable resources.
