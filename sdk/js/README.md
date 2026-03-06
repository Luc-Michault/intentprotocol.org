# @intentprotocol/sdk

> Build AI agents that negotiate and transact — in 10 lines of code.

The JavaScript SDK for the [Intent Protocol](https://intentprotocol.org) — an open protocol for autonomous agent-to-agent commerce.

## Install

```bash
npm install @intentprotocol/sdk
```

## Quick Start — Book a Haircut

```javascript
import { PersonalAgent } from '@intentprotocol/sdk';

// Use /v1/ws for the conformant relay (see relay/README.md)
const agent = new PersonalAgent('ws://localhost:3100/v1/ws', 'alice');
await agent.connect();

const bids = await agent.findService({
  action: 'book',
  category: 'services.beauty.haircut',
  budget: { max: 30, currency: 'EUR' },
  where: { lat: 43.3, lon: -0.37, radius_km: 3 },
});

const deal = await agent.acceptBest(bids);
// Done. Haircut booked. ✂️
```

## Quick Start — Run a Salon Agent

```javascript
import { BusinessAgent } from '@intentprotocol/sdk';

const agent = new BusinessAgent('ws://localhost:3100/v1/ws', 'my-salon', {
  name: 'Salon Bella',
  categories: ['services.beauty.haircut'],
  geo: { lat: 43.296, lon: -0.371, radius_km: 15 },
});

await agent.connect();

agent.onIntent(async (rfq) => {
  await agent.bid(rfq.id, {
    price: 28, currency: 'EUR',
    when: '2026-03-06T14:30:00Z',
    service: 'Coupe homme',
    location: { name: 'Salon Bella', address: '12 rue des Arts, Pau' },
  }, {
    deals_completed: 847, rating_avg: 4.7, verified: true,
  });
});
```

## API Reference

### `IntentClient`

The core client class — use this for full control.

```javascript
import { IntentClient } from '@intentprotocol/sdk';

const client = new IntentClient('ws://localhost:3100/v1/ws', {
  autoReconnect: true,  // default: true
});
```

#### Identity

| Method | Description |
|--------|-------------|
| `generateIdentity(name)` | Generate Ed25519 keypair + agent ID |
| `setIdentity(identity)` | Import an existing identity |
| `identity` | Get current identity (getter) |

#### Connection

| Method | Description |
|--------|-------------|
| `await connect()` | Connect to relay via WebSocket |
| `disconnect()` | Close connection |
| `connected` | Connection status (getter) |

#### Personal Agent

| Method | Description |
|--------|-------------|
| `await broadcast(intent, options?)` | Send RFQ, collect bids for `ttl` duration |
| `await accept(bid, settlement?)` | Accept a bid, receive the deal |

#### Business Agent

| Method | Description |
|--------|-------------|
| `await register(profile)` | Register categories + geo + hours |
| `onIntent(callback)` | Listen for incoming RFQs |
| `await bid(rfqId, offer, reputation?)` | Send a bid |

#### Deal Management

| Method | Description |
|--------|-------------|
| `await confirm(dealId, fulfillment?, settlementProof?)` | Send receipt (v0.2: optional settlement_proof) |
| `await cancel(dealId, reason?)` | Cancel a deal |
| `await fetchDealAttestation(dealId)` | Fetch deal attestation from relay (v0.2) |

#### Events

```javascript
client.on('rfq', (rfq) => { /* incoming RFQ */ });
client.on('bid', (bid) => { /* incoming bid */ });
client.on('deal', (deal) => { /* deal confirmed */ });
client.on('delivery_ack', (ack) => { /* v0.2: RFQ routed to N agents */ });
client.on('bid_commitment', (c) => { /* v0.2: bid count + hashes */ });
client.on('bidCommitmentVerified', (r) => { /* v0.2: hash matches */ });
client.on('bid_commitment_mismatch', (r) => { /* v0.2: relay may have dropped bids */ });
client.on('cancel', (cancel) => { /* deal cancelled */ });
client.on('receipt', (receipt) => { /* fulfillment confirmed */ });
client.on('error', (err) => { /* connection error */ });
client.on('connected', () => { /* connected to relay */ });
client.on('disconnected', () => { /* disconnected */ });
```

### `PersonalAgent`

High-level wrapper for consumer agents.

```javascript
const agent = new PersonalAgent(relayUrl, name);
await agent.connect();
const bids = await agent.findService(intent, { ttl: 10 });
const deal = await agent.acceptBest(bids, { strategy: 'balanced' });
```

**Strategies:** `'cheapest'` | `'best_rated'` | `'balanced'` (default)

### `BusinessAgent`

High-level wrapper for service provider agents.

```javascript
const agent = new BusinessAgent(relayUrl, name, profile);
await agent.connect();
agent.onIntent(async (rfq) => { /* respond with bid */ });
agent.onDeal((deal) => { /* handle confirmed deal */ });
```

### Low-level Utilities

```javascript
import { generateKeypair, sign, verify } from '@intentprotocol/sdk';
import { makeRFQ, makeBid, makeAccept, makeReceipt, computeBidsContentHash } from '@intentprotocol/sdk';
import { haversine, geoMatch } from '@intentprotocol/sdk';
import { sanitizeForDisplay, sanitizeBidForDisplay, validateDisplayField } from '@intentprotocol/sdk';
```

**v0.2:** Use `sanitizeBidForDisplay(bid)` before showing bid content to users. Use `confirm(dealId, fulfillment, settlementProof)` to attach a payment reference. Listen to `delivery_ack` and `bid_commitment`; `bidCommitmentVerified` / `bid_commitment_mismatch` indicate whether the relay forwarded all bids.

## Features

- 🔐 **Ed25519 signing** — every message is cryptographically signed
- 🔄 **Auto-reconnect** — transparent reconnection with exponential backoff
- 📡 **Event-driven** — EventEmitter pattern for business agents
- ⏱️ **Promise-based** — `broadcast()` returns bids after TTL
- 📦 **ESM + CJS** — works everywhere
- 🛡️ **v0.2** — proto 0.2, settlement_proof, bid commitment verification, sanitization

## Protocol

Intent Protocol v0.2 — [intentprotocol.org](https://intentprotocol.org). Connect to the conformant relay at `ws://host:port/v1/ws`.

## License

MIT
