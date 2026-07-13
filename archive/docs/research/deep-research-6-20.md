# **Cormac CRM Agent Infrastructure and Runtime Deployment Verification Report**

## **Executive Summary**

Note: this is an early phase research document, and should not be considered as binding on eventual project architecture. Its primary usefulness is as a reference document mapping potential connections and forms of integration between Juno, Cormac, and Hermes. 

The transition of the Cormac CRM Agent architecture to the Juno Innovations platform requires a rigorous translation of runtime invariants into Juno’s Kubernetes-native orchestration vocabulary. This evaluation validates the platform’s mechanical capabilities against the specific constraints of a stateless-per-task, highly isolated, contract-first system. The findings reveal a robust, highly portable compute plane orchestrated by a platform that heavily abstracts standard Kubernetes components, paired with an application deployment tier and robust administrative tooling.  
Five critical findings dictate the trajectory of the deployment plan and the subsequent architectural adaptations required by the engineering organization. First, the Orion compute plane operates entirely without Custom Resource Definitions (CRDs), translating Juno’s abstract workload definitions directly into native Kubernetes primitives. This **verified** capability guarantees extreme portability for the Cormac architecture.1 Should the Juno deployment prove inviable in the future, the entire infrastructure configuration can be exported as standard Helm charts or raw manifests to any conformant Amazon EKS or on-premises Kubernetes cluster without proprietary entanglement.  
Second, Juno’s security posture natively fulfills the critical Cormac invariant requiring the Hermes runtime to remain completely isolated from public ingress. The platform enforces strict namespace boundaries and automatically encrypts all workload-to-workload communication via mutual TLS (mTLS).2 This **verified** zero-trust network model requires explicit Role-Based Access Control (RBAC) permissions for lateral movement, inherently satisfying the requirement that the Hermes agent receives traffic exclusively from the Cormac Node/TypeScript control plane while neutralizing the risk of external unauthorized payload execution.  
Third, the critical memory leak identified in Hermes issue \#25315 has been patched in the upstream repository, effectively clearing unevicted agents and residual session messages that previously caused unbounded memory consumption.3 However, while this **verified** resolution mitigates the immediate risk of process termination due to resource exhaustion, the invariant that the Cormac product runtime operates statelessly per task remains architecturally superior for a multi-tenant environment. This stateless posture must remain intact to prevent cross-session data contamination and ensure pristine execution environments for every semantic contract evaluation.  
Fourth, security audits of the Hermes runtime in version 0.16.0 reveal a severe vulnerability in minimal configurations: deploying the API server without an explicitly defined API\_SERVER\_KEY environment variable completely bypasses authentication, exposing the runtime to arbitrary execution.4 Furthermore, there is no native rate limiting on the core completion endpoints.4 This **verified** degradation in the security posture mandates that the Cormac control plane must enforce strict authentication, validate payloads, and execute token-bucket rate limiting before passing any invocations to the internal Hermes adapter.  
Finally, while the Juno platform integrates with advanced identity providers for administrative access to its management portals, the documentation lacks technical specificity regarding route-level authentication for public-facing workloads.2 The Twilio and Microsoft Graph webhooks require stable, unauthenticated public endpoints with strict latency constraints, whereas client preview links require discrete JWT-based authentication mechanisms. This **unknown** capability regarding the configurability of the platform ingress controller constitutes the primary technical risk for the deployment plan and dictates the immediate agenda for technical discovery.

## **Part A: Juno Platform Mechanics**

### **1\. Exact Glossary and Platform Taxonomy**

To ensure seamless onboarding and eliminate translation errors during the deployment phase, the architecture must be mapped using Juno’s exact nomenclature. The Juno ecosystem relies on a specific taxonomy to abstract raw infrastructure components into higher-order management concepts. The precise definitions, extracted from the official documentation, establish the foundational vocabulary for the deployment diagram.  
**Verified:** **Orion** represents the foundational "Unified Compute Plane" or "Supervisor Layer".1 It orchestrates underlying hardware—whether bare metal, virtual machines, or cloud instances—and serves as the execution environment for Kubernetes workloads.5 Orion is designed to optimize compute resource allocation dynamically, scaling up for peak performance and scaling down to eliminate idle waste.5  
**Verified:** **Genesis** functions as the central management platform and web-based administrative user interface for the Orion cluster.6 It handles initial cluster bootstrapping, node joining, and identity provider integration (supporting NextAuth, Active Directory, Okta, Google Workspace, AWS Cognito, and SAML-based SSO).2 Genesis is the administrative perimeter, distinctly separate from the routing layer that handles application traffic.  
**Verified:** **Hubble** serves as the namespace portal designated for managing deployed Orion projects.6 It acts as the tenant or logical grouping interface for operators to monitor specific operational environments, providing visibility into the segregated execution boundaries.  
**Verified:** **Terra** operates as the infrastructure application store and plugin-driven deployment platform.1 It utilizes Helm as a backend deployment engine to package, distribute, and install complex configurations onto the Orion cluster with opinionated defaults.7 Terra is the mechanism through which the Cormac application stack will be formalized and instantiated.  
**Verified:** **Helios** denotes the containerized workstation and remote desktop environment provisioned via Terra templates.1 It is utilized to spin up isolated development environments (e.g., VS Code Server, JupyterLab) in roughly 60 seconds, drastically reducing developer onboarding friction.8  
**Verified:** A **Workload** is defined as any containerized application, virtual machine (via KubeVirt), or GPU-accelerated task executing on the Orion compute plane.1 In the Cormac context, the Web UI, the Control Plane API, and the Hermes Product Runtime each constitute distinct workloads.  
**Verified:** A **Workload Template** is an infrastructure-as-code blueprint defining the execution environment, container image parameters, schema fields, and group/project access controls for a given workload. Templates undergo a strict lifecycle encompassing creation, editing, duplication, upgrading, and deprecation.9  
**Verified:** A **Project** is a logical grouping boundary within the Hubble portal that encapsulates related workloads, inherently mapped to underlying Kubernetes namespaces to enforce isolation.2  
**Verified:** A **Namespace** is a hardened execution boundary implementing strict workload isolation, preventing shared memory, lateral network movement, and process space overlap.2  
**Verified:** **Plugins** and **Bundles** are pre-configured components distributed through the Terra marketplace. Plugins operate as modular infrastructure additions (e.g., GPU drivers, external DNS, NFS provisioners), while bundles define full application environments deployed via a single coherent installation sequence.1

