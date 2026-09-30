mock_provider "azurerm" {}
override_module {
  target = module.aks
  outputs = {
    name              = "aks-test"
    issuer            = "https://issuer.example.com/"
    kubelet_object_id = "00000000-0000-0000-0000-000000000004"
  }
}
variables {
  subscription_id  = "00000000-0000-0000-0000-000000000001"
  tenant_id        = "00000000-0000-0000-0000-000000000002"
  acr_name         = "assessmenttestregistry"
  vault_name       = "assessment-test-vault"
  admin_group_ids  = ["00000000-0000-0000-0000-000000000003"]
  authorized_cidrs = ["203.0.113.1/32"]
}
run "budget_and_identity" {
  command = plan
  assert {
    condition     = var.vm_size == "Standard_D2s_v5"
    error_message = "Unexpected budget node default."
  }
}
