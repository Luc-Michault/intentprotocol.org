# Intent Protocol — Settlement Specification

## 1. Principle

**The protocol negotiates. It does not pay.**

Settlement (payment) is deliberately decoupled from the protocol. The Intent Protocol standardizes how agents find each other and agree on terms. How money moves is pluggable — the protocol supports multiple settlement methods without mandating any.

This is a core design choice: it means the protocol works for a 2€ coffee AND a 50,000€ consulting contract, in Paris AND in Lagos, with Stripe AND with Bitcoin AND with cash.

## 2. Settlement Methods

### 2.1 Direct (No Escrow)

The simplest method. No intermediary. Pay on site, by bank transfer, or however the parties agree.

```json
"settlement": {
  "method": "direct",
  "pay_at": "on_site",            // on_site | before | after
  "payment_accepted": ["card", "cash"]
}
```

**Use cases:** Low-value services (haircut, restaurant), established trust, in-person transactions.
**Risk:** Client no-show, non-payment. Mitigated by reputation system.

### 2.2 Escrow via Stripe

Funds held by Stripe Connect until service completion.

```json
"settlement": {
  "method": "escrow_stripe",
  "provider": "stripe",
  "provider_account": "acct_xxx",
  "amount": 28.00,
  "currency": "EUR",
  "release_on": "receipt_both",    // receipt_both | receipt_provider | auto_48h
  "refund_policy": "free_24h"
}
```

**Flow:**
1. PA's Stripe charges the card → funds held
2. Service is performed
3. Both agents send `receipt` → Stripe releases to provider
4. If dispute → Stripe holds funds pending resolution

**Use cases:** Medium-value services, first-time interactions, no established trust.

### 2.3 Escrow via Crypto

Funds locked in a smart contract until conditions met.

```json
"settlement": {
  "method": "escrow_crypto",
  "chain": "ethereum",            // ethereum | polygon | arbitrum | solana | bitcoin_ln
  "contract": "0x...",
  "amount": "28.00",
  "token": "USDC",
  "release_condition": "dual_receipt",
  "timeout": 172800               // auto-release after 48h if no dispute
}
```

**Flow:**
1. PA locks USDC in escrow contract
2. Service is performed
3. Both agents sign receipt → contract releases funds
4. If timeout → auto-release to provider (default) or refund to client (configurable)

**Use cases:** Cross-border, crypto-native agents, trustless environments.

### 2.4 Escrow via Relay

The relay itself acts as escrow (for relays that offer this service).

```json
"settlement": {
  "method": "escrow_relay",
  "relay": "relay.pau.fr",
  "fee_percent": 0.5,
  "amount": 28.00,
  "currency": "EUR"
}
```

**Use cases:** Small relays serving local communities, relay operator is a known/trusted entity.

### 2.5 Invoice

Provider sends an invoice after service. No upfront payment.

```json
"settlement": {
  "method": "invoice",
  "payment_terms": "net_30",
  "invoice_format": "factur-x"    // factur-x | ubl | plain
}
```

**Use cases:** B2B transactions, professional services, recurring relationships.

## 3. Settlement in the Deal

The settlement method is agreed during the accept phase and recorded in the deal:

```json
{
  "type": "deal",
  "deal": {
    "terms": {
      "price": 28.00,
      "currency": "EUR"
    },
    "settlement": {
      "method": "escrow_stripe",
      "status": "funded",          // pending | funded | released | refunded | disputed
      "funded_at": "2026-03-05T22:30:00Z",
      "provider_ref": "pi_xxx"    // external payment reference
    }
  }
}
```

### Settlement States

```
PENDING → FUNDED → RELEASED
                 → REFUNDED
                 → DISPUTED → RESOLVED_RELEASE
                             → RESOLVED_REFUND
```

## 4. Dispute Resolution

### 4.1 Raising a Dispute

Either party can raise a dispute on an active deal:

```json
{
  "proto": "intent/0.1",
  "type": "cancel",
  "ref": "deal_id",
  "from": "agent:jarvis@relay.openclaw.ai",
  "reason": "service_not_performed",
  "evidence": {
    "description": "Provider did not show up at scheduled time",
    "geo_proof": { "lat": 43.296, "lon": -0.371, "at": "2026-03-06T14:30:00Z" }
  }
}
```

### 4.2 Resolution

Dispute resolution depends on the settlement method:
- **Stripe**: Stripe's dispute process
- **Crypto**: Smart contract arbitration (multisig or oracle)
- **Relay**: Relay operator mediates
- **Direct**: Reputation impact only (no financial recourse in protocol)

### 4.3 Reputation Impact

Regardless of settlement method, disputes affect reputation:
- Dispute raised: flagged on both parties
- Dispute lost: -0.1 to reputation score
- Dispute won: no impact
- Multiple disputes lost: agent may be suspended by relay

## 5. Multi-Currency Support

The protocol is currency-agnostic. Prices are always expressed as:

```json
{
  "amount": 28.00,
  "currency": "EUR"       // ISO 4217 for fiat, symbol for crypto
}
```

Supported currency types:
- **Fiat**: EUR, USD, GBP, JPY, etc. (ISO 4217)
- **Crypto**: BTC, ETH, USDC, USDT, SOL, etc.
- **Custom**: Loyalty points, credits, etc. (prefixed with `x-`)

Currency conversion is NOT handled by the protocol. If PA offers EUR and BA wants USD, either:
1. One agent converts (outside protocol)
2. They agree on a common currency in the negotiation phase
3. A relay offers conversion as a premium service

## 6. Zero Settlement

Some intents don't involve money:

```json
"settlement": {
  "method": "none"
}
```

**Use cases:** Information requests, free events, volunteer coordination, barter.
