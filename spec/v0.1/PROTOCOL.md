# Intent Protocol — Core Specification

## 1. Terminology

| Term | Definition |
|------|-----------|
| **Agent** | An autonomous software entity acting on behalf of a human or organization |
| **Personal Agent (PA)** | Agent representing a consumer/client |
| **Business Agent (BA)** | Agent representing a service provider, merchant, or organization |
| **Relay** | A server that routes intent messages between agents |
| **RFQ** | Request For Quote — an agent broadcasting an intention to the network |
| **Bid** | A response to an RFQ containing a concrete offer |
| **Deal** | A mutually signed agreement between two agents |
| **Intent** | A structured description of what an agent wants to accomplish |
| **TTL** | Time To Live — how long a message remains valid (seconds) |

## 2. Protocol Version

All messages include a `proto` field indicating the protocol version:
```
"proto": "intent/0.1"
```

## 3. Transport

### 3.1 Primary: WebSocket
- Agents connect to their home relay via WebSocket (`wss://`)
- Persistent connection for real-time message delivery
- Heartbeat every 30 seconds to maintain connection

### 3.2 Fallback: HTTP REST
- For agents that can't maintain WebSocket connections
- `POST /v1/messages` to send
- `GET /v1/messages?since={timestamp}` to poll
- Long-polling supported via `GET /v1/messages/stream`

### 3.3 Encoding
- JSON (UTF-8) for readability and developer adoption
- Optional: Protobuf for high-throughput relays (same schema, binary encoding)
- Content-Type: `application/intent+json` or `application/intent+protobuf`

## 4. Message Types

The protocol defines 9 message types:

| Type | Direction | Purpose |
|------|-----------|---------|
| `rfq` | PA → Relay → BAs | Broadcast an intention |
| `bid` | BA → Relay → PA | Respond with an offer |
| `accept` | PA → Relay → BA | Accept a bid |
| `deal` | Mutual | Signed agreement (generated from accept) |
| `cancel` | Either → Relay | Cancel an RFQ, bid, or deal (within terms) |
| `receipt` | Either → Relay | Confirm real-world fulfillment |
| `delivery_ack` | Relay → PA | Confirm RFQ was routed to N agents (see SECURITY.md §3.1.A) |
| `bid_commitment` | Relay → PA | Precommit bid count + hash before forwarding bids (see SECURITY.md §3.1.B) |
| `report` | Any → Relay | Report a malicious agent (see SECURITY.md §10.1.C) |

## 5. Message Flow

### 5.1 Standard Flow (Happy Path)

```
  Personal Agent              Relay              Business Agent(s)
       │                        │                        │
       │──── RFQ ──────────────>│                        │
       │                        │──── RFQ ──────────────>│ (routed by category+geo)
       │                        │                        │
       │                        │<───── BID ─────────────│ Agent B
       │<───── BID ─────────────│                        │
       │                        │<───── BID ─────────────│ Agent C
       │<───── BID ─────────────│                        │
       │                        │                        │
       │──── ACCEPT (bid B) ───>│                        │
       │                        │──── DEAL ─────────────>│ Agent B
       │<───── DEAL ────────────│                        │
       │                        │──── CANCEL ───────────>│ Agent C (auto-reject)
       │                        │                        │
       │         ... service is performed ...            │
       │                        │                        │
       │──── RECEIPT ──────────>│                        │
       │                        │──── RECEIPT ──────────>│ Agent B
       │                        │                        │
```

### 5.2 Negotiation Flow (Counter-offers)

If a PA likes a bid but wants to negotiate:

```
  PA                          Relay                        BA
   │──── RFQ ────────────────>│──────────────────────────>│
   │<──── BID (35€) ──────────│<──────────────────────────│
   │──── RFQ (updated, 30€) ─>│──────────────────────────>│  ← counter-offer
   │<──── BID (32€) ──────────│<──────────────────────────│  ← revised bid
   │──── RFQ (updated, 30€) ─>│──────────────────────────>│  ← final offer
   │<──── BID (30€) ──────────│<──────────────────────────│  ← accepted
   │──── ACCEPT ─────────────>│──────────────────────────>│
```

Counter-offers are just new RFQs referencing the original (`ref` field). Max 5 rounds to prevent spam.

### 5.3 Timeout Flow

```
  PA                          Relay                        BA
   │──── RFQ (ttl: 30s) ─────>│──────────────────────────>│
   │                           │          ... 30 seconds pass, no bids ...
   │<──── EXPIRED ─────────────│                           │
```

The relay sends an `EXPIRED` notification when TTL runs out with no accepted bid.

## 6. Core Message Fields

Every message MUST include:

```json
{
  "proto": "intent/0.1",       // Protocol version
  "type": "rfq|bid|accept|deal|cancel|receipt",
  "id": "ulid_or_uuid",       // Unique message ID
  "ref": null,                 // Reference to parent message (null for initial RFQ)
  "from": "agent:name@relay",  // Sender identity
  "ts": 1741214400,            // Unix timestamp (seconds)
  "ttl": 30,                   // Seconds until expiry (0 = no expiry)
  "sig": "ed25519:base64..."   // Signature of the message body
}
```

## 7. Routing

### 7.1 Category-based routing
Business agents register their categories on their home relay:
```json
{
  "categories": ["haircut", "barber", "beauty"],
  "geo": { "lat": 43.3, "lon": -0.37, "radius_km": 15 }
}
```

