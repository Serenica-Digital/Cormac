# CRM Agent (Cormac) + Juno pilot scope

Proposed Pilot Architecture

## 1. Dev workspace

A separate project where I write code and a dev-assistant agent helps me keep it organized. Every component is one of your official plugins, used as-is or lightly configured. The only custom part is my toolchain on the editor.

| Component | Juno plugin |
| --- | --- |
| Workstation (browser desktop, or editor) | `Workstations/helios`, or `web-ide` (code-server) |
| Dev assistant (Jarvis) | `hermes-agent` |
| Gitea | `gitea` |
| Local model (Qwen?) | `ollama` |

- **Note: The local model is a nice-to-have.** I'd run Qwen on `ollama` and keep Claude for the heavy thinking. A GPU slice for it would be great but isn't a blocker/requirement on day one.

### Open Questions: 
- What is the mechanism for getting the cli toolchain set up? (gh, pnpm, infisical, etc)
- How do the shared mount / durable volumes get organized, connect with the actual application (next)? 

## 2. Cormac app 

Here's what I have ready to bring to the onboarding: 

App is a pnpm monorepo, composed of a handful of normal containers, built from my own images by my CI on GitHub and pushed to GHCR as private images. My repo is a Terra Source. Each workload is a custom plugin (a Helm chart + terra.yaml) under plugins/<name>/ at the repo root. 

| Workload | Type | Network mode | Note |
| --- | --- | --- | --- |
| api | backend API — Node/Fastify | `ingress-noauth` | public; verifies its own webhooks; holds the secrets |
| web | web frontend — React/Vite | `ingress-auth` (or `ingress-noauth` for client previews) | the UI |
| worker | background worker — Node | `clusterip` | no inbound traffic |
| hermes-runtime | agent runtime — pinned upstream Hermes (Python) | `clusterip` | no public route; my own headless image, not the `hermes-agent` plugin |
| pane | web frontend — React/Vite | `ingress-noauth` + custom domain + cert-manager TLS | gated on a separate go/no-go; needs a stable domain |


- **Outside Juno:** (Workloads connect with these over the network.)
  - managed **Supabase** (the database, stays external, curious about a local dev workload though if a standard plugin exists)
  - **Anthropic** API
  - **Infisical** for secrets.

- **Secrets:** I keep my secret values in Infisical and have them land in the cluster as a normal Kubernetes Secret the containers read via secretKeyRef. Today I sync them from Infisical with the External Secrets Operator (it logs into Infisical with a read-only machine identity), and I can bring that whole setup. Is there a standard way you'd prefer secrets reach tenant containers on the pilot cluster?

### Open Questions:
- My images are private on GHCR, so the cluster needs an image-pull secret in the namespace, and it has to be present before the workloads sync. How would you like that seeded?


## General Diagram

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "fontSize": "18px",
  "primaryTextColor": "#111111",
  "lineColor": "#495057",
  "edgeLabelBackground": "#f1f3f5",
  "clusterBkg": "#ffffff",
  "clusterBorder": "#adb5bd",
  "titleColor": "#111111"
}}}%%
flowchart LR
  subgraph juno["Cormac"]
    direction TB
    subgraph appw["Application workloads — CI-built images from GitHub repo"]
      direction TB
      web["web\nReact UI\ningress-auth"]
      pane["pane\nExcel App Add-In\ningress-noauth + custom domain + TLS"]
      api["api — control plane\ningress-noauth\nverifies webhooks · serves /mcp"]
      worker["worker\njobs, no inbound\nclusterip"]
      hermes["hermes-runtime\npinned Hermes image, headless\nclusterip · no public route"]
    end
    subgraph devw["Development workloads — official Juno plugins"]
      direction TB
      ide["Workstation\nHelios desktop / web-ide"]
      jarvis["Jarvis dev assistant\nhermes-agent plugin\nmodel provider switchable"]
      gitea["Git sandbox\ngitea plugin\nmirrors to GitHub"]
      ollama["Local model\nollama plugin · Qwen"]
    end
  end

  subgraph managed["Managed services — outside Juno"]
    direction TB
    supa["Supabase\nPostgres + Auth\nsystem of record"]
    anthropic["Anthropic API\nmodel provider"]
    infisical["Infisical\nsecrets store"]
  end

  web --> api
  pane --> api
  api -->|"task + context"| hermes
  hermes -->|"MCP tool calls"| api
  ide --> gitea
  jarvis --> gitea
  jarvis -->|"local model"| ollama
  jarvis -->|"Claude"| anthropic

  api --> supa
  worker --> supa
  hermes --> anthropic
  api -.->|"secrets, synced via ESO"| infisical
  ide -.->|"secrets via Infisical CLI"| infisical

  classDef surface fill:#fff3cd,stroke:#b58900,color:#222;
  classDef trust fill:#d1e7dd,stroke:#146c43,color:#111;
  classDef runtime fill:#e7f1ff,stroke:#0d6efd,color:#111;
  classDef data fill:#f8d7da,stroke:#842029,color:#111;
  classDef third fill:#e2e3e5,stroke:#41464b,color:#111;
  classDef devtool fill:#ede7f6,stroke:#5e35b1,color:#111;

  class web,pane surface;
  class api,worker trust;
  class hermes runtime;
  class supa data;
  class anthropic,infisical third;
  class ide,jarvis,gitea,ollama devtool;

  style juno fill:#ffffff,stroke:#495057,stroke-width:2px,color:#111111;
  style appw fill:#f8f9fa,stroke:#adb5bd,color:#111111;
  style devw fill:#f8f9fa,stroke:#adb5bd,color:#111111;
  style managed fill:#ffffff,stroke:#adb5bd,color:#111111;
```