### **2\. Workload Instantiation and Schema Definition**

The mechanism by which the Cormac services transition from source code to executing workloads determines the required continuous integration and continuous deployment (CI/CD) architecture.  
**Verified:** The Juno platform utilizes Workload Templates to define the operational schema for deployed services. These schemas support the explicit configuration of environment variables, group and project access matrices, and lifecycle management states ranging from initial creation to deprecation.9 Furthermore, the platform explicitly supports deploying pre-built container images and executing dynamic hardware allocation, accommodating both traditional microservices and GPU-bound analytical tasks.1  
**Inferred:** Because Orion functions as a zero-CRD abstraction over conformant Kubernetes distributions 1, a workload template inherently translates into standard Kubernetes Pods, Deployments, or StatefulSets. Consequently, the standard deployment parameters—such as port mappings, liveness and readiness health checks, replica counts, and resource requests and limits (CPU/Memory constraints)—must logically be supported within the Genesis interface or the underlying Terra Helm charts to facilitate functional orchestration.  
**Unknown:** The public documentation omits critical details regarding the provenance of container images. It remains unknown whether Juno natively provides an integrated source-to-image build pipeline capable of compiling Dockerfiles directly from a connected Git repository, or if it strictly acts as a deployment target requiring pre-built Open Container Initiative (OCI) images. Additionally, the mechanism for configuring authentication credentials for private OCI registries (e.g., AWS ECR, GitHub Container Registry) is undocumented. It is similarly unknown whether standard Docker Compose manifests can be natively ingested and translated into Workload Templates, or if the multi-container grouping must be manually reconstructed within the Terra bundle framework.

### **3\. Operating System and Architecture Constraints**

The underlying operating system and hardware architecture directly influence the compilation targets for the Cormac Node/TypeScript Control Plane and the Dockerized Hermes Python runtime.  
**Verified:** Workloads executing on the Orion compute plane are strictly Linux-based. The platform documentation explicitly states that the deployment runs on modern Linux distributions possessing systemd support and cgroupv2 capabilities.6 The orchestration engine itself relies on underlying Kubernetes distributions such as k3s for edge/on-premises, EKS for cloud, and kind for local development.6  
**Verified:** The platform boasts comprehensive multi-architecture support. All deployments, regardless of the underlying environment, natively support both Arm64 and x86\_64 CPU architectures.6 This flexibility allows the Hermes Product Runtime to leverage cost-effective ARM-based compute instances (e.g., AWS Graviton) if deployed in a cloud-hybrid model, provided the Docker images are constructed as multi-arch manifests.  
**Unknown:** There is zero documented support or strategy for Windows container execution. While the Cormac architecture does not currently require Windows containers, any future integrations necessitating native Windows execution environments will be structurally incompatible with the baseline Orion compute nodes. The base-image constraints for Helios workstations—specifically whether they permit highly customized distributions or mandate specific vendor-provided images—also remain undefined.

### **4\. Networking, Service Discovery, and Ingress Mechanisms**

The networking topology is load-bearing for the Cormac architecture, particularly concerning the exposure of the Control Plane to external webhook providers and the strict isolation of the internal LLM agent.  
**Verified:** Workload-to-workload communication is secured automatically via mutual TLS (mTLS), reflecting a zero-trust network model that assumes no implicit trust between internal services.2 This cryptographic enforcement ensures that even if a container is compromised, network sniffing and lateral movement are structurally prohibited.  
**Verified:** The platform natively enforces namespace isolation. Workloads can be made deliberately private, ensuring that network access requires explicit, audited RBAC permissions to permit any lateral movement across boundaries.2 This mechanism natively satisfies the invariant that the Hermes product runtime must remain completely isolated and never receive public ingress, operating safely within a private mesh accessible only by the Cormac Control Plane.  
**Unknown:** The mechanics of external ingress are entirely undocumented in the available corpus. It is unknown how a workload receives a public URL, how TLS termination is handled, or if custom domains can be bound to specific Workload Templates. Furthermore, the stability of these URLs across restarts and redeployments is a critical unknown. Twilio webhooks and Microsoft Graph webhooks require immutable public HTTPS endpoints; Microsoft Graph validation processes also enforce strict sub-three-second response time requirements. If the Juno ingress controller introduces cold-start latency or aggressively recycles external IP addresses, the webhook architecture will fail catastrophically. Finally, it remains unknown whether the ingress layer supports long-lived WebSockets and Server-Sent Events (SSE) necessary for the API streams, or if aggressive proxy timeout limits will sever the Hermes SSE emissions.

### **5\. Secrets and Configuration Management**

