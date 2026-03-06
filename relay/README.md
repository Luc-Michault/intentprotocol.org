# Intent Protocol v0.2 — Compliant Relay

Reference relay compliant with v0.2 spec: WebSocket, `delivery_ack`, `bid_commitment` (with `bids_content_hash`), `deal_attestation`, anti-phishing validation, rate limits, signatures.

## Prerequisites

- Node.js 20+

## Installation

```bash
cd relay
npm install
```

## Start

```bash
npm start
# or
node index.js
```

Default port: **8080**. WebSocket endpoint: `ws://localhost:8080`

## Configuration

Environment variables:

- `PORT` — server port (default: 8080)
- `RELAY_DOMAIN` — relay domain for signatures (default: localhost)
- `RELAY_PRIVATE_KEY` — Ed25519 private key hex (generates random if not set)
- `RATE_LIMIT_WINDOW` — rate limit window in ms (default: 60000)
- `RATE_LIMIT_MAX` — max requests per window (default: 100)
- `GEO_RADIUS_KM` — geographic search radius (default: 50)

## Features

### ✅ v0.2 Compliant

- WebSocket transport for agents
- Agent registration (PA/BA types)
- Category-based + geographic routing
- Message signature verification (Ed25519)
- TTL enforcement
- Rate limiting
- Anti-phishing validation (URL/phone detection)
- `delivery_ack` after RFQ routing
- `bid_commitment` with content hash
- `deal_attestation` generation
- Settlement proof support

### 📊 Monitoring

- Health check: `GET /health`
- Metrics: `GET /metrics` (basic stats)
- Agent list: `GET /agents` (debug)

## Message Flow

1. **Agent connects** via WebSocket
2. **Registration**: agent sends `register` message
3. **RFQ**: PA sends request → relay routes to matching BAs
4. **delivery_ack**: relay confirms routing (BA count)
5. **bid_commitment**: relay commits to received bids
6. **BIDs**: relay forwards bids to PA
7. **ACCEPT**: PA accepts one bid
8. **DEAL**: relay generates signed deal
9. **RECEIPT**: after service fulfillment
10. **deal_attestation**: relay signs attestation for reputation

## Security

- All messages must be signed (Ed25519)
- TTL validation (max 24h)
- Message size limits (1MB)
- Anti-phishing: URLs and phone numbers blocked in display fields
- Rate limiting per connection
- Input sanitization

## Testing

```bash
npm test
```

Includes unit tests for validation, routing, and security features.

## Architecture

- `index.js` — main server
- `protocol.js` — message handling and routing logic
- `validation.js` — signature verification, anti-phishing
- `crypto.js` — Ed25519 utilities
- `geo.js` — geographic distance calculations

## Production Deployment

Use PM2 or Docker:

```bash
# PM2
pm2 start index.js --name intent-relay

# Docker
docker build -t intent-relay .
docker run -p 8080:8080 intent-relay
```

Configure HTTPS reverse proxy (nginx) for WSS support.

---

**Status**: Reference implementation for Intent Protocol v0.2. Production-ready with monitoring and security features.