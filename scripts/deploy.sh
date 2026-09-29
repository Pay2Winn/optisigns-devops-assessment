#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -m "$ROOT")"; fi
for tool in docker kubectl kind openssl; do command -v "$tool" >/dev/null || { printf 'Missing tool: %s\n' "$tool" >&2; exit 1; }; done
mkdir -p "$ROOT/.local"
clusters="$(kind get clusters)"
if ! printf '%s\n' "$clusters" | grep -qx optisigns-assessment; then
  kind create cluster --name optisigns-assessment --config "$ROOT/deploy/kind.yaml" --kubeconfig "$ROOT/.local/kubeconfig" --wait 180s
elif [[ ! -s "$ROOT/.local/kubeconfig" ]]; then
  kind export kubeconfig --name optisigns-assessment --kubeconfig "$ROOT/.local/kubeconfig"
fi
bash "$ROOT/scripts/deploy-storage.sh"
bash "$ROOT/scripts/deploy-database.sh"
docker build -t optisigns-backend:dev4 "$ROOT/backend"
docker build -t optisigns-frontend:dev1 "$ROOT/frontend"
kind load docker-image optisigns-backend:dev4 optisigns-frontend:dev1 --name optisigns-assessment
bash "$ROOT/scripts/deploy-backend.sh"
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
"${K[@]}" apply -f "$ROOT/deploy/frontend.yaml"
"${K[@]}" rollout status deployment/frontend --timeout=180s
printf 'Open http://localhost:8080\n'
