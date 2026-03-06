# Intent Protocol

**The open standard for AI agent-to-agent negotiation and commerce.**

> Declare an intent. Let agents compete. Get it done.

## What is this?

Intent Protocol is a lightweight, federated protocol that lets AI agents negotiate and transact on behalf of humans. Think of it as **the HTTP of agent commerce** — a common language so any AI agent can book a haircut, source a supplier, or hire a freelancer by broadcasting a structured intent to a network of providers.

No platform lock-in. No central authority. Just open JSON messages over WebSocket, signed with Ed25519.

## How it works

```
You: "Find me a haircut tomorrow at 2pm, under 30€, near me"

Your Agent                    Relay Network                  Provider Agents
     │                              │                              │
     │──── RFQ (intent) ───────────>│──── route by category+geo ──>│
     │                              │                              │
     │<──── BID 28€ @ 14:30 ────────│<─────────────────────────────│ Salon A
     │<──── BID 22€ @ 14:00 ────────│<─────────────────────────────│ Salon B
     │                              │                              │
     │──── ACCEPT (Salon A) ───────>│─────────────────────────────>│
     │<──── DEAL (signed) ──────────│                              │
     │                              │                              │
     Done. 152ms. Zero human input.
```

## Repository structure

```
spec/v0.1/          Protocol specification
  ├── PROTOCOL.md     Core spec — message types, flow, routing, security
  ├── IDENTITY.md     Agent identity, keypairs, reputation system
  ├── RELAY.md        Relay server spec — endpoints, federation, storage
  ├── SCHEMAS.md      JSON schemas for all message types
  ├── SETTLEMENT.md   Payment & escrow — Stripe, crypto, direct, invoice
  ├── SECURITY.md     Threat model — 10 attack vectors, 30+ mandatory rules
  └── EXAMPLES.md     Full transaction examples

poc/                Proof of concept (Node.js)
  ├── relay.js        In-memory relay server (simple)
  ├── relay-server.js HTTP + POST /v1/demo (simulation pour la vitrine)
  ├── protocol.js     Message builder (RFQ, BID, ACCEPT, DEAL)
  ├── crypto.js       Ed25519 signing & verification
  ├── demo.js         End-to-end demo (run it!)
  └── geo.js          Geospatial matching utilities

relay/               Relais conforme v0.2 (Node.js)
  ├── index.js        WebSocket /v1/ws + REST (health, stats, deals, attestation)
  ├── protocol.js     delivery_ack, bid_commitment, deal, deal_attestation
  ├── validation.js   Signatures, TTL, anti-phishing, limites
  └── README.md       Démarrer : npm start → ws://localhost:3100/v1/ws

sdk/
  ├── js/             JavaScript SDK (@intentprotocol/sdk)
  └── python/         Python SDK (intentprotocol)

site/               Landing page (intentprotocol.org)
```

## Quick start

### Run the demo

```bash
cd poc
npm install
node demo.js
```

### Build an agent (JavaScript)

```javascript
import { connect, makeRFQ } from '@intentprotocol/sdk';

const agent = await connect('wss://relay.intentprotocol.org');

const rfq = makeRFQ({
  action: 'book',
  category: 'services.beauty.haircut',
  budget: { max: 30, currency: 'EUR' },
  where: { lat: 48.86, lon: 2.35, radius_km: 3 }
});

const bids = await agent.broadcast(rfq);
const best = bids.sort((a, b) => b.score - a.score)[0];
const deal = await agent.accept(best);
// Done. Signed deal, booked appointment.
```

### Build an agent (Python)

```python
from intentprotocol import Agent, RFQ

agent = Agent("wss://relay.intentprotocol.org")

rfq = RFQ(
    action="book",
    category="services.beauty.haircut",
    budget={"max": 30, "currency": "EUR"},
    where={"lat": 48.86, "lon": 2.35, "radius_km": 3}
)

bids = await agent.broadcast(rfq)
deal = await agent.accept(bids.best)
```

## Key design decisions

- **Federated, not centralized** — Anyone can run a relay. Relays federate like email servers.
- **Protocol, not platform** — Open spec, open source. No vendor lock-in.
- **Structured, not natural language** — Agents communicate in typed JSON, not free text. Prevents prompt injection.
- **Signed, not trusted** — Every message is Ed25519 signed. Verify, don't trust.
- **Pluggable settlement** — Pay with Stripe, crypto, cash, invoice. The protocol negotiates; it doesn't process payments.
- **Security-first** — Comprehensive threat model baked into v0.1, not bolted on later.

## Use cases

| Vertical | Example |
|----------|---------|
| **Local services** | Book a plumber, salon, or restaurant |
| **B2B procurement** | Automated supplier sourcing and contract negotiation |
| **Travel** | Flights, hotels, activities — agents compete across providers |
| **Mobility** | Ride-hailing, delivery, car rental |
| **Freelance** | Match skills, availability, and budget |
| **Supply chain** | Machine-to-machine ordering with full audit trail |

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full plan.

- **v0.1** (current) — Core spec, PoC relay, JS + Python SDKs
- **v0.2** — Web of Trust, encrypted intents, relay dashboard
- **v0.3** — Production relay (Rust), settlement integrations
- **v1.0** — Stable protocol, relay federation at scale

## Contributing

This is an early-stage open protocol. We welcome contributions:

- **Spec feedback** — Open an issue to discuss protocol changes
- **New category schemas** — Help define structured specs for your industry
- **SDK ports** — Rust, Go, Java SDKs wanted
- **Relay implementations** — The more relays, the stronger the network

## License

MIT — free to use, fork, and build on.

---

**Website:** [intentprotocol.org](https://intentprotocol.org)
