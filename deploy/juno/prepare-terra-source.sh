#!/usr/bin/env bash
# Vendor the canonical portable charts into the experimental Terra umbrella
# plugin and validate the result. Generated Chart.lock and charts/*.tgz belong
# to the meeting branch so Terra/ArgoCD can render without reaching outside the
# plugin directory.
set -euo pipefail

cd "$(dirname "$0")/../.."

helm dependency build --skip-refresh plugins/cormac-preview
helm lint plugins/cormac-preview
helm template cormac-preview plugins/cormac-preview > /dev/null

echo "Terra source ready: plugins/cormac-preview (no Secret manifests included)"