When an RFQ arrives, the relay matches:
1. Category intersection (RFQ category ∈ BA categories)
2. Geographic overlap (RFQ location within BA service radius)
3. Budget compatibility (RFQ max budget ≥ BA minimum price, if declared)

### 7.2 Federation routing
If no local BA matches, the relay forwards the RFQ to federated relays:
- Relay A (Paris) → Relay B (Berlin) if geo radius extends there
- Max federation hops: 3 (prevents infinite propagation)
- Each relay adds itself to a `via` array to prevent loops

### 7.3 Category taxonomy
Categories follow a hierarchical dot-notation:
```
services.beauty.haircut
services.beauty.nails
services.health.dentist
services.health.physio
services.food.restaurant
services.food.catering
services.home.plumber
services.home.electrician
goods.electronics.phone
goods.clothing.shoes
```

A BA registered for `services.beauty` receives RFQs for all sub-categories. A BA registered for `services.beauty.haircut` only receives haircut RFQs.

## 8. Constraints System

RFQ constraints are the core of intent expression. They are structured, machine-parseable, and composable:

### 8.1 Temporal constraints
```json
"when": {
  "after": "2026-03-06T13:00:00Z",
  "before": "2026-03-06T17:00:00Z",
  "duration_min": 30,
  "prefer": "earliest"         // earliest | latest | cheapest
}
```

### 8.2 Geographic constraints
```json
"where": {
  "lat": 43.295,
  "lon": -0.370,
  "radius_km": 3,
  "mode": "provider_location"  // provider_location | client_location | remote
}
```

### 8.3 Budget constraints
```json
"budget": {
  "max": 30,
  "currency": "EUR",
  "prefer": "cheapest"        // cheapest | best_rated | fastest
}
```

### 8.4 Custom constraints (extensible)
```json
"specs": {
  "service": "coupe homme",
  "extras": ["barbe"],
  "language": "fr",
  "accessibility": ["wheelchair"]
}
```

The `specs` field is category-specific and free-form. The protocol doesn't validate its contents — that's between the agents.

## 9. Deal Finalization

When a PA sends an `accept` for a bid, the relay generates a `deal` message containing:

1. The original RFQ (stripped of other bids)
2. The accepted bid
3. Both agent signatures
4. A unique deal ID
5. Settlement instructions (if any)

The deal is stored by the relay and serves as the canonical record. Both agents receive a copy.

### 9.1 Deal states

```
PENDING → ACTIVE → FULFILLED
                 → DISPUTED
                 → CANCELLED
```

- **PENDING**: Deal signed, waiting for execution time
- **ACTIVE**: Within execution window
- **FULFILLED**: Both parties confirmed completion (via `receipt`)
- **DISPUTED**: One party raised a dispute
- **CANCELLED**: Cancelled within allowed terms

## 10. Error Handling

Standard error codes:

| Code | Meaning |
|------|---------|
| `E_EXPIRED` | Message TTL exceeded |
| `E_NO_MATCH` | No business agents match the RFQ |
| `E_BUDGET` | No bids within budget constraints |
| `E_INVALID` | Malformed message |
| `E_AUTH` | Invalid signature or unknown agent |
| `E_RATE` | Rate limit exceeded |
| `E_FEDERATION` | Relay federation error |

## 11. Rate Limiting

To prevent spam and Sybil attacks:
- Personal agents: max 10 RFQs per minute
- Business agents: max 100 bids per minute
- Counter-offers: max 5 rounds per RFQ
- Relays MAY impose additional limits

## 12. Security

### 12.1 Authentication
- Every message is signed with the sender's Ed25519 private key
- Relays verify signatures before routing
- Agent identity = public key (like Nostr npub)

### 12.2 Encryption
- Transport: TLS 1.3 (relay ↔ agent)
- Message-level: Optional NaCl box encryption for sensitive fields (budget, specs)
- Relay can route encrypted messages without reading contents (envelope routing)

### 12.3 Privacy
- Agents are pseudonymous by default (identified by public key only)
- Real identity (name, address, phone) exchanged only in the `deal` phase, only to counterparty
- Relays MUST NOT store message contents after TTL expiry (ephemeral by default)
- Persistent storage only for active deals
- Geo coordinates in RFQs SHOULD be rounded to 2 decimal places (~1km precision)
- Budget field is OPTIONAL — PAs can omit it and filter bids locally

### 12.4 Relay Accountability (see SECURITY.md §3)
- Relays MUST send `delivery_ack` after routing an RFQ (agent count)
- Relays MUST send `bid_commitment` (count + hash) before forwarding bids
- Relays MUST publish stats on `GET /v1/stats`
- Relays MUST enforce: `radius_km ≤ 500`, `TTL ≤ 120s`, message size ≤ 8KB

### 12.5 Input Validation (see SECURITY.md §5)
- `specs` fields are validated against category schemas (MANDATORY)
- Control characters forbidden in all string values
- Free-text fields limited to 100 chars with restricted charset
- Agents MUST NOT pass protocol fields as raw text to LLMs (RULE-INJECT-01)

## 13. Versioning

- Protocol versions follow semver: `intent/0.1`, `intent/0.2`, `intent/1.0`
- Agents MUST include `proto` in every message
- Relays MUST support at least the current major version and one previous
- Breaking changes increment major version
