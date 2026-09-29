#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT="$(cygpath -m "$ROOT")"
fi
K=(kubectl --kubeconfig "$ROOT/.local/kubeconfig" --context kind-optisigns-assessment -n optisigns-assessment)
mkdir -p "$ROOT/evidence"
exec > >(tee "$ROOT/evidence/nfs-smoke-test.txt") 2>&1
set -x
date -u
"${K[@]}" wait --for=condition=Ready pod/nfs-writer pod/nfs-reader --timeout=120s
"${K[@]}" exec nfs-writer -- sh -c 'printf "assessment-nfs-test\n" > /uploads/probe.txt'
"${K[@]}" exec nfs-reader -- cat /uploads/probe.txt
before="$("${K[@]}" exec nfs-reader -- sha256sum /uploads/probe.txt)"
"${K[@]}" exec nfs-reader -- sh -c 'mount | grep " /uploads type nfs4 "'
old_uid="$("${K[@]}" get pod nfs-writer -o jsonpath='{.metadata.uid}')"
"${K[@]}" delete pod nfs-writer --wait=true --timeout=60s
"${K[@]}" apply -f "$ROOT/deploy/storage-test.yaml"
"${K[@]}" wait --for=condition=Ready pod/nfs-writer --timeout=120s
new_uid="$("${K[@]}" get pod nfs-writer -o jsonpath='{.metadata.uid}')"
after="$("${K[@]}" exec nfs-writer -- sha256sum /uploads/probe.txt)"
test "$old_uid" != "$new_uid"
test "$before" = "$after"
"${K[@]}" get pods,pvc
printf 'PASS: actual NFSv4 mount, cross-pod read, replacement pod UID, unchanged SHA256.\n'
