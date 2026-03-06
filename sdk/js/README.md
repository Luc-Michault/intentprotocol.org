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

const agent = new PersonalAgent('ws://localhost:3100', 'alice');
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

const agent = new BusinessAgent('ws://localhost:3100', 'my-salon', {
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

const client = new IntentClient('ws://localhost:3100', {
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
| `await confirm(dealId)` | Send fulfillment receipt |
| `await cancel(dealId, reason?)` | Cancel a deal |

#### Events

```javascript
client.on('rfq', (rfq) => { /* incoming RFQ */ });
client.on('bid', (bid) => { /* incoming bid */ });
client.on('deal', (deal) => { /* deal confirmed */ });
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
import { makeRFQ, makeBid, makeAccept } from '@intentprotocol/sdk';
import { haversine, geoMatch } from '@intentprotocol/sdk';
```

## Features

- 🔐 **Ed25519 signing** — every message is cryptographically signed
- 🔄 **Auto-reconnect** — transparent reconnection with exponential backoff
- 📡 **Event-driven** — EventEmitter pattern for business agents
- ⏱️ **Promise-based** — `broadcast()` returns bids after TTL
- 📦 **ESM + CJS** — works everywhere

## Protocol

Based on the Intent Protocol v0.1 — [intentprotocol.org](https://intentprotocol.org)

## License

MIT
