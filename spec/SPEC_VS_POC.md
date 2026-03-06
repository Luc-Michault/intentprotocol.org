# Intent Protocol — Conformité Spec vs Implémentations

Ce document indique pour chaque exigence majeure de la spec (v0.1, puis v0.2) si elle est **implémentée**, **simulée** (affichée ou émulée sans vrai comportement) ou **absente** dans les implémentations actuelles.

**Objectif** : distinguer clairement la démo (preuve de concept) du relais conforme, et guider les contributeurs.

---

## Légende

| Statut | Signification |
|--------|----------------|
| ✅ Implémenté | Comportement conforme à la spec |
| 🟡 Simulé | Affiché ou émulé dans la démo, pas de vrai relais (ex. delivery_ack affiché dans l’UI mais pas émis par un serveur) |
| ❌ Absent | Non réalisé |
| ➖ N/A | Non applicable à cette implémentation |

---

## Implémentations concernées

| Id | Implémentation | Description |
|----|----------------|-------------|
| **PoC Demo** | `poc/relay-server.js` + site | Serveur HTTP + POST /v1/demo qui simule le flux en mémoire, pas de WebSocket agents |
| **Relay conforme (v0.2)** | `relay/` | Relais de référence WebSocket avec delivery_ack, bid_commitment, deal_attestation, anti-phishing, rate limits |

---

## v0.1 — Messages et transport

| Exigence | PoC Demo | Relay conforme (v0.2) |
|----------|----------|------------------------|
| Transport WebSocket pour agents | ❌ | ✅ |
| Messages JSON avec proto, type, id, from, ts, ttl, sig | 🟡 (construits en mémoire) | ✅ |
| Signature Ed25519 sur chaque message | ✅ (crypto.js) | ✅ |
| Vérification des signatures par le relais | ➖ (pas de relais) | ✅ |
| Rejet TTL expiré | ❌ | ✅ |
| Taille max message 8 KB | ❌ | ✅ |
| Types rfq, bid, accept, deal, cancel, receipt | 🟡 | ✅ |
| delivery_ack après routage RFQ | 🟡 (affiché dans l’UI uniquement) | ✅ |
| bid_commitment avant envoi des bids | 🟡 (affiché dans l’UI uniquement) | ✅ |
| Génération de deal signé par le relais | 🟡 (en mémoire, pas de persistance) | ✅ |

---

## v0.1 — Validation et sécurité

| Exigence | PoC Demo | Relay conforme (v0.2) |
|----------|----------|------------------------|
| Validation des specs selon category schema | ❌ | ✅ |
| Rejet des caractères de contrôle dans les champs | ❌ | ✅ |
| Limite 200 chars sur les champs string | ❌ | ✅ |
| Note max 100 chars, charset restreint | ❌ | ✅ |
| RULE-INJECT-01 (ne pas passer les champs en brut au LLM) | ➖ (doc only) | ➖ (responsabilité client) |
| radius_km ≤ 500, ttl ≤ 120 | ❌ | ✅ |
| Rate limits (PA 10 RFQ/min, BA 100 bid/min) | ❌ | ✅ |
| Max 5 contre-propositions par RFQ | ❌ | ✅ |
| Progressive trust (limites par âge d’agent) | ❌ | ✅ |

---

## v0.1 — Relais et persistance

| Exigence | PoC Demo | Relay conforme (v0.2) |
|----------|----------|------------------------|
| Enregistrement d’agents (register) | ❌ (agents en dur) | ✅ |
| Routage par catégorie + géo | ✅ (filter en mémoire) | ✅ |
| Suppression des messages après TTL | ➖ (tout en mémoire, pas de persistance) | ✅ |
| Pas de log du contenu des messages | ➖ | ✅ |
| GET /v1/stats (stats publiques) | ❌ | ✅ |
| Stockage des deals actifs uniquement | ❌ | ✅ |

---

## v0.1 — Identité et réputation

| Exigence | PoC Demo | Relay conforme (v0.2) |
|----------|----------|------------------------|
| Identité = clé publique (pas le nom) | 🟡 | ✅ |
| DNS TXT verification pour BA | ❌ | SHOULD |
| Key rotation support | ❌ | ✅ |
| diversity_factor dans le score | ❌ | ✅ |
| Pondération par âge de la contrepartie | ❌ | ✅ |
| cross_relay_ratio | ❌ | SHOULD |
| cancellation_rate | ❌ | ✅ |

---

## v0.1 — Fédération

| Exigence | PoC Demo | Relay conforme (v0.2) |
|----------|----------|------------------------|
| Via-chain (signatures des relais dans via) | ❌ | ✅ (si fédération activée) |
| Max 3 hops | ❌ | ✅ |
| Boucles évitées (déjà dans via) | ❌ | ✅ |

---

## v0.2 — Nouveautés (voir spec/v0.2/CHANGES.md)

| Exigence | PoC Demo | Relay conforme (v0.2) |
|----------|----------|------------------------|
| settlement_proof dans receipt | ❌ | ✅ (optionnel, selon politique) |
| deal_attestation (signée par le relais) | ❌ | ✅ |
| Règles anti-phishing (URL, téléphone dans location.name, etc.) | ❌ | ✅ |
| bid_commitment avec bids_content_hash | ❌ | ✅ |
| category_schema_version dans RFQ | ❌ | ✅ |
| Réputation : annulations pondérées par contrepartie | ❌ | ✅ |
| SDK : sanitization des champs affichés | ✅ (sanitize.js / sanitize.py) | ✅ |
| SDK : remplissage settlement_proof | ✅ (confirm(…, settlementProof)) | ✅ |

---

## Résumé

- **PoC Demo** : démontre le flux utilisateur (RFQ → BIDs → accept → deal) et la construction des messages ; **ne remplace pas un relais conforme**. Utile pour la vitrine et les premiers tests.
- **Relay conforme v0.2** : objectif de la v0.2 — une implémentation qui coche toutes les cases MUST de la spec v0.1 + v0.2, afin que la base soit **fiable et complète** pour construire des outils et partenariats au-dessus.

---

*Dernière mise à jour : alignée sur spec v0.1 et spec/v0.2/CHANGES.md.*
