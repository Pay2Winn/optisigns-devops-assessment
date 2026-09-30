variable "kubeconfig_path" {
  type = string
}

variable "kube_context" {
  type = string
}

variable "backend_client_id" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "vault_name" {
  type = string
}

variable "enable_application" {
  type    = bool
  default = false
}

variable "repository_url" {
  type    = string
  default = "https://github.com/Pay2Winn/optisigns-devops-assessment.git"
}

variable "revision" {
  type    = string
  default = "gitops"
}
