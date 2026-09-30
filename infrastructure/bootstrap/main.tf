terraform {
  required_version = ">= 1.7, < 2.0"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "= 4.50.0" }
  }
  # First apply uses local state. See README before migrating to Blob.
}
provider "azurerm" {
  features {}
  subscription_id     = var.subscription_id
  storage_use_azuread = true
}
variable "subscription_id" { type = string }
variable "location" { default = "southeastasia" }
variable "state_account_name" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.state_account_name))
    error_message = "Use a globally unique 3–24 character lowercase alphanumeric name."
  }
}
variable "operator_object_id" { type = string }
resource "azurerm_resource_group" "state" {
  name     = "rg-assessment-tfstate"
  location = var.location
}
resource "azurerm_storage_account" "state" {
  name                            = var.state_account_name
  resource_group_name             = azurerm_resource_group.state.name
  location                        = azurerm_resource_group.state.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
  blob_properties {
    versioning_enabled = true
    delete_retention_policy { days = 7 }
    container_delete_retention_policy { days = 7 }
  }
  lifecycle { prevent_destroy = true }
}
resource "azurerm_role_assignment" "state_operator" {
  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.operator_object_id
}
resource "azurerm_storage_container" "state" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
  depends_on            = [azurerm_role_assignment.state_operator]
  lifecycle { prevent_destroy = true }
}
output "backend" {
  value = {
    resource_group_name  = azurerm_resource_group.state.name
    storage_account_name = azurerm_storage_account.state.name
    container_name       = azurerm_storage_container.state.name
    use_azuread_auth     = true
  }
}
