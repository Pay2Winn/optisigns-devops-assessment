variable "media_account_name" { type = string }
variable "media_resource_group" { type = string }
resource "kubernetes_persistent_volume_v1" "uploads" {
  metadata { name = "assessment-uploads" }
  spec {
    capacity                         = { storage = "100Gi" }
    access_modes                     = ["ReadWriteMany"]
    persistent_volume_reclaim_policy = "Retain"
    storage_class_name               = "assessment-nfs"
    mount_options                    = ["nconnect=4", "noresvport", "actimeo=30"]
    persistent_volume_source {
      csi {
        driver        = "file.csi.azure.com"
        volume_handle = "${var.media_resource_group}#${var.media_account_name}#uploads"
        volume_attributes = {
          resourceGroup    = var.media_resource_group
          storageAccount   = var.media_account_name
          shareName        = "uploads"
          protocol         = "nfs"
          mountPermissions = "0770"
        }
      }
    }
  }
}
resource "kubernetes_persistent_volume_claim_v1" "uploads" {
  metadata {
    name      = "uploads"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }
  spec {
    access_modes       = ["ReadWriteMany"]
    storage_class_name = "assessment-nfs"
    volume_name        = kubernetes_persistent_volume_v1.uploads.metadata[0].name
    resources { requests = { storage = "100Gi" } }
  }
  wait_until_bound = false
}
resource "kubernetes_storage_class_v1" "postgres" {
  metadata { name = "assessment-disk-retain" }
  storage_provisioner    = "disk.csi.azure.com"
  reclaim_policy         = "Retain"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  parameters             = { skuName = "StandardSSD_LRS" }
}
# PostgreSQL namespace/PVC/workload remain Argo-owned: request this class there.
