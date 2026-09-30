terraform {
  required_version = ">= 1.7, < 2.0"
  backend "azurerm" {}
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "= 4.50.0" }
  }
}
provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
variable "subscription_id" { type = string }
variable "tenant_id" { type = string }
variable "prefix" { default = "assessment" }
variable "location" { default = "southeastasia" }
variable "acr_name" { type = string }
variable "vault_name" { type = string }
variable "vm_size" { default = "Standard_D2s_v5" }
variable "admin_group_ids" {
  type = list(string)
  validation {
    condition     = length(var.admin_group_ids) > 0
    error_message = "Provide an Entra administrator group."
  }
}
variable "authorized_cidrs" {
  type = list(string)
  validation {
    condition     = length(var.authorized_cidrs) > 0 && alltrue([for c in var.authorized_cidrs : can(cidrhost(c, 0)) && c != "0.0.0.0/0"])
    error_message = "Provide restricted administrator/runner CIDRs, not the entire internet."
  }
}
resource "azurerm_resource_group" "this" {
  name     = "rg-${var.prefix}"
  location = var.location
}
module "network" {
  source              = "../modules/network"
  name                = "vnet-${var.prefix}"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
}
module "registry" {
  source              = "../modules/registry"
  name                = var.acr_name
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
}
module "aks" {
  source              = "../modules/aks"
  name                = "aks-${var.prefix}"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  subnet_id           = module.network.subnet_id
  vm_size             = var.vm_size
  admin_group_ids     = var.admin_group_ids
  authorized_cidrs    = var.authorized_cidrs
}
resource "azurerm_role_assignment" "pull" {
  scope                            = module.registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = module.aks.kubelet_object_id
  skip_service_principal_aad_check = true
}
module "workload_identity" {
  source              = "../modules/workload-identity"
  name                = "id-${var.prefix}-backend"
  vault_name          = var.vault_name
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  tenant_id           = var.tenant_id
  issuer              = module.aks.issuer
}
output "platform_inputs" {
  value = {
    cluster_name      = module.aks.name
    resource_group    = azurerm_resource_group.this.name
    backend_client_id = module.workload_identity.client_id
    vault_name        = module.workload_identity.vault_name
    tenant_id         = var.tenant_id
    registry          = module.registry.login_server
  }
}
