# Intent Protocol — v0.2 Changes (Delta from v0.1)

**v0.2 Goal**: Strengthen the protocol foundation to be **simple to deploy**, **complete for building real solutions**, and **security-reliable**. No breaking changes to the RFQ → BID → ACCEPT → DEAL flow; only additions and hardening.

The protocol version for v0.2 is: `"proto": "intent/0.2"`. v0.2 relays accept `intent/0.1` messages for reading (backward compatibility) but emit in `intent/0.2`.

---

## 1. Settlement proof (deal ↔ payment link)

### Problem
A signed deal has no verifiable link to payment (Stripe, crypto, transfer). Disputes and auditing are difficult.

### Change

**Receipt** — New optional `settlement_proof` field:

```json
{
  "type": "receipt",
  "ref": "01JQXYZ999JKL",
  "fulfillment": { "completed": true, "actual_price": 28.00 },
  "settlement_proof": {
    "method": "stripe",
    "reference": "pi_3ABC123...",
    "amount": 28.00,
    "currency": "EUR"
  }
}
```

| Field       | Required | Description |
|-------------|----------|-------------|
| `method`    | Yes      | `stripe` \| `escrow_crypto` \| `bank_transfer` \| `invoice` \| `on_site` \| `other` |
| `reference` | If applicable | Transaction ID (payment_intent, tx_hash, invoice_id) — max 128 chars |
| `amount`    | Recommended | Amount actually paid |
| `currency`  | Recommended | ISO 4217 currency code |

- If payment is "on-site" or "to be settled later", `method: "on_site"` or `"invoice"`, `reference` can be empty.
- Relays MAY require `settlement_proof` for deals above a threshold (e.g. > €500) according to their policy.

**Rule**: Agents and relays implementing escrow (Stripe, crypto) MUST fill `settlement_proof` with a verifiable reference when available.

---

## 2. Deal attestations (verifiable cross-relay reputation)

### Problem
Reputation relies on local relay data. A BA can inflate their reputation with self-generated "cross-relay" deals.

### Change

**Attestation format** — Each relay finalizing a deal (FULFILLED state) produces a signed **Deal Attestation**:

```json
{
  "type": "deal_attestation",
  "proto": "intent/0.2",
  "deal_id": "01JQXYZ999JKL",
  "rfq_id": "01JQXYZ123ABC",
  "client": "agent:jarvis@relay.openclaw.ai",
  "provider": "agent:salon-bella@relay.pau.fr",
  "relay": "relay.pau.fr",
  "amount": 28.00,
  "currency": "EUR",
  "state": "FULFILLED",
  "ts": 1741281600,
  "sig": "ed25519:relay_sig..."
}
```

