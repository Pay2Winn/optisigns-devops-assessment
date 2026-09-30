resource "kubernetes_storage_class_v1" "postgres" {
  metadata { name = "assessment-disk-retain" }
  storage_provisioner    = "disk.csi.azure.com"
  reclaim_policy         = "Retain"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  parameters             = { skuName = "StandardSSD_LRS" }
}
# PostgreSQL namespace/PVC/workload remain Argo-owned: request this class there.
