variable "name" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "subnet_id" { type = string }
resource "azurerm_storage_account" "media" {
  name                            = var.name
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_kind                    = "FileStorage"
  account_tier                    = "Premium"
  account_replication_type        = "LRS"
  https_traffic_only_enabled      = false # NFS 4.1 requires this; restrict access to the AKS subnet.
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  network_rules {
    default_action             = "Deny"
    bypass                     = ["None"]
    virtual_network_subnet_ids = [var.subnet_id]
  }
  lifecycle { prevent_destroy = true }
}
resource "azurerm_storage_share" "uploads" {
  name               = "uploads"
  storage_account_id = azurerm_storage_account.media.id
  quota              = 100
  enabled_protocol   = "NFS"
  lifecycle { prevent_destroy = true }
}
output "platform_inputs" {
  value = {
    storage_account = azurerm_storage_account.media.name
    resource_group  = var.resource_group_name
    share_name      = azurerm_storage_share.uploads.name
    quota_gib       = azurerm_storage_share.uploads.quota
  }
}