The secure handling of sensitive credentials—including Supabase service-role keys, Anthropic API tokens, Twilio credentials, and GitHub synchronization tokens—is paramount to the integrity of the contract-first CRM model.  
**Verified:** The Juno platform abandons simplistic, base64-encoded Kubernetes secrets in favor of deep integrations with enterprise-grade vaults. The documentation explicitly confirms native integrations with HashiCorp Vault, AWS Secrets Manager, and Azure Key Vault.2  
**Verified:** Secrets are injected dynamically at runtime and are strictly prohibited from being stored in container images or version control systems. The platform also supports automatic secret rotation.2 This robust mechanism ensures that the Hermes runtime container remains completely devoid of embedded credentials, receiving its necessary execution tokens only at the moment of instantiation.  
**Unknown:** The specific scoping mechanisms for these secrets are not detailed. It is unknown whether secrets can be scoped granularly per workload, or if they are applied broadly across an entire project namespace. Furthermore, the precise injection method—whether secrets are surfaced as standard process environment variables or mounted as read-only, memory-backed tmpfs files—is undocumented. The ability of administrators to read back injected secrets via the Genesis portal also requires clarification to establish proper operational security protocols.

### **6\. Storage and Persistence Mechanisms**

While the product runtime operates statelessly, peripheral services within the Cormac ecosystem require robust persistent volume support to function correctly.  
**Verified:** Orion supports an extensive array of storage protocols and external providers, including traditional Network File System (NFS), S3-compatible object storage, and high-performance file systems such as Qumulo, Weka, and Vast. It also supports standard Container Storage Interface (CSI) provisioners.1  
**Verified:** The platform explicitly supports ephemeral workloads where all persistent state and residual data are immediately and irrevocably destroyed upon execution termination or teardown.10 This aligns perfectly with the Cormac architecture's mandate for stateless-per-task Hermes instances, ensuring that the state.db SQLite file and session memories are purged automatically to prevent tenant data leakage.  
**Inferred:** Shared storage across workloads is supported via standard NFS or CSI plugins.1 This capability natively satisfies the shared volume requirements for the optional Gitea sandbox environment and the Dev Workspace, allowing multiple containers to read and write to a centralized repository structure. Similarly, the persistent volume claims required for the Jarvis developer assistant's memory and skill directories can be fulfilled via these integrated CSI provisioners.  
**Unknown:** The specific behavior of standard persistent volumes across rapid workload restarts and redeployments is not documented. Furthermore, the platform's native backup story—including automated snapshot capabilities, retention policies, and disaster recovery replication for CSI-provisioned volumes—remains undefined and requires clarification for the Jarvis state management.

### **7\. Lifecycle, Autoscaling, and Workload Recycling**

The operational stability of the Hermes runtime, which suffers from historical memory management inefficiencies in Python, relies heavily on the platform's ability to seamlessly recycle executing processes.  
**Verified:** Dynamic resource allocation and real-time resource optimization are core tenets of the Orion compute plane. The platform natively supports scaling up computational power to meet peak performance demands and aggressively scaling down to optimize cost efficiency.5  
**Verified:** The system implements per-request autoscaling, spinning up appropriately sized nodes when demand arrives and scaling the cluster back when the work concludes, thereby eliminating static infrastructure waste and the traditional "stair-step" provisioning models.8  
**Unknown:** The documentation does not specify the exact cold-start latency for lightweight Node.js containers recovering from a scaled-to-zero state. While Helios workstation environments boast a rapid 60-second launch time from user request to running state 8, a 60-second delay is unacceptable for synchronous API requests hitting the Control Plane. Furthermore, support for cron-based workload restarts or restart-after-N execution policies is undocumented. Given the necessity to routinely recycle Hermes workers to definitively defeat upstream memory fragmentation, discovering whether the platform can execute liveness-probe-driven restarts or cron-based recycling natively is a direct operational priority.

### **8\. The Dev Workspace (Helios) Mechanics**

The Helios subsystem is intended to replace local development environments, shifting the engineering loop entirely into the Juno cluster.  
**Verified:** Helios templates act as complete environment engines, delivering containerized desktops, JupyterLab instances, and VS Code Server configurations directly to engineering personnel via a web interface without requiring local configuration.1  
**Inferred:** Because Helios workloads execute atop standard Linux distributions on Arm64/x86\_64 architectures 6, installing modern runtimes such as Node.js 22 and package managers like pnpm is entirely feasible via standard Dockerfile instructions or initialization scripts defined within the Terra template schema. The environment acts as a standard isolated Linux namespace.  
**Unknown:** The availability of the Docker daemon *inside* the Helios workspace is undocumented. It is unknown whether the platform supports privileged containers necessary to run Docker-in-Docker (DinD) or if it provides a sidecar Docker daemon accessible to the workspace. This specific capability determines whether the local supabase start CLI stack and the associated Docker Compose files can function within Helios. Additionally, the mechanics of the Gitea sandbox mirroring to GitHub, and whether workspaces are kept strictly isolated per-developer or shared across teams, remain unclarified.

### **9\. Terra Plugins and Bundles**

Terra acts as the deployment vehicle for the entire Cormac ecosystem, formalizing the infrastructure requirements into reproducible manifests.  
**Verified:** Terra operates on a Helm backend, facilitating the installation of complex infrastructure plugins via an intuitive app store model.1 Official plugins include modular network components (e.g., Tailscale exit nodes), storage integration (e.g., NFS provisioners), observability stacks (Prometheus, Grafana, OpenTelemetry), and hardware-specific operators such as NVIDIA GPU drivers.1  
**Unknown:** The precise structural definition of the terra.yaml manifest is not detailed in the public documentation. It remains unverified whether a single overarching bundle can instantiate the entire interdependent Cormac stack (Web, Control Plane, Worker, Hermes, and Workspace) simultaneously in a single repeatable install. Furthermore, there are no documented official plugins for Supabase, PostgreSQL, Gitea, or Hermes/Claude-related agent infrastructure in the public catalog. This absence implies that the Cormac engineering team must wrap standard Helm charts for these components and distribute them as custom Terra plugins, relying on the platform's Helm compatibility rather than pre-existing Juno integrations.

### **10\. Route Authentication on Preview Links**

