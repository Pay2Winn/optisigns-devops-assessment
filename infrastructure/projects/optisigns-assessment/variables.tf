variable "subscription_id" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "prefix" {
  type    = string
  default = "assessment"
}

variable "location" {
  type    = string
  default = "southeastasia"
}

variable "acr_name" {
  type = string
}

variable "vault_name" {
  type = string
}

variable "vm_size" {
  type    = string
  default = "Standard_D2s_v5"
}

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
    condition     = length(var.authorized_cidrs) > 0 && alltrue([for cidr in var.authorized_cidrs : can(cidrhost(cidr, 0)) && cidr != "0.0.0.0/0"])
    error_message = "Provide restricted administrator or runner CIDRs, not the entire internet."
  }
}
