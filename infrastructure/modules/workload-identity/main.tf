variable "name" { type = string }
variable "vault_name" { type = string }
variable "location" { type = string }
variable "resource_group_name" { type = string }
variable "tenant_id" { type = string }
variable "issuer" { type = string }
resource "azurerm_key_vault" "this" {
  name                       = var.vault_name
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = true
}
resource "azurerm_user_assigned_identity" "backend" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
}
resource "azurerm_federated_identity_credential" "backend" {
  name                = "backend-keyvault"
  resource_group_name = var.resource_group_name
  parent_id           = azurerm_user_assigned_identity.backend.id
  issuer              = var.issuer
  audience            = ["api://AzureADTokenExchange"]
  subject             = "system:serviceaccount:optisigns-assessment:backend-keyvault"
}
resource "azurerm_role_assignment" "vault_reader" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.backend.principal_id
}
output "client_id" { value = azurerm_user_assigned_identity.backend.client_id }
output "vault_name" { value = azurerm_key_vault.this.name }
