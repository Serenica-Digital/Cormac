# Juno meeting spike: two stand-up paths

This folder is an experimental rehearsal aid. It does not replace the portable
deployment contract in `deploy/README.md` or amend ADR-0003.

Once the image-publishing thread finishes, run the read-only final check:

```sh
deploy/juno/verify-ready.sh
```

## Shared prerequisites

Both paths run the same published images and require the same two Secrets in
the Juno project namespace:

```sh
export NS=<juno-project-namespace>
GHCR_USERNAME=<user> GHCR_TOKEN=<short-lived-packages-read-token> \
  deploy/scripts/ghcr-pull-secret.sh
INFISICAL_ENV=staging deploy/scripts/secrets-from-infisical.sh
```

Neither command writes secret values to disk. Do not paste the resulting
values into an agent, Terra field, values file, or chat.

## Path A — direct portable Helm

This is the already-proven fallback:

```sh
helm upgrade --install cormac-control-plane deploy/charts/control-plane \
  -n "$NS" --set image.tag=6c81617
helm upgrade --install cormac-web deploy/charts/web \
  -n "$NS" --set image.tag=6c81617
helm upgrade --install cormac-hermes-authoring deploy/charts/hermes \
  -n "$NS" -f deploy/charts/hermes/values-authoring.yaml \
  --set image.tag=6c81617
helm upgrade --install cormac-hermes-ops deploy/charts/hermes \
  -n "$NS" -f deploy/charts/hermes/values-ops.yaml \
  --set image.tag=6c81617
```

## Path B — Terra namespaced application

Prepare and validate the one-plugin Terra Source:

```sh
deploy/juno/prepare-terra-source.sh
```

Commit and push the generated `plugins/cormac-preview/Chart.lock` and
`plugins/cormac-preview/charts/*.tgz` to the meeting branch. Add that branch as
a Terra Source, then install **Cormac Preview Stack** into the project.

This is deliberately a namespaced Plugin / Application, not a reusable Kuiper
workload template: Cormac is one long-running multi-service application stack,
not an on-demand desktop/notebook workload.

## Reach it without deciding ingress

The images are prepared for a port-forward-first proof:

```sh
kubectl -n "$NS" port-forward svc/cormac-control-plane 8080:8080
kubectl -n "$NS" port-forward svc/cormac-web 15174:5174
```

Open `http://localhost:15174`. Routing/ingress can be settled after the pods,
service DNS, staging Supabase, and both Hermes lanes are healthy.
