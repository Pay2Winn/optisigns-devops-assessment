variable "media_account_name" { type = string }
module "storage" {
  source              = "../modules/storage"
  name                = var.media_account_name
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  subnet_id           = module.network.subnet_id
}
output "media_storage" { value = module.storage.platform_inputs }
