# Snowflake Layering Mapped To Juno And Serenica

> **Status:** reference · **Last reviewed:** 2026-06-09

## Why This Matters

Direct relevance: 7/10. Snowflake is not the backend we are choosing for v1, and it is not a direct competitor to Juno. But Snowflake is useful as a mature reference model for separating storage, compute, governance, semantic models, containerized services, and agent orchestration. Mapping Snowflake's layers against Serenica and Juno helps clarify what each platform is and is not.

The short version: **Snowflake is a governed data cloud. Juno is a compute/workload orchestration platform. Serenica is the product/control plane we are building.** They overlap around containers, but their centers of gravity are very different.

## What Snowflake Is

Snowflake is a managed cloud data platform. Its standard architecture separates:

- **Database storage:** managed storage for structured, semi-structured, and unstructured data.
- **Compute:** independent virtual warehouses that process queries and run Snowpark code.
- **Cloud services:** coordination services for authentication, access control, metadata, query optimization, governance, compliance, and infrastructure management.

Snowflake is not something you install locally. Its docs explicitly describe it as a managed service where Snowflake manages infrastructure, updates, and storage organization.

Source: [Snowflake key concepts and architecture](https://docs.snowflake.com/en/user-guide/intro-key-concepts)

## Snowflake's Standard Layers

### 1. Storage Layer

Snowflake stores persistent data in managed cloud storage, reorganizing table data into its optimized internal format. It supports structured data, semi-structured data such as JSON, and unstructured data. Snowflake also supports different table types, including standard Snowflake tables, Iceberg tables, and hybrid tables.

Serenica equivalent:

- Supabase/Postgres is the v1 system of record.
- `business_records` is the mutable operational CRM record store.
- Contract-defined fields live in JSONB with generated hot columns.
- Supabase Storage may hold workbook artifacts later.

Juno equivalent:

- Juno may provide persistent volumes/shared storage for workloads.
- Juno is not the canonical business database unless we deliberately self-host Postgres/Supabase there later.

### 2. Compute Layer

Snowflake uses virtual warehouses as independent compute clusters. A warehouse processes SQL and can run code through Snowpark. Warehouses are separated so one compute workload does not consume another warehouse's resources.

Serenica equivalent:

- `apps/api` runs the control plane.
- `apps/worker` runs async jobs.
- Hermes runtime runs as a separate service behind the adapter.
- Model APIs do reasoning work outside our infrastructure unless/until local models are used.

Juno equivalent:

- Juno launches and manages the containers/workloads that run the API, worker, web app, Hermes runtime, and development workspaces.
- Juno may scale workloads and place them on cloud or local cluster resources.

### 3. Cloud Services / Governance Layer

Snowflake's cloud services layer coordinates sign-in, query dispatch, metadata, access control, governance, catalog, infrastructure management, and compliance.

Serenica equivalent:

- The control plane is our application governance layer.
- It owns auth verification, RBAC, tenant routing, contract publishing, proposal/approval, write policy, audit logging, connector policy, and usage.
- Supabase Auth brokers user sessions, but the control plane owns authorization.

Juno equivalent:

- Genesis/Hubble/Orion manage platform access, workload templates, project/workload launch, infrastructure, and platform-level security controls.
- Juno governance is infrastructure governance, not product governance.

This is the most important mapping: **Snowflake cloud services are closer to a combined data-platform control plane. Serenica has its own product control plane, and Juno has a platform control plane. Those must not be confused.**

## Snowflake's AI And Semantic Layers

Snowflake has added semantic and agent layers on top of the data platform:

- **Semantic Views:** schema-level metadata objects that define business entities, relationships, metrics, dimensions, and facts over physical data. Snowflake positions them as a way to bridge business language and database schemas.
- **Cortex Analyst:** natural-language-to-SQL over semantic models/views.
- **Cortex Search:** retrieval over unstructured sources.
- **Cortex Agents:** managed agent orchestration inside Snowflake's governed environment, using Cortex Analyst, Cortex Search, and tools.

Sources:

- [Semantic Views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- [Cortex Agents](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)

Serenica equivalent:

- The schema contract is our semantic layer.
- The Workbook Contract Agent proposes semantic contracts from workbooks.
- The CRM Operations Agent uses the contract to interpret, match, propose, and answer.
- Hermes is the runtime, but the control plane owns the semantic contract and write policy.

Juno equivalent:

- Juno does not provide the CRM semantic model.
- Juno may run the services that implement it.
- Juno may host a development assistant that reads ADRs/research/PRD and helps maintain the product memory.

## Snowpark Container Services Compared To Juno

Snowpark Container Services is Snowflake's managed container orchestration system inside Snowflake. It lets teams package applications as OCI images, upload them to Snowflake image repositories, and run them as long-running services or finite job services inside Snowflake-managed compute pools. Snowflake positions this as a way to run custom runtimes and specialized libraries close to Snowflake data.

Source: [Snowpark Container Services](https://docs.snowflake.com/en/developer-guide/snowpark-container-services/overview)

This is the closest Snowflake feature to Juno, but it is not the same thing.

| Dimension | Snowpark Container Services | Juno |
| --- | --- | --- |
| Primary home | Inside Snowflake | External orchestration platform |
| Center of gravity | Run containers near Snowflake data | Run developer/app workloads across cloud/local infrastructure |
| Data platform | Snowflake-native | Bring your own, such as Supabase/Postgres |
| Developer workspaces | Not the main product idea | Central to the developer-pilot story via Helios/workloads |
| App portability | OCI containers, but deployed into Snowflake | OCI/containerized services intended to stay portable |
| Governance | Snowflake RBAC, network policies, event tables, Snowflake account perimeter | Juno platform controls plus Serenica product controls |
| Fit for Serenica v1 | Too heavy and data-platform-specific | Strong candidate for running our app services |

The clean analogy:

- Snowflake SPCS: "Run custom containers inside the Snowflake data cloud."
- Juno: "Run custom containers and development workspaces as an orchestration platform."

## Mapping Snowflake's Five-Layer Ontology Example To Serenica/Juno

The Snowflake-Labs ontology repo adds a domain-specific five-layer stack on top of Snowflake:

| Snowflake ontology layer | What it means there | Serenica equivalent | Juno role |
| --- | --- | --- | --- |
| Layer 1: physical storage | `KG_NODE`, `KG_EDGE` | `business_records`, future relationship edges, audit/source tables | Runs services; does not own data |
| Layer 2: ontology metadata | classes, relationships, properties, permissions, inference rules | schema contracts, objects, fields, relationships, mappings, policies | Runs API/worker that manage this |
| Layer 3: generated views | abstract views generated from metadata | generated UI, validators, import/export schemas, agent context, maybe SQL views | Hosts generated app surfaces |
| Layer 4: semantic models | concrete, ontology, and governance models | agent context packs, query models, MCP schemas, evals | Hosts services that consume these |
| Layer 5: agent orchestration | Cortex Agent + graph analytics | Hermes runtime behind adapter | Runs the runtime container |

The mapping shows that Juno mostly lives below and beside the Serenica product layers. It runs the containers; it does not define the ontology/contract itself.

## What This Means For Our Architecture

### Serenica Is Closer To A Mini Semantic Data Product Than A CRUD App

The product is not just "CRM tables plus an agent." It has layers:

1. **Physical state:** Supabase/Postgres tables.
2. **Contract metadata:** workspace-specific semantic contract.
3. **Generated interfaces:** UI, validation, import/export, agent context.
4. **Proposal/write pipeline:** control-plane governance.
5. **Agent runtime:** Hermes behind an adapter.
6. **Orchestration:** Juno runs the containers and development environments.

This is the right way to explain the ambition without sounding like we are trying to rebuild Snowflake.

### Juno Is Not Snowflake

Juno does not replace Supabase/Postgres, Snowflake, or the control plane. It is closer to the infrastructure layer that launches and manages the services. In our architecture, Juno is valuable because it can run:

- web workload
- API workload
- worker workload
- Hermes runtime workload
- future MCP workload
- development workspace
- project assistant

But the canonical product state remains in Supabase/Postgres, and the product authority remains in the control plane.

### Snowflake Is Not A Near-Term Backend Candidate

Snowflake is excellent for governed analytics, large data estates, semantic modeling over enterprise data, and AI near enterprise data. It is not the obvious v1 backend for a small operational CRM agent because:

- It is managed cloud data infrastructure, not a lightweight app database.
- It is not installable locally.
- It introduces enterprise data-platform cost and complexity.
- Our write path is operational and transactional: proposals, approvals, record mutation, audit, SMS/web workflows.
- Supabase/Postgres is a better fit for the current product and small-client economics.

Snowflake could matter later if the product sells into larger data-heavy organizations or needs warehouse/lakehouse analytics. For now it is a reference architecture, not a platform choice.

## Practical Language To Use

When comparing Juno and Snowflake:

> Snowflake is a governed data cloud where storage, compute, governance, semantic models, and agents can all live near enterprise data. Juno is an orchestration platform for running containerized workloads and developer environments. In Serenica, Supabase/Postgres is the data layer, our control plane is the governance/write layer, Hermes is the agent runtime, and Juno is where the services run.

When explaining why the Snowflake ontology thread matters:

> The thread validates the same architectural instinct we already had: agents get more trustworthy when they are grounded in an explicit semantic layer instead of raw schemas and prompts. Our version of that layer is the workspace contract generated from client workbooks.

When avoiding overclaim:

> We are borrowing the layering pattern, not adopting Snowflake or building a full enterprise ontology platform.

## Open Questions For Serenica

- Should `schema_relationships` become a first-class edge model earlier than planned?
- Should the contract compiler generate materialized artifacts, or should artifacts be generated on demand?
- What is the first "semantic model" equivalent we actually need: UI schema, runtime context, import/export mapping, or MCP tool schema?
- Do we need a metadata/governance query surface so admins can ask what the agent is allowed to do?
- What Juno workload structure best preserves this layering: separate API/worker/runtime containers, or a bundled prototype first?

## Sources

- Reddit discussion: [Native Ontology on Snowflake](https://www.reddit.com/r/snowflake/comments/1tclwjs/native_ontology_on_snowflake/)
- Snowflake-Labs repo: [ontology-on-snowflake](https://github.com/Snowflake-Labs/ontology-on-snowflake)
- Snowflake docs: [Snowflake key concepts and architecture](https://docs.snowflake.com/en/user-guide/intro-key-concepts)
- Snowflake docs: [Snowpark Container Services](https://docs.snowflake.com/en/developer-guide/snowpark-container-services/overview)
- Snowflake docs: [Semantic Views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- Snowflake docs: [Cortex Agents](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)
