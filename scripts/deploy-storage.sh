#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT="$(cygpath -m "$ROOT")"
fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment)
# Kernel modules live in the Docker Linux VM; repeat after a VM restart if needed.
docker exec optisigns-assessment-control-plane modprobe nfsd
docker exec optisigns-assessment-control-plane modprobe nfs
"${K[@]}" apply -f "$ROOT/deploy/namespace.yaml" -f "$ROOT/deploy/nfs.yaml"
"${K[@]}" -n optisigns-assessment rollout status deployment/nfs-server --timeout=180s
"${K[@]}" apply -f "$ROOT/deploy/storage-test.yaml"
"${K[@]}" -n optisigns-assessment wait --for=condition=Ready pod/nfs-writer pod/nfs-reader --timeout=120s
