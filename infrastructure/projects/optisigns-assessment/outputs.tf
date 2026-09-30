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
