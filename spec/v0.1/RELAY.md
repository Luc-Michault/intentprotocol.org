# Intent Protocol — Relay Specification

## 1. What is a Relay?

A relay is a lightweight server that:
1. Accepts WebSocket connections from agents
2. Routes RFQs to matching business agents (by category + geo)
3. Routes bids back to the requesting personal agent
4. Generates and stores deals
5. Federates with other relays for broader geographic coverage

A relay is NOT:
- A blockchain node
- A payment processor
- An AI model
- A single point of failure (the network is federated)

## 2. Relay Requirements

### 2.1 Minimum Spec
- Runtime: Node.js 20+ or Rust
- RAM: ~50MB idle, ~200MB under load
- Storage: ~1GB for active deals + agent registry
- Network: WebSocket support, TLS 1.3
- No GPU, no heavy compute

### 2.2 Endpoints

```
WebSocket:
  wss://relay.example.com/v1/ws          Agent connection

REST API:
  POST   /v1/register                    Register an agent
  DELETE /v1/register/{agent_id}         Unregister
  POST   /v1/messages                    Send a message (HTTP fallback)
  GET    /v1/messages?since={ts}         Poll messages (HTTP fallback)
  GET    /v1/messages/stream             Long-poll / SSE
  GET    /v1/deals/{deal_id}             Retrieve a deal
  GET    /v1/categories                  List supported categories
  GET    /v1/health                      Relay health check
  GET    /v1/info                        Relay metadata (name, geo, federation peers)
```

## 3. Agent Registration

### 3.1 Business Agent Registration

```json
POST /v1/register
{
  "agent_id": "agent:salon-bella@relay.pau.fr",
  "pubkey": "ed25519:abc123...",
  "type": "business",
  "profile": {
    "name": "Salon Bella",
    "categories": ["services.beauty.haircut", "services.beauty.nails"],
    "geo": {
      "lat": 43.296,
      "lon": -0.371,
      "radius_km": 15
    },
    "hours": {
      "mon": ["09:00-19:00"],
      "tue": ["09:00-19:00"],
      "wed": null,
      "thu": ["09:00-19:00"],
      "fri": ["09:00-19:00"],
      "sat": ["09:00-17:00"],
      "sun": null
    },
    "min_price": { "EUR": 15 },
    "languages": ["fr", "en"],
    "payment_methods": ["card", "cash"]
  },
  "sig": "ed25519:..."
}
```

### 3.2 Personal Agent Registration

```json
POST /v1/register
{
  "agent_id": "agent:jarvis@relay.openclaw.ai",
  "pubkey": "ed25519:def456...",
  "type": "personal",
  "home_relay": "relay.openclaw.ai",
  "sig": "ed25519:..."
}
```

Personal agents have minimal profiles. Their preferences are expressed per-RFQ.

## 4. Routing Algorithm

When a relay receives an RFQ:

```
1. Parse intent.category and intent.where
2. Query local agent registry:
   - category MATCH (exact or parent category)
   - geo OVERLAP (RFQ radius intersects BA service area)
   - budget COMPATIBLE (RFQ max >= BA min_price, if set)
   - schedule COMPATIBLE (RFQ time window overlaps BA hours)
3. For each matching BA:
   - Forward RFQ via WebSocket (or queue for HTTP poll)
4. If local matches < threshold AND geo extends beyond local:
   - Forward to federated relays (see §5)
5. Set timer for RFQ TTL
   - On expiry: send E_EXPIRED to PA if no bids accepted
```

### 4.1 Scoring (optional)

Relays MAY rank which BAs receive the RFQ first based on:
- Reputation score
- Geographic proximity
- Response rate (historical)
- Premium status (if relay offers paid tiers)

This ranking is relay-specific and not part of the core protocol.

## 5. Federation

### 5.1 Peering

Relays discover each other via:
1. **Static config**: Relay operator lists known peers
2. **DNS discovery**: `_intent-relay._tcp.pau.fr` SRV records
3. **Relay registry**: A public list at `relays.intentprotocol.org` (bootstrap only)

### 5.2 Federation Protocol

```json
// Relay A forwards an RFQ to Relay B
{
  "proto": "intent/0.1",
  "type": "rfq",
  "id": "01JQXYZ123ABC",
  "from": "agent:jarvis@relay.openclaw.ai",
  "via": ["relay.openclaw.ai", "relay.pau.fr"],
  "ts": 1741276800,
  "ttl": 25,
  "sig": "ed25519:...",
  "intent": { ... }
}
```

Rules:
- Max `via` length: 3 (max 3 hops)
- Relay MUST NOT forward if already in `via` (loop prevention)
- Relay MUST decrement TTL proportionally to processing time
- Relay MUST verify original signature before forwarding

### 5.3 Bid Return Path

Bids follow the reverse `via` path back to the originating relay:

```
BA (Bordeaux) → Relay Bordeaux → Relay Pau → Relay OpenClaw → PA
```

Each relay in the chain forwards the bid to the previous hop.

## 6. Storage

### 6.1 Ephemeral (default)
- RFQs: deleted after TTL expiry
- Bids: deleted after TTL expiry or deal finalization
- Messages are NOT persisted unless part of an active deal

### 6.2 Persistent
- Deals: stored until `FULFILLED` or `CANCELLED` + 30 days
- Agent registrations: stored until unregistered
- Reputation data: aggregated, stored indefinitely

### 6.3 Privacy
- Relays MUST NOT log message contents beyond what's needed for routing
- Relays MUST delete expired messages promptly
- Relays SHOULD support encrypted messages (envelope routing without content access)

## 7. Relay Economics

Relays can be run for free (community/hobby) or as a business:

### 7.1 Free tier (community relay)
- Basic routing, no SLA
- Rate-limited (10 RFQ/min per agent)

### 7.2 Paid tier (commercial relay)
- Higher rate limits
- Priority routing (business agents appear first)
- Analytics dashboard
- SLA guarantees (99.9% uptime)
- Settlement-as-a-service (escrow)
- Verified business badges

### 7.3 Revenue model for relay operators
- Monthly subscription from business agents
- Per-settlement fee (0.1-0.5%) if providing escrow
- Premium features (analytics, priority, verification)
- Whitelabel relay for platforms (Doctolib, Uber, etc.)

The protocol itself is free. Relay operators choose their own business model.

## 8. Reference Implementation

A reference relay implementation will be provided in:
- **Node.js** (TypeScript) — for rapid adoption
- **Rust** — for high-throughput production deployments

Minimum viable relay: ~500 lines of TypeScript.
