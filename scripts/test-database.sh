#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -m "$ROOT")"; fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
mkdir -p "$ROOT/docs/evidence"
exec > >(tee "$ROOT/docs/evidence/database-smoke-test.txt") 2>&1
set -x
date -u
"${K[@]}" exec deployment/postgres -- psql -U postgres -d videos -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS storage_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO storage_probe VALUES (1, 'assessment-persistence') ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;"
before="$("${K[@]}" get pods -l app=postgres -o jsonpath='{.items[0].metadata.uid}')"
"${K[@]}" rollout restart deployment/postgres
"${K[@]}" rollout status deployment/postgres --timeout=180s
after="$("${K[@]}" get pods -l app=postgres -o jsonpath='{.items[0].metadata.uid}')"
test "$before" != "$after"
value="$("${K[@]}" exec deployment/postgres -- psql -U postgres -d videos -At -v ON_ERROR_STOP=1 -c 'SELECT value FROM storage_probe WHERE id = 1;')"
test "$value" = assessment-persistence
for app in backend worker; do
  if [[ -n "$("${K[@]}" get deployment "$app" --ignore-not-found -o name)" ]]; then
    "${K[@]}" rollout status deployment/"$app" --timeout=180s
    "${K[@]}" wait --for=condition=Ready pod -l "app=$app" --timeout=180s
  fi
done
"${K[@]}" get pods,pvc
printf 'PASS: PostgreSQL pod replaced; persisted row unchanged; deployed application pods recovered.\n'
