# Intent Protocol — Agent Skill

This file is the **agent-operator guide** for using Intent Protocol v0.3 safely.

Use this skill when an agent needs to:
- register to a relay,
- broadcast or answer RFQs,
- negotiate bids,
- handle key rotation / quarantine appeal,
- close deals with signed protocol messages.

For normative rules, see `spec/v0.3/CHANGES.md` and relay implementation in `relay/`.

---

## 1) Scope and non-goals

This skill covers **protocol usage** (message flow + security checks), not business strategy.

Do NOT:
- send unsigned protocol messages,
- skip canonical payload signing for owner attestations,
- bypass min bid window handling,
- rotate compromised keys without recovery attestation.

---

## 2) Required preconditions

Before sending protocol traffic:

1. **Ed25519 keypair** available for agent identity.
2. **Clock sync** (NTP) to avoid timestamp/skew rejections.
3. Relay endpoint configured (WebSocket + REST if needed).
4. Optional but strongly recommended: **`recovery_pubkey`** registered.

---

## 3) Baseline lifecycle

1. **REGISTER**
   - Include profile and current pubkey.
   - Include `recovery_pubkey` when available.

2. **RFQ**
   - Client broadcasts intent.
   - Relay buffers bids and enforces min bid window (`MIN_BID_WINDOW_MS`, default 5000ms).

3. **BID**
   - Providers answer with signed bids.

4. **ACCEPT / COMMIT / DEAL progression**
   - Follow relay ordering and commitment model.
   - Verify all signatures and timestamps before state transition.

---

## 4) Security-critical v0.3 rules

### A) Compromised key rotation (mandatory attestation)

If `reason === "compromised"`, rotation is valid only if:
- agent has a registered `recovery_pubkey`,
- owner attestation is provided,
- attestation verifies against canonical payload:

```json
{
  "agent": "...",
  "old_pubkey": "...",
  "new_pubkey": "...",
  "reason": "compromised",
  "ts": 1234567890
}
```

Canonical = JSON keys sorted before signing/verifying.

### B) Quarantine appeal attestation

Quarantine appeal requires owner attestation over canonical payload:

```json
{
  "agent": "...",
  "type": "quarantine_appeal",
  "ts": 1234567890
}
```

Verify with `recovery_pubkey` (fallback: current key if no recovery key exists).

### C) Quarantine lookback window

When quarantining compromised activity, only recent deals are eligible:
- created within last 72h (`deal_msg.ts >= now - QUARANTINE_LOOKBACK_S`).

### D) Bid timing hardening

Relay should forward buffered bids to PA only after min window elapsed:
- `MIN_BID_WINDOW_MS` default: 5000.
- flush at timeout as safety fallback.

---

## 5) Canonical payload helper requirements

Agents/SDKs must provide:
- deterministic key-sorted JSON canonicalization,
- Ed25519 sign/verify on canonical string payloads,
- explicit rejection on canonicalization mismatch.

If signature verification fails: reject with auth/integrity error and halt flow.

---

## 6) Error handling policy (minimum)

Treat as hard failures:
- `E_AUTH` (invalid/missing attestation/signature),
- `E_INVALID` (invalid payload / rotation preconditions not met).

On hard failure:
1. do not retry blindly,
2. log payload hash + reason,
3. request fresh signed message.

---

## 7) Operational checklist (pre-flight)

Before production usage:
- [ ] Register includes `recovery_pubkey`.
- [ ] Canonical payload test vectors pass in CI.
- [ ] Compromised rotation test: valid attestation passes, invalid fails.
- [ ] Quarantine appeal test: valid/invalid paths covered.
- [ ] Min bid window behavior verified under load.
- [ ] Quarantine 72h boundary test covered.

---

## 8) References

- Spec delta v0.3: `spec/v0.3/CHANGES.md`
- Relay implementation: `relay/index.js`, `relay/crypto.js`
- Relay usage and env: `relay/README.md`
- SDK docs: `sdk/js/README.md`, `sdk/python/README.md`
