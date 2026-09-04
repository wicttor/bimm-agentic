---
title: External Research Guidance
description: Guidance for generating targeted external research queries when high-risk areas are detected and external research is recommended.
type: reference
version: 1.1
timestamp: "2026-08-07"
---

# External Research Guidance

This file documents how to generate targeted external research queries when high-risk areas are detected and external research is recommended.

## When to Run External Research

External research is recommended when:

- One or more high-risk areas identified (see high-risk-detection.md)
- Fewer than 3 similar local implementations found

## Generating Targeted Queries

Generate specific, actionable queries that include:

- **Topic:** The specific area (e.g., "payment gateway", "OAuth2 implementation")
- **Tech stack:** Relevant technologies (e.g., "Node.js", "Express", "PostgreSQL")
- **Scope:** Information type (e.g., "best practices", "patterns", "troubleshooting")
- **Year:** Current year for recent guidance

## Query Templates

| Area           | Template                                  | Example                                        |
| -------------- | ----------------------------------------- | ---------------------------------------------- |
| Security       | `[area] patterns [tech-stack] [year]`     | `JWT authentication patterns Node.js 2026`     |
| Payments       | `[provider] integration [tech-stack]`     | `Stripe integration Node.js best practices`    |
| API Design     | `[type] design patterns [year]`           | `REST API versioning strategies 2026`          |
| Migrations     | `[type] migration guide [tech-stack]`     | `Database migration PostgreSQL best practices` |
| Complex Logic  | `[algorithm] implementation [tech-stack]` | `Search optimization patterns Node.js`         |
| Infrastructure | `[tech] [deployment] patterns [year]`     | `Kubernetes deployment best practices 2026`    |

## Executing External Research

Use generated queries with:

- **Web search:** Use the agent's web search or fetch capabilities with your generated query
- **Manual research:** GitHub, official docs, blogs, Stack Overflow
- **Integration:** Some agents may offer specialized research tools — check agent documentation

## Refining Queries

| Finding            | Strategy                               |
| ------------------ | -------------------------------------- |
| Too many results   | Add "best practices" or "production"   |
| Too few results    | Broaden or use alternative terminology |
| Outdated info      | Add current year to query              |
| Conflicting advice | Compare approaches side-by-side        |

## Notes

- Queries should be actionable and specific to the tech stack
- Use whatever web search or research capabilities are available in your agent environment
- Capture findings as learnings after research to build organizational knowledge
