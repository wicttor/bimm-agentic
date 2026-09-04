---
title: High-Risk Area Detection
description: "Scan the task description and scoped context for high-risk keywords across six areas: Security, Payments, APIs, Migrations, Complex Logic, and Infrastructure."
type: reference
version: 1.1
timestamp: "2026-08-07"
---

# High-Risk Area Detection

This file documents the keyword-based detection system for identifying high-risk areas during the research phase. It includes the risk keyword table, area definitions, and the heuristic for mapping detected areas to risk levels.

## Risk Keywords Table

Scan the task description and scoped context for these keywords to identify high-risk areas:

| Area           | Keywords                                                                                               | Risk Category |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| Security       | auth, jwt, oauth, session, encryption, ssl, tls, certificate, permission, rbac, acl, audit, credential | CRITICAL      |
| Payments       | payment, billing, stripe, checkout, invoice, refund, transaction, subscription, pci, card              | CRITICAL      |
| APIs           | api, rest, graphql, endpoint, integration, webhook, rate-limit, versioning                             | HIGH          |
| Migrations     | migration, upgrade, data, schema, version, backward-compat, deprecation                                | HIGH          |
| Complex Logic  | algorithm, analysis, processing, computation, ml, analytics, optimization                              | HIGH          |
| Infrastructure | deploy, kubernetes, docker, scaling, network, cdn, load-balance, failover, disaster-recovery           | HIGH          |

## Area Definitions

### Security (CRITICAL)

Involves authentication, authorization, session management, encryption, or credential handling.

- **Examples:** JWT implementation, OAuth integration, session cookies, SSL certificates, password hashing
- **Why critical:** Security breaches can compromise the entire system
- **Escalation:** Always recommend external research unless extensive local patterns exist

### Payments (CRITICAL)

Involves payment processing, billing, invoicing, or financial transactions.

- **Examples:** Stripe integration, checkout flow, refund logic, subscription management
- **Why critical:** Payment systems have strict compliance requirements (PCI DSS); errors cause financial loss
- **Escalation:** Always recommend external research; verify compliance requirements

### APIs (HIGH)

Involves REST, GraphQL, or other API design and integration.

- **Examples:** RESTful endpoint design, GraphQL schema, third-party API integration, versioning
- **Why high:** Poor API design can create compatibility issues; integration errors block downstream work
- **Escalation:** Recommend external research if designing new APIs or integrating unfamiliar third-party services

### Migrations (HIGH)

Involves schema changes, version upgrades, or data migration with impact on production.

- **Examples:** Database schema migration, framework upgrade, data format change, breaking API changes
- **Why high:** Migrations can cause data loss or downtime if not carefully planned
- **Escalation:** Recommend external research for migrations without local patterns

### Complex Logic (HIGH)

Involves algorithms, machine learning, complex computations, or analysis.

- **Examples:** Sorting/searching algorithms, ML model selection, financial calculations, performance-critical code
- **Why high:** Bugs in complex logic can cascade; optimization mistakes are hard to reverse
- **Escalation:** Recommend external research if no local examples exist

### Infrastructure (HIGH)

Involves deployment, container orchestration, scaling, or network architecture.

- **Examples:** Kubernetes deployment, Docker setup, load balancing, CDN configuration, disaster recovery
- **Why high:** Infrastructure mistakes can cause downtime or security vulnerabilities
- **Escalation:** Recommend external research for infrastructure patterns not yet documented

## Risk Level Determination

After identifying which areas the task touches, assign a risk level using this logic:

```
risk_level = determine_risk(areas_detected, high_risk_count)

if any_area_is_security_or_payments:
  risk_level = CRITICAL
  reason = "Critical area detected: " + critical_area
elif high_risk_count >= 2:
  risk_level = HIGH
  reason = "Multiple high-risk areas: " + areas_detected.join(", ")
elif any_area_is_api_migration_logic_infra:
  risk_level = MEDIUM
  reason = "High-risk area detected: " + area_name
else:
  risk_level = LOW
  reason = "No high-risk areas detected"
```

## Mapping to Research Decision

> **Authoritative.** The Research phase (Step 3) looks up its external-research decision directly in the matrix below, using the detected **risk level** and the **patterns found count**. Do not apply a separate formula — this matrix is the single source of truth.

Use risk level to determine if external research should be recommended:

| Risk Level | Patterns Found | Decision           | Notes                                        |
| ---------- | -------------- | ------------------ | -------------------------------------------- |
| CRITICAL   | 0-2            | Recommend external | Insufficient local patterns; must research   |
| CRITICAL   | 3+             | Recommend external | Critical area; external research required    |
| HIGH       | 0-2            | Recommend external | Insufficient local patterns; must research   |
| HIGH       | 3+             | Optional external  | Strong local patterns; external optional     |
| MEDIUM     | 0-1            | Recommend external | Limited local examples; external recommended |
| MEDIUM     | 2+             | Optional external  | Adequate local patterns; external optional   |
| LOW        | any            | Skip external      | Low risk; no external research needed        |
