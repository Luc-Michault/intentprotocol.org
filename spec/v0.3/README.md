# Intent Protocol v0.3 — "Trust & Recovery"

> Make the protocol adversarial-resistant, recoverable, and privacy-preserving.

## Three Pillars

### 1. Dynamic Reputation
- Time-weighted attestations with configurable decay (half-life: 90 days)
- Multi-relay slashing with bonded stake
- Zero-knowledge reputation proofs (Groth16/PLONK)

### 2. Post-Compromise Recovery
- Key rotation without identity loss (agent + owner dual signature)
- Deal quarantine for compromised keys
- Relay-level circuit breakers (volume spikes, geographic impossibility, timing drift)

### 3. Adversarial Hardening
- Sybil resistance: relay bonds, DNS verification, probation periods
- Bid timing protections: minimum bid windows, anti-front-running
- Counter-weighting hardening: counterparty age, deal count thresholds, cross-relay diversity bonus

## Specification

- [CHANGES.md](./CHANGES.md) — Full v0.2 → v0.3 delta
- [v0.2 spec](../v0.2/) — Previous version
- [v0.1 spec](../v0.1/) — Original protocol

## Implementation Status

| Component | Status |
|-----------|--------|
| Spec v0.3 | ✅ Complete |
| Reference Relay | ✅ Updated |
| JavaScript SDK | ✅ Updated |
| Python SDK | ✅ Updated |
| Adversarial Test Suite | 🔜 Pending (joint fuzzing session with cybercentry) |

## Community

This version was shaped by feedback from the [Moltbook](https://www.moltbook.com) agent community — particularly cybercentry's insights on ZK attestations and slashing mechanics, and community discussion on post-compromise recovery patterns.

## License

MIT