Controlling access at the edge is critical for a CRM managing sensitive financial and operational data.  
**Verified:** Administrative authentication to the Genesis and Hubble platforms is comprehensively handled via NextAuth integrations. The system seamlessly supports enterprise identity providers including Active Directory, Okta, Google Workspace, AWS Cognito, and SAML-based Single Sign-On (SSO).2  
**Unknown:** The platform’s ability to enforce authentication directly at the ingress layer on a per-route basis is completely undocumented. The Cormac architecture presents a complex edge requirement: Twilio webhooks inherently require public, unauthenticated routes to permit callback execution, while client preview links demand strict application-level or platform-level JWT validation before traffic reaches the Web UI workload. Whether this granular per-route control is managed by the Orion ingress controller, or if it must be entirely implemented within the Fastify routing logic of the Cormac Control Plane, is a critical unknown that affects the security perimeter design.

### **11\. Observability and Platform Audit Logging**

Visibility into the distributed system is necessary for maintaining Service Level Agreements (SLAs) and generating compliance artifacts for downstream CRM clients.  
**Verified:** Orion implements defense-grade, fine-grained, and immutable audit logging. Every API call, deployment action, and configuration modification is meticulously recorded alongside the corresponding user identity, exact timestamp, and the specific affected resources.2  
**Verified:** These comprehensive audit logs support direct, automated export to standard Security Information and Event Management (SIEM) systems via syslog or authenticated webhooks.2 This natively feeds the client security packet's platform-hosting section.  
**Verified:** Telemetry, health metrics, and alerting are gathered through native platform integrations with industry-standard observability tools, specifically Prometheus, Grafana, and OpenTelemetry.1  
**Inferred:** Live tailing of standard output and standard error logs from executing containers is a fundamental feature of the underlying Kubernetes engine. Therefore, it is highly probable that this capability is surfaced directly via the Hubble namespace portal to facilitate real-time debugging.

### **12\. Security and Compliance Evidence**

The security posture of the hosting platform is heavily scrutinized by enterprise clients evaluating the CRM.  
**Verified:** The Juno platform heavily emphasizes defense-grade security protocols, originally engineered for life sciences, aerospace, and government applications.5 It natively supports fully air-gapped deployments that operate completely independent of cloud management planes or outbound internet connectivity.10  
**Verified:** Namespace isolation enforces hard, cryptographic boundaries, ensuring absolutely no shared execution contexts, memory spaces, or processes exist across distinct workloads.2 Furthermore, the platform's supply chain resilience model is designed to contain the blast radius of compromised container images, preventing malicious dependencies from compromising adjacent workloads.2  
**Unknown:** Specific regulatory compliance certifications—such as SOC 2 Type II, ISO 27001, or HIPAA compliance status—are conspicuously absent from the publicly available documentation. Additionally, data residency constraints and available AWS region options are not explicitly defined, appearing to rely entirely on the geographic placement of the underlying infrastructure (e.g., self-hosted on-premises nodes or specific AWS regions chosen by the deploying organization).1

### **13\. Pricing and Economic Modeling**

The viability of the CRM product rests on achieving specific unit economics.  
**Unknown:** All granular pricing matrices, per-seat licensing costs, and developer-pilot tier signals are strictly absent from the public domain. The marketing documentation heavily emphasizes drastic compute cost reductions (claiming up to 56% savings via high hardware utilization) and the total absence of unpredictable cloud egress fees.1 However, the exact unit model—whether billing occurs per workload, per allocated node, or per licensed platform seat—is unstated. Given the strict operational constraint that the Cormac product must eventually function profitably at a sub-$40 per seat-equivalent for small enterprise clients, acquiring a precise economic model is a mandatory objective for the forthcoming Juno discovery meetings.

### **14\. Vendor Portability and Lock-in Mitigation**

Architectural lock-in poses a strategic risk to the long-term viability of the Cormac platform.  
**Verified:** The Orion platform exhibits minimal vendor lock-in at the compute layer. It strictly utilizes native Kubernetes primitives without injecting proprietary Custom Resource Definitions (CRDs) to manage workloads.1 Furthermore, application deployments heavily leverage standard Helm charts processed via the Terra backend.7  
**Inferred:** Leaving the Juno ecosystem entails exporting the underlying Helm configurations and raw Kubernetes manifests and executing them on any CNCF-conformant cluster. Because the compute plane actively operates across standard, unmodified distribution layers such as k3s, EKS, and kind 6, the migration target is "any Kubernetes" without the necessity of reverse-engineering proprietary orchestration glue.

## **Part B: Hermes Deployment Profile and Delta Check**

### **1\. Delta Check against v0.16.0 (2026-06-05)**

The subsequent table maps the state of the Hermes runtime, explicitly verifying critical infrastructural issues and API shapes identified up to version 0.16.0.

