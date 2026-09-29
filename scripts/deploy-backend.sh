#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -m "$ROOT")"; fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
umask 077
if [[ ! -s "$ROOT/.local/app-password" ]]; then openssl rand -hex 32 > "$ROOT/.local/app-password"; fi
password="$(tr -d '\r\n' < "$ROOT/.local/app-password")"
[[ "$password" =~ ^[0-9a-f]{64}$ ]] || { printf 'Invalid local credential format\n' >&2; exit 1; }
# Only a generated, validated hexadecimal password is interpolated; never enable shell tracing here.
printf "SELECT 'CREATE ROLE video_app LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='video_app')\\gexec\nALTER ROLE video_app PASSWORD '%s';\nGRANT CONNECT ON DATABASE videos TO video_app;\nGRANT USAGE, CREATE ON SCHEMA public TO video_app;\n" "$password" | "${K[@]}" exec -i deployment/postgres -- psql -U postgres -d videos -v ON_ERROR_STOP=1
"${K[@]}" create secret generic video-app --from-literal="password=$password" --dry-run=client -o yaml | "${K[@]}" apply -f -
unset password
# Initialize schema once before multiple replicas start.
"${K[@]}" apply -f "$ROOT/deploy/backend.yaml"
"${K[@]}" rollout status deployment/backend --timeout=180s
"${K[@]}" rollout status deployment/worker --timeout=180s
