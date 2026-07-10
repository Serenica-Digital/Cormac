# Cormac Preview Stack — experimental Terra adapter

This is a meeting spike, not current deployment truth. It proves the smallest
Juno-native packaging option while `deploy/charts/**` remains the canonical,
portable Kubernetes definition under ADR-0003.

The plugin is a Terra **namespaced Plugin / Application**, not a Kuiper
workload template. Installing it deploys the whole preview stack into the
selected Juno project namespace. It expects two Secrets to exist first:

- `ghcr-pull` — private GHCR image pull credentials.
- `cormac-secrets` — the staging runtime values derived from Infisical.

The plugin contains no secret values and exposes no ingress by default. The
prebuilt web image is configured for a port-forward demonstration.

Before adding this branch as a Terra Source, refresh the vendored chart
dependencies:

```sh
deploy/juno/prepare-terra-source.sh
```

Then add the repository branch as a Terra Source and install **Cormac Preview
Stack** into the target project. If the published image tag changes, update the
four `image.tag` entries in `values.yaml`, refresh, commit, and push the branch.

Do not merge this adapter to `dev` without deciding whether the evidence merits
amending ADR-0003.
