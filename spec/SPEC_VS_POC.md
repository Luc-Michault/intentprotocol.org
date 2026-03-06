# Intent Protocol — Spec vs Implementation Compliance

This document indicates for each major spec requirement (v0.1, then v0.2) whether it is **implemented**, **simulated** (displayed or emulated without real behavior), or **absent** in current implementations.

**Goal**: clearly distinguish demo (proof of concept) from compliant relay, and guide contributors.

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Implemented | Behavior compliant with spec |
| 🟡 Simulated | Displayed or emulated in demo, not real relay (e.g. delivery_ack shown in UI but not emitted by server) |
| ❌ Absent | Not implemented |
| ➖ N/A | Not applicable to this implementation |

---

## Concerned implementations

| Id | Implementation | Description |
|----|----------------|-------------|
| **PoC Demo** | `poc/relay-server.js` + site | HTTP server + POST /v1/demo simulating flow in memory, no WebSocket agents |
| **Compliant Relay (v0.2)** | `relay/` | Reference WebSocket relay with delivery_ack, bid_commitment, deal_attestation, anti-phishing, rate limits |

---

## v0.1 — Messages and transport

### Basic message flow

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| RFQ message structure | ✅ | ✅ |
| BID message structure | ✅ | ✅ |
| ACCEPT message structure | ✅ | ✅ |
| DEAL message structure | ✅ | ✅ |
| RECEIPT message structure | ✅ | ✅ |
| WebSocket transport | ❌ | ✅ |
| Agent registration | 🟡 | ✅ |

### Signatures and security

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Ed25519 signatures | 🟡 | ✅ |
| TTL validation | ❌ | ✅ |
| Message size limits | ❌ | ✅ |
| Rate limiting | ❌ | ✅ |

### Routing and discovery

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Category-based routing | 🟡 | ✅ |
| Geographic routing | 🟡 | ✅ |
| Provider discovery | 🟡 | ✅ |
| delivery_ack | ❌ | ✅ |

---

## v0.1 — Categories and schemas

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| JSON Schema validation | ❌ | ✅ |
| Standard categories (beauty, transport, etc.) | 🟡 | ✅ |
| specs validation against category | ❌ | ✅ |

---

## v0.1 — Security features

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Signature verification | 🟡 | ✅ |
| TTL enforcement | ❌ | ✅ |
| Basic anti-spam | ❌ | ✅ |
| Input sanitization | ❌ | ✅ |

---

## v0.2 — Enhanced security

### Settlement proof

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| settlement_proof in receipt | ❌ | ✅ |
| Payment method validation | ❌ | ✅ |
| Reference verification | ❌ | 🟡 |

### Deal attestations

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| deal_attestation generation | ❌ | ✅ |
| Relay signature on attestations | ❌ | ✅ |
| Attestation verification | ❌ | ✅ |
| Cross-relay reputation | ❌ | 🟡 |

### Anti-phishing

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| URL detection in displayed fields | ❌ | ✅ |
| Phone number detection | ❌ | ✅ |
| Field sanitization | ❌ | ✅ |
| SDK sanitization functions | ❌ | ✅ |

### Enhanced bid commitment

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| bid_commitment message | ❌ | ✅ |
| bid_ids_hash | ❌ | ✅ |
| bids_content_hash | ❌ | ✅ |
| PA hash verification | ❌ | ✅ |

### Versioned schemas

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| category_schema_version in RFQ | ❌ | ✅ |
| Schema registry | ❌ | 🟡 |
| Version pinning | ❌ | ✅ |

### Anti-griefing

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Counterparty-weighted cancellation | ❌ | ✅ |
| Reputation calculation | ❌ | ✅ |
| Sybil attack protection | ❌ | 🟡 |

---

## Deployment and operations

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Docker deployment | ➖ | ✅ |
| Health checks | ❌ | ✅ |
| Metrics/monitoring | ❌ | ✅ |
| Configuration management | 🟡 | ✅ |
| Database persistence | ❌ | ✅ |

---

## SDK Features

### JavaScript SDK

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Message signing | ✅ | ✅ |
| Schema validation | ❌ | ✅ |
| Field sanitization | ❌ | ✅ |
| Settlement proof helpers | ❌ | ✅ |
| Bid commitment verification | ❌ | ✅ |

### Python SDK

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Message signing | ✅ | ✅ |
| Schema validation | ❌ | ✅ |
| Field sanitization | ❌ | ✅ |
| Settlement proof helpers | ❌ | ✅ |
| Bid commitment verification | ❌ | ✅ |

---

## Testing and validation

| Requirement | PoC Demo | Relay v0.2 |
|-------------|----------|------------|
| Unit tests | ❌ | ✅ |
| Integration tests | ❌ | ✅ |
| Security fuzzing | ❌ | 🟡 |
| Load testing | ❌ | 🟡 |
| Conformance tests | ❌ | ✅ |

---

## Summary

**PoC Demo**: Suitable for demonstrations and understanding the protocol flow. Not production-ready.

**Relay v0.2**: Production-ready implementation with full security features, persistence, and monitoring. Reference implementation for the protocol.

**Key gaps for production**:
- Multi-relay federation (planned for v0.3)
- Full schema registry (needs hosting solution)
- Advanced Sybil attack protection
- Security audit and penetration testing
- Performance optimization and load testing

---

*Last updated: March 6, 2026*