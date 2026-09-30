terraform {
  required_providers {
    helm = { source = "hashicorp/helm", version = "= 2.17.0" }
  }
}
resource "helm_release" "this" {
  name             = "argocd"
  namespace        = "argocd"
  create_namespace = true
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = "7.8.28"
  atomic           = true
  timeout          = 600
  values = [yamlencode({
    server     = { replicas = 1, service = { type = "ClusterIP" } }
    controller = { replicas = 1 }
    repoServer = { replicas = 1 }
    redis      = { enabled = true }
    "redis-ha" = { enabled = false }
    dex        = { enabled = false }
  })]
}
