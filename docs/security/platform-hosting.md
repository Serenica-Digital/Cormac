# Platform and Hosting

Status: stub (pending Juno, ADR-017)
Maps to: control-register row 18
Last reviewed: 2026-06-06

Blocked on: the Juno orchestration pilot and the shared-responsibility details that come out of it.

## Intended content

The shared-responsibility split between the orchestration platform (Juno) and Serenica Digital, written so a reviewer sees exactly who controls and evidences what.

| Concern | Platform (Juno) | Serenica Digital |
| --- | --- | --- |
| Container orchestration, scaling, routing | provides | defines services, ports, env, health |
| Network isolation, platform access controls | provides + evidences | configures |
| Secrets injection | provides mechanism | owns secret values and rotation |
| Backups of platform infra | provides | owns application-data backup ([backup-restore.md](backup-restore.md)) |
| Platform audit logs | provides | application audit ([audit-logging.md](audit-logging.md)) |
| Product authority (auth, RBAC, contracts, writes, audit) | none | owns entirely |
| Data residency | region choice | documents to clients |

## Portability note

Every service is a normal container and must run outside Juno without rewrites (ADR-017). The packet should state this so a client knows the platform is swappable and not a black box.

## To make this real

After the Juno onboarding, fill in the concrete controls Juno evidences (network, access, audit, backups, scanning) and the data-residency region, and flip control-register row 18.
