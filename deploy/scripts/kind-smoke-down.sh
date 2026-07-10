#!/usr/bin/env bash
# Tear down the kind smoke cluster.
set -euo pipefail
kind delete cluster --name "${CLUSTER:-cormac-smoke}"
