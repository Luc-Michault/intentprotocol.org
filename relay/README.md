# Intent Protocol v0.3 — Conformant Relay ("Trust & Recovery")

Reference relay implementing the full v0.3 spec: all v0.2 features plus key rotation, circuit breakers, deal quarantine, agent status tracking, and adversarial hardening.

## Prerequisites

- Node.js 20+

## Quick Start

```bash
cd relay
npm install
npm start
# → ws://localhost:3100/v1/ws
```

## Configuration

Environment variables:

- `PORT` — server port (default: 3100)
- `RELAY_HOST` — relay domain for signatures (default: localhost)
- `MIN_BID_WINDOW_MS` — minimum delay before forwarding bids to PA in ms (default: 5000)

## Features

### v0.2 (preserved)

- WebSocket transport (`/v1/ws`)
- Agent registration (PA/BA types)
- Category + geographic routing
- Ed25519 signature verification
- TTL enforcement & rate limiting
- Anti-phishing validation
- `delivery_ack`, `bid_commitment`, `deal_attestation`
- Settlement proof support

### v0.3 (new)

- **Recovery key & owner attestation** — Register optional `recovery_pubkey`; key_rotation with `reason: "compromised"` requires valid owner_attestation (signature by recovery key over canonical payload). Quarantine appeal requires valid owner_attestation (recovery or current key).
- **Key Rotation** — Rotate compromised/expired keys without losing identity; compromised rotation requires recovery key + attestation
- **Deal Quarantine** — Only deals created in the last 72h where the agent is party; `SECURITY_REVOCATION` to counterparties
- **Min bid window** — Bids are not forwarded to the PA until `min_bid_window_ms` (default 5s) after RFQ receipt; configurable via `MIN_BID_WINDOW_MS` and exposed in `/v1/relay/circuit-breaker-config`
- **Circuit Breakers** — Volume spike detection, auto-quarantine on anomalous patterns
- **Agent Status** — `active` / `quarantined` / `throttled` states
- **Key History** — Full audit trail of key rotations
- **Clock Skew Validation** — Reject messages with > 30s clock drift
- **Quarantine Appeals** — Agents can appeal with cryptographically verified owner_attestation

*Note:* Grace period (24h read-only for compromised key) is not implemented; the old key is invalidated immediately.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v1/health` | Relay health |
| `GET /v1/stats` | Relay statistics |
| `GET /v1/info` | Relay identity + protocol version |
| `GET /v1/deals/:id` | Deal details |
| `GET /v1/deals/:id/attestation` | Deal attestation |
| `GET /v1/deals?state=quarantined` | Quarantined deals |
| `GET /v1/agents/:id/status` | Agent status (active/quarantined/throttled) |
| `GET /v1/agents/:id/key-history` | Key rotation history |
| `GET /v1/relay/circuit-breaker-config` | Circuit breaker thresholds |

### Message Types (v0.3)

| Type | Direction | Description |
|------|-----------|-------------|
| `key_rotation` | Agent → Relay | Rotate key (requires old key + owner attestation) |
| `key_rotation_notice` | Relay → All | Broadcast key change |
| `deal_quarantine` | Relay → Agent | Notify of quarantined deals |
| `SECURITY_REVOCATION` | Relay → Counterparties | Alert about compromised deals |
| `quarantine_appeal` | Agent → Relay | Appeal circuit breaker quarantine |

## Architecture

```
index.js        Main server — WebSocket + HTTP, all handlers
protocol.js     Message constructors (v0.2 + v0.3)
validation.js   Input validation, anti-phishing, clock skew
crypto.js       Ed25519 sign/verify (tweetnacl)
geo.js          Geographic matching
```

## Security

- Ed25519 signatures on all messages
- TTL validation with clock skew detection
- Rate limiting (10 RFQ/min, 100 bid/min per agent)
- Circuit breakers with automatic quarantine
- Anti-phishing (URL/phone blocked in display fields)
- Key rotation (reason: compromised) requires recovery_pubkey + owner_attestation signature
- Quarantine appeal verified by recovery key (or current key if no recovery)
- Deal quarantine limited to deals created in last 72h
- Min bid window: no bids sent to PA before 5s after RFQ

---

**Status**: Reference implementation for Intent Protocol v0.3 "Trust & Recovery".
