variable "name" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "subnet_id" { type = string }
variable "vm_size" { type = string }
variable "admin_group_ids" { type = list(string) }
variable "authorized_cidrs" { type = list(string) }
resource "azurerm_user_assigned_identity" "cluster" {
  name                = "${var.name}-control-plane"
  location            = var.location
  resource_group_name = var.resource_group_name
}
resource "azurerm_role_assignment" "network" {
  scope                = var.subnet_id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_user_assigned_identity.cluster.principal_id
}
resource "azurerm_kubernetes_cluster" "this" {
  name                              = var.name
  location                          = var.location
  resource_group_name               = var.resource_group_name
  dns_prefix                        = var.name
  sku_tier                          = "Free"
  oidc_issuer_enabled               = true
  workload_identity_enabled         = true
  local_account_disabled            = true
  role_based_access_control_enabled = true
  azure_active_directory_role_based_access_control {
    azure_rbac_enabled     = true
    admin_group_object_ids = var.admin_group_ids
  }
  api_server_access_profile { authorized_ip_ranges = var.authorized_cidrs }
  default_node_pool {
    name            = "system"
    node_count      = 2
    vm_size         = var.vm_size
    vnet_subnet_id  = var.subnet_id
    os_disk_type    = "Managed"
    os_disk_size_gb = 64
    upgrade_settings { max_surge = "1" }
  }
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.cluster.id]
  }
  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    pod_cidr            = "10.244.0.0/16"
    service_cidr        = "10.41.0.0/16"
    dns_service_ip      = "10.41.0.10"
    load_balancer_sku   = "standard"
    outbound_type       = "loadBalancer"
  }
  key_vault_secrets_provider { secret_rotation_enabled = false }
  depends_on = [azurerm_role_assignment.network]
}
output "name" { value = azurerm_kubernetes_cluster.this.name }
output "issuer" { value = azurerm_kubernetes_cluster.this.oidc_issuer_url }
output "kubelet_object_id" { value = azurerm_kubernetes_cluster.this.kubelet_identity[0].object_id }
