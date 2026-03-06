# Intent Protocol Specification v0.1

**Status:** Draft
**Author:** Luc Michault
**Date:** March 2026
**License:** MIT

## Overview

The Intent Protocol (IP) is an open standard for AI agent-to-agent negotiation and transaction settlement. It enables any AI agent to declare an intention, receive competing offers, and finalize a deal — in milliseconds, with zero human intervention during the negotiation phase.

## Design Principles

1. **Simple first** — JSON over WebSocket. A junior dev can implement a basic agent in an afternoon.
2. **No blockchain required** — Settlement is pluggable. Stripe, bank transfer, crypto, cash — the protocol doesn't care.
3. **No token required** — The protocol runs on standard currencies. No proprietary token tax.
4. **Federated, not centralized** — Anyone can run a relay. Relays sync with each other. Like email.
5. **No LLM in the loop** — The LLM translates human intent into structured JSON *before* the protocol. The protocol itself is deterministic matching — fast and free.
6. **Privacy by default** — Agents negotiate pseudonymously. Real identities revealed only at settlement, only to counterparty.

## Documents

| Document | Description |
|----------|-------------|
| [PROTOCOL.md](./PROTOCOL.md) | Core protocol specification — message types, flows, lifecycle |
| [SCHEMAS.md](./SCHEMAS.md) | JSON Schema definitions for all message types |
| [RELAY.md](./RELAY.md) | Relay server specification — routing, federation, registration |
| [IDENTITY.md](./IDENTITY.md) | Agent identity, keypairs, reputation |
| [SETTLEMENT.md](./SETTLEMENT.md) | Settlement layer — escrow, payment, dispute resolution |
| [EXAMPLES.md](./EXAMPLES.md) | Complete transaction examples across different verticals |

## Quick Start

```
Human: "Find me a haircut tomorrow at 2pm, under 30€, within 2km"
    ↓ (LLM translates to structured intent)
Agent A → Relay: RFQ { category: "haircut", budget: 30, when: "2026-03-06T14:00" }
    ↓ (relay routes to matching business agents)
Agent B → Agent A: BID { price: 28, when: "14:30", service: "Mens haircut" }
Agent C → Agent A: BID { price: 32, when: "14:00" } ← rejected (over budget)
    ↓ (agent A selects best bid)
Agent A ↔ Agent B: DEAL { signed terms }
    ↓ (optional: settlement via escrow provider)
Done. 3 messages. < 1 second.
```

## Architecture

```
                    ┌─────────────┐
                    │  Relay EU   │
                    │  (Paris)    │
                    └──────┬──────┘
                           │ federation
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
   │  Relay    │    │  Relay    │    │  Relay    │
   │  (Paris)   │    │ (Berlin) │    │ (London) │
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                 │                 │
    ┌────┴────┐       ┌────┴────┐       ┌────┴────┐
    │Agent A  │       │Agent B  │       │Agent C  │
    │(client) │       │(salon)  │       │(salon)  │
    └─────────┘       └─────────┘       └─────────┘
```

Relays are lightweight servers (~50MB RAM) that route intents between agents. Anyone can run one. They form a federated mesh — like email servers or Matrix homeservers.
