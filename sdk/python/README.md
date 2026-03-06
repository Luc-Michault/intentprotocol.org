# intentprotocol

> Build AI agents that negotiate and transact — Intent Protocol SDK for Python.

## Install

```bash
pip install intentprotocol
```

## Quick Start — Book a Haircut

```python
import asyncio
from intentprotocol import IntentClient, RFQ

async def main():
    client = IntentClient("ws://localhost:3100")
    client.generate_identity("alice")
    await client.connect()

    bids = await client.broadcast(RFQ(
        action="book",
        category="services.beauty.haircut",
        budget={"max": 30, "currency": "EUR"},
        where={"lat": 43.3, "lon": -0.37, "radius_km": 3},
    ))

    best = max(bids, key=lambda b: b.score)
    deal = await client.accept(best)
    # Done. Haircut booked. ✂️

asyncio.run(main())
```

## Quick Start — Run a Salon Agent

```python
import asyncio
from intentprotocol import IntentClient, BusinessProfile

async def main():
    client = IntentClient("ws://localhost:3100")
    client.generate_identity("my-salon")
    await client.connect()

    await client.register(BusinessProfile(
        name="Salon Bella",
        categories=["services.beauty.haircut"],
        geo={"lat": 43.296, "lon": -0.371, "radius_km": 15},
    ))

    async def handle_rfq(rfq):
        await client.bid(rfq["id"], {
            "price": 28, "currency": "EUR",
            "when": "2026-03-06T14:30:00Z",
            "service": "Coupe homme",
        }, to=rfq["from"])

    await client.on_intent(handle_rfq)

    # Keep alive
    await asyncio.Future()  # Run forever

asyncio.run(main())
```

## API Reference

### `IntentClient`

```python
client = IntentClient(relay_url, auto_reconnect=True)
```

#### Identity

| Method | Description |
|--------|-------------|
| `generate_identity(name)` | Generate Ed25519 keypair + agent ID |
| `set_identity(identity)` | Import an existing identity |
| `identity` | Current identity (property) |

#### Connection

| Method | Description |
|--------|-------------|
| `await connect()` | Connect to relay via WebSocket |
| `await disconnect()` | Close connection |
| `connected` | Connection status (property) |

#### Personal Agent

| Method | Description |
|--------|-------------|
| `await broadcast(rfq, timeout=30)` | Send RFQ, collect bids |
| `await accept(bid, settlement=None)` | Accept a bid, receive deal |

#### Business Agent

| Method | Description |
|--------|-------------|
| `await register(profile)` | Register business profile |
| `await on_intent(callback)` | Listen for incoming RFQs |
| `await bid(rfq_id, offer, reputation=None)` | Send a bid |

#### Deal Management

| Method | Description |
|--------|-------------|
| `await confirm(deal_id)` | Send fulfillment receipt |
| `await cancel(deal_id, reason=None)` | Cancel a deal |

#### Events

```python
client.on("rfq", handler)        # Incoming RFQ
client.on("bid", handler)        # Incoming bid
client.on("deal", handler)       # Deal confirmed
client.on("cancel", handler)     # Deal cancelled
client.on("receipt", handler)    # Fulfillment confirmed
client.on("error", handler)      # Error
client.on("connected", handler)  # Connected
client.on("disconnected", handler)  # Disconnected
```

### Data Types

All types are Python `dataclasses`:

- `RFQ` — Request For Quote
- `Bid` — Received bid (with `.score`)
- `Deal` — Confirmed deal
- `Offer` — Bid offer details
- `Reputation` — Agent reputation
- `Settlement` — Payment terms
- `BusinessProfile` — Business registration
- `AgentIdentity` — Agent keypair + metadata
- `When`, `Where`, `Budget` — Intent constraints

### Low-level Utilities

```python
from intentprotocol import generate_keypair, sign, verify
from intentprotocol import make_rfq, make_bid, make_accept
from intentprotocol import haversine, geo_match
```

## Requirements

- Python 3.10+
- `websockets >= 12.0`
- `pynacl >= 1.5.0`

## Features

- 🔐 **Ed25519 signing** — every message is cryptographically signed
- 🔄 **Auto-reconnect** — transparent reconnection
- 📡 **Async-first** — built on asyncio + websockets
- 🏷️ **Type hints** — full type annotations with dataclasses
- 📊 **Bid scoring** — automatic composite scoring

## Protocol

Based on the Intent Protocol v0.1 — [intentprotocol.org](https://intentprotocol.org)

## License

MIT
