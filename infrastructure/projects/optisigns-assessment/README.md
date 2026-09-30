# OptiSigns assessment project

This project follows the project/environment layout used by the reference repository:

```text
optisigns-assessment/
├── envs/            # non-secret variable templates
├── backend.tf        # remote-state backend declaration
├── main.tf           # Azure foundation resources
├── variables.tf      # project inputs and validation
├── outputs.tf        # cluster/platform handoff values
├── tests/            # mocked Terraform checks
└── platform/         # separate Kubernetes and Helm Terraform root
```

The project root creates the Azure foundation. `platform/` remains a separate Terraform root because the Kubernetes and Helm providers require a kubeconfig from the newly created cluster. The roots use separate Azure Blob state keys and are run in this order:

1. `../../bootstrap/` creates the remote-state account.
2. This project root creates Azure resources and exposes platform identifiers.
3. `platform/` installs cluster bootstrap resources after an operator obtains a kubeconfig for the new cluster.

Copy an `envs/` template to an ignored `.tfvars` file and replace placeholders outside Git. Backend configuration is passed separately with the ignored `state.backend.hcl` described in [../../README.md](../../README.md).

Terraform does not apply this project automatically, and this reference does not replace the existing GitOps-managed assessment deployment.
