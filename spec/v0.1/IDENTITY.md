# Intent Protocol — Identity & Reputation

## 1. Agent Identity

### 1.1 Keypair

Every agent has an Ed25519 keypair:
- **Private key**: Stored locally by the agent, never shared
- **Public key**: Serves as the agent's identity on the network

```
Agent ID format: agent:{name}@{home_relay}

Examples:
  agent:jarvis@relay.openclaw.ai
  agent:salon-bella@relay.pau.fr
  agent:plumber-dupont@relay.artisans.fr
```

The `name` is human-readable but not unique globally — uniqueness comes from the pubkey. The `@relay` indicates the agent's home relay (where it's registered), not a limitation on where it can operate.

### 1.2 Key Generation

```
1. Generate Ed25519 keypair (32 bytes seed)
2. Derive agent ID from pubkey + chosen name
3. Register on home relay with pubkey
4. Sign all outgoing messages with private key
```

Libraries: `tweetnacl` (JS), `ed25519-dalek` (Rust), `PyNaCl` (Python)

### 1.3 Key Rotation

Agents can rotate keys by:
1. Generating new keypair
2. Signing a rotation message with BOTH old and new keys
3. Publishing rotation to home relay
4. Home relay updates registry and notifies federated peers

Old signatures remain valid (they reference the key that was active at `ts`).

## 2. Agent Types

### 2.1 Personal Agent (PA)
- Represents a human consumer
- Sends RFQs, receives bids, accepts deals
- Minimal public profile (just pubkey + home relay)
- Private data (name, address, payment) revealed only in deals

### 2.2 Business Agent (BA)
- Represents a service provider or merchant
- Listens for RFQs, sends bids
- Rich public profile (categories, location, hours, prices)
- Reputation is public and portable

### 2.3 Platform Agent (PLA)
- Represents a platform (e.g., Doctolib, Uber, Amazon)
- Acts as proxy for multiple businesses
- Aggregates RFQs and dispatches to sub-agents
- Can run its own relay

## 3. Reputation

### 3.1 Reputation Score

Reputation is computed from deal history:

```json
{
  "agent": "agent:salon-bella@relay.pau.fr",
  "reputation": {
    "deals_completed": 847,
    "deals_cancelled_by_provider": 3,
    "deals_cancelled_by_client": 12,
    "disputes_raised": 2,
    "disputes_lost": 0,
    "avg_rating": 4.7,
    "rating_count": 623,
    "response_time_avg_ms": 450,
    "member_since": "2026-01-15",
    "verified": true,
    "score": 0.94
  }
}
```

### 3.2 Score Calculation

```
score = (completed / total_deals) × 0.4
      + (avg_rating / 5.0) × 0.3
      + (1 - disputes_lost / total_deals) × 0.2
      + min(1, deals_completed / 100) × 0.1   // experience bonus
```

Score range: 0.0 to 1.0

### 3.3 Portability

Reputation is stored on the home relay but is **portable**:
- Agent can request a signed reputation attestation from their relay
- This attestation can be presented to any other relay
- Receiving relay verifies the signature of the issuing relay

```json
{
  "type": "reputation_attestation",
  "agent": "agent:salon-bella@relay.pau.fr",
  "issued_by": "relay.pau.fr",
  "issued_at": "2026-03-05T22:00:00Z",
  "reputation": { ... },
  "sig": "ed25519:relay_signature..."
}
```

This prevents lock-in: an agent can switch relays and bring their reputation with them.

### 3.4 Verification

Business agents can be **verified** by their home relay:
- Relay operator confirms real business identity (SIRET, business license, etc.)
- Verification is indicated by `"verified": true` in reputation
- Verification process is relay-specific (not part of protocol)

## 4. Privacy Levels

Agents choose how much to reveal:

| Level | Public | In Bids | In Deals |
|-------|--------|---------|----------|
| **Pseudonymous** | Pubkey only | + category, geo, prices | + name, address, contact |
| **Business** | Full profile | + availability, extras | + legal info |
| **Anonymous** | Pubkey only | Pubkey only | Encrypted to counterparty |

Personal agents are typically pseudonymous. Business agents are typically at "Business" level. Anonymous mode is for privacy-sensitive transactions.

## 5. Trust Web (Future)

In v0.2+, agents can vouch for each other:
- "I did business with this agent and it went well"
- Creates a web of trust (like PGP but for commerce)
- Useful when interacting with agents on unknown relays
- Not required for v0.1
