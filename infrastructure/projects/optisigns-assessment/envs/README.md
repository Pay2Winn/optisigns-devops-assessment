# Environment templates

`foundation.southeastasia.tfvars.example` is a non-secret template for the foundation root. Copy it to an ignored `.tfvars` file, replace every placeholder, and pass it explicitly to `terraform plan` or `terraform apply`.

The platform root requires a kubeconfig path, context and values from the foundation output. Keep kubeconfig files, real IDs and backend configuration outside Git. `enable_application` remains `false` unless the target storage, secrets, image references and GitOps ownership have been reviewed.