| Item Evaluated | Status | Evidentiary Basis and Technical Implications |
| :---- | :---- | :---- |
| **(a) Memory Leak Issue \#25315** | **Fixed** | Verified patch in upstream commits. Fixes applied to \_evict\_cached\_agent prevent silent process drops, while memory management routines now explicitly clear the \_session\_messages array, stopping unbounded RAM consumption.3 |
| **(b) response\_format / JSON Schema over HTTP** | **Unknown** | No changes are documented in the changelog snippets regarding structured outputs natively via the HTTP Runs API. The instruct-and-parse methodology remains the required path for external integration. |
| **(c) Plugin Hooks (\#2817)** | **No Change** | Despite being extensively documented, hooks such as pre\_llm\_call, post\_llm\_call, and on\_session\_start remain mechanically uninvoked by the runtime engine.12 The architecture must continue relying solely on the wired pre\_tool\_call and post\_tool\_call hooks. |
| **(d) Security & CVE Posture** | **Degraded** | A new advisory tracking under issue \#40889 indicates a severe vulnerability: omitting the API\_SERVER\_KEY environment variable bypasses authentication entirely. Furthermore, endpoints /v1/chat/completions and /v1/responses natively lack rate limits, and wildcard CORS origins (\*) are permitted by default.4 |
| **(e) API Shape, SSE, and Runs endpoints** | **Verified** | Streams successfully leverage standard chat.completion.chunk Server-Sent Events alongside custom hermes.tool.progress emissions.13 However, a bug (\#44212) exists where interrupting a run via the /stop endpoint yields silent background completion, draining upstream API limits.14 |

### **2\. Containerized Headless Deployment**

The Hermes runtime must operate purely as a backend execution engine, stripped of all consumer-facing chat interfaces.  
**Verified:** The Hermes runtime architecture exposes a comprehensive RESTful API, natively supporting a headless configuration. The system facilitates execution via the /v1/runs endpoints, which are specifically designed for long-form programmatic operations where clients subscribe to progress events rather than relying on synchronous polling or native UI gateways.13  
**Verified:** The system requires stringent environment variable configuration to secure the headless deployment. Specifically, API\_SERVER\_KEY must be explicitly defined; failing to do so defaults the agent to a completely unauthenticated state, permitting arbitrary external command execution.4 The wildcard CORS configuration must also be overridden to explicitly whitelist only the internal DNS routing of the Cormac Control Plane domains to prevent cross-origin exploitation.4  
**Unknown:** The official minimal Dockerfile composition required to comprehensively disable all consumer messaging gateways (e.g., Telegram, Discord, MS Graph Webhooks) strictly via environment variables remains undocumented in the reviewed material. It is unknown whether these gateways initialize by default and must be explicitly suppressed via feature flags, or if they operate on an opt-in basis. Furthermore, explicit resource allocation baselines (RAM/CPU request and limit boundaries) necessary for optimal horizontal worker scaling, as well as guidance on running N instances concurrently against a shared state database, are similarly omitted.

### **3\. State and Persistence Requirements**

Understanding disk I/O operations is critical for mapping the Hermes runtime to Juno’s storage primitives.  
**Verified:** The Hermes runtime writes heavily to disk to manage session memory persistence. The MEMORY.md file tracks agent environment facts (enforcing a strict limit of 2,200 characters), while the USER.md file tracks overarching persona preferences (limited to 1,375 characters).15 The state database operates on a local SQLite file, tracking extensive run provenance and conversational history.  
**Inferred:** The overarching Cormac invariant dictates that the product runtime operates statelessly per task. Consequently, MEMORY.md, USER.md, and the state.db SQLite file must reside on ephemeral disk volumes that are automatically destroyed upon task termination. This leverages Orion's ephemeral workload capabilities to ensure pristine execution environments.10 Conversely, the Jarvis developer assistant requires long-lived persistent volume claims (via CSI or NFS) to ensure operational continuity across \~/.hermes/memories/.15  
**Unknown:** There is no documentation detailing whether the internal session-storage subsystem can natively point state at externalized databases (e.g., a managed PostgreSQL instance) rather than relying on the local SQLite file structure. Consequently, the architecture assumes provenance extraction must occur via file parsing immediately post-run, prior to the destruction of the ephemeral runtime container.

### **4\. Multi-Instance Isolation: Profiles and Distributions**

The architecture demands strict tenant isolation, mapping one execution profile to one tenant container.  
**Verified:** Hermes allows dynamic profile creation, generating a designated home directory containing isolated config.yaml, .env, SOUL.md, memories, sessions, and state databases.16  
**Verified:** Profiles can be programmatically generated within automated deployment pipelines utilizing non-interactive flags (e.g., executing hermes profile create \<name\> \--clone-all).17  
**Verified:** Profile Distributions permit versioning an entire agent configuration (strictly excluding secrets) within a Git repository. It is possible to clone a fully functional configuration over a network using the command hermes profile install \<repo\> and update it systematically via Git tags.17 This GitOps-aligned capability serves as the optimal mechanism to deploy the standard Cormac product agent blueprint across disparate tenant profiles seamlessly.  
**Noise Alert:** Multi-profile gateways—wherein multiple independent agents operate concurrently as managed systemd/launchd services on a single host—are extensively documented.19 This paradigm directly contradicts the Cormac invariant mandating one strict container boundary per tenant and must be explicitly avoided in the deployment configuration.

### **5\. Health, Operations, and Graceful Interruptions**

The operational health of the runtime dictates the reliability of the queue processing.  
**Verified:** The runtime exhibits highly erratic graceful shutdown and interruption handling. Issue \#44212 outlines a severe mechanical bug wherein invoking a /stop command successfully releases the session lock and terminates the immediate client HTTP stream, but permits the underlying background run mechanism to silently continue executing against the LLM. Ultimately, the system generates a full response that is saved to the SQLite session file but never delivered to the client, effectively draining upstream token quotas invisibly.14  
**Inferred:** This critical flaw mandates that worker recycling strategies executed by the Orion compute plane must execute standard SIGTERM and SIGKILL commands cautiously. Tasks must be allowed to fully drain before aggressive pod eviction occurs during node scaling to prevent phantom billing from upstream foundational models (e.g., Anthropic) caused by severed client connections.

## **Part C: Hermes Documentation Triage (Signal/Noise Filter)**

The documentation corpus surrounding the Hermes runtime must be aggressively filtered against the settled architectural invariants of the Cormac CRM Agent. The following triage systematically categorizes the documentation tree to ensure engineering effort is dedicated exclusively to relevant architectural interfaces, classifying each node into actionable buckets.

| Documentation Path / Topic | Triage Bucket | Strategic Rationale and Technical Impact |
| :---- | :---- | :---- |
| email-agentmail | **CONTROL-PLANE REFERENCE** | The invariant dictates Cormac intercepts all inbound emails. This document informs the necessary parsing logic and payload structure for the Node/TS Control Plane to translate SMTP into API requests. |
| finance-excel-author | **CONTROL-PLANE REFERENCE** | The auditable .xlsx patterns described are vital for engineering the contract-generated workbook builder, executed exclusively by the control plane rather than the agent. |
| msgraph-webhook | **CONTROL-PLANE REFERENCE** | Microsoft Graph webhooks terminate strictly at the control plane. This reference informs the complex validation handshakes and payload construction required by the Azure ecosystem. |
| productivity-telephony | **CONTROL-PLANE REFERENCE** | A2P 10DLC registration requirements inform the Twilio integration built exclusively within the Control Plane; Hermes telephony features are disabled. |
| team-telegram-assistant | **JARVIS** | Consumer messaging integrations are restricted entirely to internal developer productivity and assistant tooling, explicitly banned from the product runtime. |
| tips | **JARVIS** | High-level behavioral prompting and productivity patterns apply exclusively to the stateful, persistent developer assistant context. |
| use-soul-with-hermes | **JARVIS** | Persona and psychological mapping (SOUL) configure the persistent development assistant’s identity, unsuitable for the purely transactional product runtime. |
| creating-skills | **PRODUCT-RUNTIME** | Details the internal mechanism for loading tools, which the headless product runtime utilizes to securely execute business logic against the Supabase instance. |
| api-server | **PRODUCT-RUNTIME** | The core integration interface; details the streaming architecture and required SSE subscription models via the vital /v1/runs endpoint.13 |
| hooks | **PRODUCT-RUNTIME** | Documented interceptors essential for telemetry. Must be tracked closely despite current upstream bugs rendering the majority of them mechanically uninvoked.12 |
| session-storage | **PRODUCT-RUNTIME** | Dictates the SQLite provenance extraction requirements that must occur post-run prior to the destruction of the ephemeral runtime container. |
| plugin-llm-access | **PRODUCT-RUNTIME** | Details how local tools can securely utilize the LLM context, vital for engineering complex, nested CRM reasoning chains within tool executions. |
| mcp | **PRODUCT-RUNTIME** | Outlines Model Context Protocol integrations required for establishing external tool surfaces, enabling future Claude clients to interface with the CRM. |
| cron | **NOISE** | Product background tasks are driven exclusively by the Cormac Node/TS worker queue; native Hermes cron schedulers must be completely disabled to prevent race conditions. |
| multi-profile-gateways | **NOISE** | Directly contradicts the tenant isolation invariant. The architecture enforces one independent, isolated container per tenant.19 |
| profiles | **PRODUCT-RUNTIME** | Core configuration isolation mechanics. Required for generating single-tenant profile directories safely during container initialization.16 |
| profile-distributions | **PRODUCT-RUNTIME** | The essential Git-backed mechanism for versioning, pulling, and updating the standardized CRM agent template across all tenant executions.18 |
| configuration | **PRODUCT-RUNTIME** | Defines critical security environment variables (e.g., API\_SERVER\_KEY) required to restrict unauthorized execution and enforce strict CORS boundaries.4 |
| cli-commands | **PRODUCT-RUNTIME** | Necessary for the automated instantiation of the Docker container initialization scripts and non-interactive profile generation. |
| programmatic-integration | **NOISE** | Assumes the consumer is extending Hermes via deeply integrated Python packages; Cormac interfaces strictly via the external HTTP API layer. |
| architecture | **PRODUCT-RUNTIME** | Provides broad contextual understanding of the interaction between the dispatcher, the orchestrator, and the session management lifecycle. |

## **Part D: Cormac to Juno Architecture Mapping**

The ensuing translation table establishes the foundational mapping required for the downstream Juno deployment plan, translating the verified components into Juno's specific platform vocabulary to enable frictionless onboarding.

| Cormac Component | Juno Construct | Key Configuration Constraints (Image, Network, Storage, Scaling) | Open Questions for Juno Discovery |
| :---- | :---- | :---- | :---- |
| **Web UI** | Workload | **Image**: Node/Vite build. **Network**: Public Ingress required for user access. **Scaling**: Standard horizontal autoscaling based on HTTP load. **Secrets**: None required (auth handled via API). | Is route-level JWT authentication natively available at the ingress controller for securing specific client preview links? |
| **Control Plane API** | Workload | **Network**: Public Ingress required (stable URLs for webhooks). **Scaling**: Rapid autoscaling to handle burst Twilio/MS Graph load. **Secrets**: Twilio, MS Graph, Supabase keys injected dynamically via Vault. | How do we guarantee strict sub-3-second webhook timeouts at the ingress layer? Are public URLs completely immutable across node drains? |
| **Worker** | Workload | **Network**: Strictly Private namespace; zero ingress. **Scaling**: Horizontal scaling driven entirely by internal queue length. **Storage**: Ephemeral. | How does Orion handle graceful shutdown signals to prevent dropped or corrupted background jobs during aggressive node scaling events? |
| **Hermes Product Runtime** | Workload | **Network**: Strictly Private namespace; mTLS to Control Plane only. **Storage**: Ephemeral volume; state.db explicitly dies on restart. **Scaling**: Recycled continuously to defeat memory leaks. | Can Orion Workload Templates automatically schedule pod recycling based on strict TTL or cron schedules natively? |
| **Jarvis (Dev Assistant)** | Workload | **Network**: Private, accessed exclusively via local port forwarding/VPN. **Storage**: Persistent CSI volume for stateful \~/.hermes/ directories. **Secrets**: Anthropic/OpenAI keys injected via Vault. | What is the automated backup strategy and data retention policy for persistent volume claims across isolated tenant namespaces? |
| **MCP Server (Future)** | Workload | **Network**: Public Ingress (authenticated surface). **Scaling**: Scale-to-zero capability when no external Claude clients are connected. **Secrets**: External API tool credentials. | What is the exact cold-start latency for a scaled-to-zero workload recovering to serve an incoming HTTP request? |
| **Dev Workspace** | Helios Template | **Image**: Node 22 \+ pnpm, Linux base image. **Storage**: Persistent shared NFS across the engineering organization. **Network**: Private to engineering group. | Does Helios natively support privileged containers for executing Docker-in-Docker (DinD) to enable local supabase start emulation? |
| **Gitea Sandbox** | Terra Bundle | **Network**: Private namespace. **Storage**: Persistent shared volume. **Secrets**: GitHub synchronization tokens injected via Vault. | Can a single comprehensive terra.yaml bundle instantiate Gitea alongside the control plane, database, and developer workspaces? |
| **Supabase (Dev/Preview)** | Terra Plugin | **Network**: Private to specific project namespaces. **Storage**: Ephemeral or persistent based strictly on preview state requirements. **Role**: Development data only; production relies on managed external Supabase. | Are there existing PostgreSQL/Supabase templates in the Terra app store, or must the engineering team wrap standard upstream Helm charts? |

## **Technical Inquiries for the Juno Innovations Team**

The following inquiries capture documented ambiguities and critical operational unknowns. These must be submitted verbatim to the Juno engineering team during the deployment pilot phase to mitigate architectural risk.  
**Workloads, Templates, and Infrastructure Capabilities**

* How are private container registries authenticated when pulling base OCI images for Orion workloads?  
* Does the Helios workstation environment support privileged container execution to facilitate Docker-in-Docker, enabling engineers to run supabase start locally?  
* Can an entire interdependent application stack (Web, Control Plane, Workers, external databases) be orchestrated and versioned within a single terra.yaml bundle?

**Networking and Ingress Configuration**

* Are public HTTP endpoints assigned to workloads fully stable and immutable across redeployments and restarts, as required by the Microsoft Graph webhook registration?  
* Does the platform’s ingress controller inherently support long-lived Server-Sent Events (SSE) and WebSockets without enforcing aggressive timeout terminations?  
* Can the ingress controller be configured to bypass authentication on specific webhook routes while enforcing identity provider validation (e.g., NextAuth) on adjacent client preview routes, or must this occur at the application layer?

**Secrets and Configuration Management**

* Are injected secrets scoped granularly at the Workload level, or are they strictly bounded to the broader Project namespace?  
* What is the specific mechanical method for secret injection? Are they populated as standard process environment variables, or mounted securely as read-only memory-backed tmpfs files?

**Storage, Persistence, and Scaling Operations**

* What is the specific, documented cold-start latency for a lightweight Node.js workload recovering from a scale-to-zero state to process an incoming HTTP request?  
* Can Orion Workload Templates natively configure cron-based or TTL-based pod recycling to aggressively preempt underlying Python application memory leaks without manual intervention?  
* What is the native snapshot and automated backup strategy for CSI-provisioned persistent volumes utilized by stateful internal tools (e.g., Jarvis, Gitea)?

**Pricing and Economic Modeling**

* What are the specific unit economics and pricing tiers for the compute nodes? Do costs scale linearly per active workload, per allocated underlying node, or per registered developer platform seat?

## **Source Verification Log**

* 20  
  Evaluated Juno AWS architectural overview. Yielded containerized Kubernetes execution environment metrics and general platform viability.  
* 1  
  Evaluated Terra plugin documentation. Verified Helios workstation provisioning and the core Helm-backend architecture.  
* 6  
  Evaluated Orion Quick Start documentation. Yielded precise definitions for Genesis (management) and Hubble (namespace portal).  
* 6  
  Evaluated Linux prerequisites. Verified platform requirements for systemd and cgroupv2 execution.  
* 6  
  Evaluated orchestration distributions. Verified native support for k3s, EKS, kind, and multi-architecture hardware capabilities (Arm64/x86\_64).  
* 5  
  Evaluated Unified Compute Plane specifications. Yielded resource optimization metrics and autoscaling data paradigms.  
* 7  
  Evaluated Terra community documentation. Verified strict Helm integration and security-conscious deployment parameters.  
* 5  
  Evaluated Dynamic Resource Allocation capabilities. Verified Orion's ability to scale workloads in real-time.  
* 5  
  Evaluated Workload scaling definitions. Verified automatic scaling based on data volume and dynamic GPU allocation.  
* 18  
  Evaluated Hermes profile distribution documentation. Verified GitOps installation mechanics of Hermes agents (hermes profile install).  
* 16  
  Evaluated Hermes profile isolation. Verified the creation of separate structural directories for config, .env, and SOUL.md.  
* 15  
  Evaluated Hermes persistent memory constraints. Verified exact character limits for MEMORY.md (2,200 chars) and USER.md (1,375 chars).  
* 17  
  Evaluated Hermes CLI commands. Verified programmatic profile cloning and non-interactive creation capabilities.  
* 19  
  Evaluated multi-profile Hermes gateways. Triaged as structural noise due to direct contradiction with the Cormac container isolation invariant.  
* 5  
  Evaluated Helios Unified Compute Plane positioning. Verified workstation launch time metrics (60 seconds).  
* 13  
  Evaluated Hermes API Server documentation. Verified SSE streaming schemas (chat.completion.chunk) and the headless /v1/runs endpoint.  
* 3  
  Evaluated upstream Hermes GitHub issues. Verified the applied P1 high-priority fix for the \#25315 memory leak.  
* 12  
  Evaluated Hermes plugin hooks bug. Verified \#2817 remains open; standard hooks are documented but never invoked by the runtime.  
* 6  
  Evaluated Orion Quick Start exploration guides. Verified Hubble and Terra organizational definitions.  
* 11  
  Evaluated Juno Solutions page for defense and government. Verified air-gapped deployment architecture and disconnected operations.  
* 1  
  Evaluated Juno product landing documentation. Verified the critical zero-CRD architecture, mTLS networking, NFS storage capabilities, and air-gap deployment capabilities.  
* 8  
  Evaluated Juno metrics and compute efficiency claims. Verified 60-second workstation launch times and CPU/GPU utilization cost reductions.  
* 2  
  Evaluated Juno Security architecture. Verified namespace isolation, HashiCorp Vault integrations, NextAuth identity provider support, and RBAC immutable audit logs.  
* 10  
  Evaluated Juno Defense/Government ephemeral use cases. Verified the ephemeral workload execution model suitable for stateless LLM agents.  
* 9  
  Evaluated Juno workload management definitions. Verified the exact schema lifecycle states (edit, duplicate, deprecate).  
* 8  
  Evaluated Juno cloud resource orchestration. Verified per-request autoscaling and node scaling algorithmic behaviors.  
* 14  
  Evaluated Hermes GitHub issue \#44212. Verified the critical architectural bug where /stop commands result in empty, expensive background completions.  
* 4  
  Evaluated Hermes GitHub issue \#40889. Verified severe security degradation regarding missing API key authentication, absent rate limits, and wildcard CORS execution.  
* 3  
  Evaluated upstream commit logs for the Hermes project. Verified the specific technical fix applied to the \_evict\_cached\_agent function.  
* 12  
  Re-verified issue \#2817 regarding the persistently broken plugin hook architecture in the most recent updates.

#### **Works cited**

1. Orion — The Unified Compute Plane by Juno, accessed June 12, 2026, [https://www.juno-innovations.com/product](https://www.juno-innovations.com/product)  
2. Security Architecture — Juno Orion, accessed June 12, 2026, [https://www.juno-innovations.com/security](https://www.juno-innovations.com/security)  
3. fix: gateway memory leak — \_evict\_cached\_agent drops agents without cleanup, \_session\_messages never cleared \#25315 \- GitHub, accessed June 12, 2026, [https://github.com/NousResearch/hermes-agent/issues/25315](https://github.com/NousResearch/hermes-agent/issues/25315)  
4. Security Assessment: Hermes Agent GitHub Repository (posture review) · Issue \#40889, accessed June 12, 2026, [https://github.com/NousResearch/hermes-agent/issues/40889](https://github.com/NousResearch/hermes-agent/issues/40889)  
5. Juno Innovations \- GitHub Pages, accessed June 12, 2026, [https://juno-fx.github.io/Orion-Documentation/](https://juno-fx.github.io/Orion-Documentation/)  
6. Quick Start \- Juno Innovations \- GitHub Pages, accessed June 12, 2026, [https://juno-fx.github.io/Orion-Documentation/latest/installation/quick-start/](https://juno-fx.github.io/Orion-Documentation/latest/installation/quick-start/)  
7. Welcome \- Juno Innovations, accessed June 12, 2026, [https://juno-fx.github.io/Terra-Official-Plugins/](https://juno-fx.github.io/Terra-Official-Plugins/)  
8. Juno Innovations: GPU Orchestration and Unified Compute Plane, accessed June 12, 2026, [https://www.juno-innovations.com/](https://www.juno-innovations.com/)  
9. Documentation — Orion by Juno Innovations, accessed June 12, 2026, [https://www.juno-innovations.com/docs](https://www.juno-innovations.com/docs)  
10. Air-Gapped Defense Compute Infrastructure — Juno Orion, accessed June 12, 2026, [https://www.juno-innovations.com/solutions/defense](https://www.juno-innovations.com/solutions/defense)  
11. Compute Solutions by Vertical | Juno Innovations, accessed June 12, 2026, [https://www.juno-innovations.com/solutions](https://www.juno-innovations.com/solutions)  
12. \[Bug\]: Plugin hooks pre\_llm\_call, post\_llm\_call, on\_session\_start, on\_session\_end are documented but never invoked \#2817 \- GitHub, accessed June 12, 2026, [https://github.com/NousResearch/hermes-agent/issues/2817](https://github.com/NousResearch/hermes-agent/issues/2817)  
13. API Server | Hermes Agent \- nous research, accessed June 12, 2026, [https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)  
14. gateway: post-/stop interrupted state silently swallows the next user message's empty response (\`\_normalize\_empty\_agent\_response\` interrupted path; adjacent case fixed in \#29346) · Issue \#44212 · NousResearch/hermes-agent \- GitHub, accessed June 12, 2026, [https://github.com/NousResearch/hermes-agent/issues/44212](https://github.com/NousResearch/hermes-agent/issues/44212)  
15. Persistent Memory | Hermes Agent \- nous research, accessed June 12, 2026, [https://hermes-agent.nousresearch.com/docs/user-guide/features/memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)  
16. Profiles: Running Multiple Agents | Hermes Agent \- nous research, accessed June 12, 2026, [https://hermes-agent.nousresearch.com/docs/user-guide/profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)  
17. Profile Commands Reference | Hermes Agent, accessed June 12, 2026, [https://hermes-agent.nousresearch.com/docs/reference/profile-commands](https://hermes-agent.nousresearch.com/docs/reference/profile-commands)  
18. Profile Distributions: Share a Whole Agent \- Hermes Agent \- nous research, accessed June 12, 2026, [https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions](https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions)  
19. Running Many Gateways at Once | Hermes Agent \- nous research, accessed June 12, 2026, [https://hermes-agent.nousresearch.com/docs/user-guide/multi-profile-gateways](https://hermes-agent.nousresearch.com/docs/user-guide/multi-profile-gateways)  
20. Juno FX redefines the future of VFX production in the cloud \- The AWS News Feed, accessed June 12, 2026, [https://aws-news.com/article/019465e7-7371-cfa3-c2c5-d852e26144be](https://aws-news.com/article/019465e7-7371-cfa3-c2c5-d852e26144be)