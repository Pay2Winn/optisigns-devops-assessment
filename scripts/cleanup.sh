#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != --delete-assessment-data ]]; then
  printf 'Destructive: deletes ONLY kind cluster optisigns-assessment and all its videos/database data.\nRe-run with --delete-assessment-data to confirm. Local source and evidence are retained.\n' >&2
  exit 1
fi
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then ROOT="$(cygpath -m "$ROOT")"; fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
if "${K[@]}" get namespace optisigns-assessment --request-timeout=10s >/dev/null 2>&1; then
  # Drain NFS clients before stopping the server: hard mounts can otherwise hang
  # node removal when the kernel server and clients share the same Docker VM.
  for app in backend worker; do
    if "${K[@]}" get deployment "$app" --ignore-not-found -o name | grep -q .; then
      "${K[@]}" scale deployment/"$app" --replicas=0
      "${K[@]}" wait --for=delete pod -l "app=$app" --timeout=120s
    fi
  done
  "${K[@]}" delete pod nfs-reader nfs-writer --ignore-not-found --timeout=120s
  if "${K[@]}" get deployment nfs-server --ignore-not-found -o name | grep -q .; then
    "${K[@]}" scale deployment/nfs-server --replicas=0
    "${K[@]}" wait --for=delete pod -l app=nfs-server --timeout=120s
  fi
fi
kind delete cluster --name optisigns-assessment