- Signature = relay (relay's private key).
- Relays MAY publish attestations on a `GET /v1/deals/{deal_id}/attestation` endpoint or exchange them with peer relays in federation.
- For reputation calculation: a consumer (other relay, directory, BA) can verify attestations by signature and derive `cross_relay_deals` / `diversity_factor` without trusting a single relay.

**Rule**: A v0.2 compliant relay MUST generate and sign a `deal_attestation` when a deal moves to FULFILLED. It MAY store them locally and expose via API; inter-relay exchange is RECOMMENDED for federation.

---

## 3. Anti-phishing (user-displayed fields)

### Problem
Fields like `location.name`, `location.address`, and any text displayed to users can contain URLs, phone numbers, or social engineering instructions.

### Change

**Content rules (SCHEMAS + SECURITY)**:

| Field (examples)     | Explicit prohibitions |
|----------------------|----------------------|
| `location.name`      | No URLs (http, https, www), no phone number patterns (E.164, spaced), max 100 chars |
| `location.address`   | Same, max 200 chars |
| `offer.service`      | Same (no URL, no phone), max 200 chars |
| Any free field in `offer` or `reputation` displayed to humans | Same |

- **Validation**: Relays MUST reject (E_INVALID) messages where these fields contain URLs or phone patterns (regex to be defined in SECURITY.md v0.2).
- **SDK**: SDKs MUST provide sanitization function (strip URLs, mask or reject phone patterns) and apply it by default before displaying to user.

**Indicative regex** (to be refined):
- URL: `https?://\S+` or presence of `\.(com|fr|org|net)\b`
- Phone: sequence of 8+ digits with possible spaces, dots, dashes

---

## 4. Enhanced bid commitment

### Problem
A relay can claim to have received N bids and only forward N-1; the PA cannot prove a missing bid existed.

### Change

**bid_commitment** — In addition to `bid_count` and `bid_ids_hash`, relay MUST include commitment on bid **content**:

```json
{
  "type": "bid_commitment",
  "ref": "rfq_id",
  "bid_count": 5,
  "bid_ids_hash": "sha256:...",
  "bids_content_hash": "sha256:...",
  "sig": "ed25519:relay_sig..."
}
```

- `bids_content_hash` = `SHA256(concat(sort(bid_id, from, price, currency for each bid)))` — canonical order (sort by bid_id). This way the PA can verify that the set of received bids matches the commitment; if relay omits a bid, hash won't match.
- Relays MUST send `bid_commitment` before forwarding first bids. PAs SHOULD verify hash once all bids received (or at TTL expiration).

---

## 5. Versioned Category Schema Registry

### Problem
Category schemas can diverge between relays; no version reference in messages.

### Change

- **Registry**: Category schemas are versioned JSON Schema files, e.g. `schemas/services.beauty.haircut/v1.0.json`. Protocol or community hosts registry (repo, CDN).
- **RFQ**: Optional `intent.category_schema_version` field:
  ```json
  "intent": {
    "category": "services.beauty.haircut",
    "category_schema_version": "1.0",
    ...
  }
  ```
  If absent, relay uses latest known version for this category.
- **Validation**: Relay validates `specs` against schema of requested version (or default). If version doesn't exist, E_INVALID.

This allows category evolution without breaking old agents (they pin a version).

---

## 6. Reputation and griefing (cancellations by counterparty)

### Problem
An attacker can create multiple PAs, accept deals with a BA then cancel to degrade their `cancellation_rate`.

### Change

- **Counterparty counting**: `cancellation_rate_as_provider` (and equivalents) MUST be calculated by weighting cancellations by **counterparty identity**: same PA canceling 10 times counts as one "canceling counterparty" for the ratio, not 10. Indicative formula:
  - `cancellation_rate = unique_cancelling_counterparties / unique_counterparties_with_deals`
  or variant that limits impact of single malicious PA.
- **Documentation**: SECURITY.md v0.2 describes this rule and recommends exposing `cancellation_rate_by_counterparty` (or equivalent) so PAs can evaluate a BA.

---

## 7. Compliance and implementation

### 7.1 Minimal compliant relay

A reference implementation (Node or Rust) MUST exist that:

- Accepts WebSocket connections from agents.
- Registers agents (PA/BA), routes by category + geo.
- Sends **delivery_ack** (number of routed BAs) after routing an RFQ.
- Sends **bid_commitment** (bid_count, bid_ids_hash, bids_content_hash) before sending bids to PA.
- Generates signed **deal** and **deal_attestation** at finalization.
- Validates messages (signatures, TTL, sizes, anti-phishing fields).
- Doesn't necessarily implement federation in v0.2 (can be next phase).

This relay serves as reference for conformance tests and SPEC_VS_POC checklist.

### 7.2 SPEC_VS_POC (documentation)

A **SPEC_VS_POC.md** document (in `spec/` or `doc/`) lists each MUST/SHOULD requirement from v0.1 spec (and v0.2) with status in each implementation:

- **PoC demo** (current relay-server.js): simulated / absent / partial.
- **v0.2 compliant relay**: implemented / N/A.

Goal: clarity for contributors and partners on what is "demo" vs "compliant".

### 7.3 Security tests (CI)

- Messages with invalid signature → rejection.
- Expired TTL → rejection.
- Invalid specs (control chars, oversized fields, injection-like) → rejection.
- Anti-phishing fields (URL, phone in `location.name`) → rejection.
- Rate limits (expected behavior under load).

Ideally: lightweight fuzzer on schemas (invalid payload generation).

### 7.4 SDK

- **Sanitization**: SDKs MUST provide (and use by default for display) sanitization of user-displayed fields (strip URL, phone detection).
- **Settlement proof**: SDKs MUST allow filling `settlement_proof` in receipts when payment integration provides it.
- **Bid commitment**: PA clients MUST be able to verify `bids_content_hash` once bids received.

---

## 8. Version summary

| Component      | v0.1        | v0.2        |
|----------------|------------|-------------|
| Proto          | `intent/0.1` | `intent/0.2` |
| Receipt        | fulfillment only | + `settlement_proof` |
| New type       | —           | `deal_attestation` |
| bid_commitment | count + id hash | + `bids_content_hash` |
| RFQ            | —           | + `category_schema_version` (optional) |
| Constraints    | specs + length | + anti-URL, anti-phone on displayed fields |
| Reputation     | cancellation_rate | + counterparty weighting |
| Relay          | spec only   | + compliant reference relay + attestations |

---

## 9. Out of scope for v0.2 (deferred)

- **Trust Web** (agents vouching for each other): deferred to later version.
- **Multi-relay federation**: `via` format and attestations prepare federation; 2-relay implementation can be "preview" but not mandatory for v0.2 validation.
- **Extended actions** (`hire`, `query`, `monitor`, `delegate`): product roadmap; v0.2 protocol stays compatible (same envelope, same base types).
- **Stripe Connect / escrow**: product integration; protocol settles for `settlement_proof` and references.

---

*This document is the official v0.1 → v0.2 delta. Detailed documents (PROTOCOL, SCHEMAS, SECURITY, RELAY) will be updated to reflect these changes; meanwhile, above rules are authoritative for v0.2.*