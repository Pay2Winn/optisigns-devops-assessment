terraform {
  required_version = ">= 1.7, < 2.0"

  required_providers {
    helm       = { source = "hashicorp/helm", version = "= 2.17.0" }
    kubernetes = { source = "hashicorp/kubernetes", version = "= 2.36.0" }
  }
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

module "argocd" {
  source = "../../../modules/argocd"
}

resource "kubernetes_namespace_v1" "app" {
  metadata {
    name = "optisigns-assessment"
  }
}

resource "kubernetes_service_account_v1" "backend" {
  metadata {
    name      = "backend-keyvault"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
    annotations = {
      "azure.workload.identity/client-id" = var.backend_client_id
    }
  }

  automount_service_account_token = false
}

# Local Helm chart defers CRD discovery to apply, after the Azure addon/Argo CRDs exist.
resource "helm_release" "bootstrap" {
  name      = "assessment-bootstrap"
  namespace = kubernetes_namespace_v1.app.metadata[0].name
  chart     = "${path.module}/chart"
  atomic    = true
  timeout   = 300

  values = [yamlencode({
    clientId          = var.backend_client_id
    tenantId          = var.tenant_id
    vaultName         = var.vault_name
    enableApplication = var.enable_application
    repositoryUrl     = var.repository_url
    revision          = var.revision
  })]

  depends_on = [module.argocd, kubernetes_service_account_v1.backend]
}
