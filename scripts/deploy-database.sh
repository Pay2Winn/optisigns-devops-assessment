#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -m "$ROOT")"; fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
# Do not rotate an existing database's credentials during a redeploy.
existing="$("${K[@]}" get secret postgres-admin --ignore-not-found -o name)"
if [[ -z "$existing" ]]; then
  mkdir -p "$ROOT/.local"
  umask 077
  if [[ ! -s "$ROOT/.local/postgres-password" ]]; then
    openssl rand -hex 32 > "$ROOT/.local/postgres-password"
  fi
  "${K[@]}" create secret generic postgres-admin --from-file="password=$ROOT/.local/postgres-password"
fi
"${K[@]}" apply -f "$ROOT/deploy/postgres.yaml"
"${K[@]}" rollout status deployment/postgres --timeout=180s
"${K[@]}" exec deployment/postgres -- psql -U postgres -d videos -v ON_ERROR_STOP=1 -c 'SELECT current_database(), version();'
