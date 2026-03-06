# Intent Protocol v0.2 — Conformant Relay

Relais de référence conforme à la spec v0.2 : WebSocket, `delivery_ack`, `bid_commitment` (avec `bids_content_hash`), `deal_attestation`, validation anti-phishing, rate limits, signatures.

## Prérequis

- Node.js 20+

## Installation

```bash
cd relay
npm install
```

## Démarrer

```bash
npm start
# ou
PORT=3100 node index.js
```

- **WebSocket** : `ws://localhost:3100/v1/ws`
- **Health** : `http://localhost:3100/v1/health`
- **Stats** : `http://localhost:3100/v1/stats`
- **Deal** : `GET http://localhost:3100/v1/deals/:id`
- **Attestation** : `GET http://localhost:3100/v1/deals/:id/attestation`
- **Info** : `GET http://localhost:3100/v1/info`

## Comportement

1. **Connexion** : les agents se connectent en WebSocket à `/v1/ws`.
2. **Enregistrement** : premier message doit être `register` avec `agent_id`, `pubkey` (Ed25519 base64), `profile` (type, categories, geo pour les BA). Sans pubkey enregistrée, les messages suivants sont rejetés (E_AUTH).
3. **RFQ** : le relais route par catégorie + géo vers les BAs, envoie **delivery_ack** (nombre de BAs contactés) à l’émetteur, et démarre un timer TTL.
4. **BID** : les BIDs sont transmis au PA au fur et à mesure. À l’expiration du TTL du RFQ, le relais envoie **bid_commitment** (bid_count, bid_ids_hash, bids_content_hash) au PA, puis supprime l’entrée RFQ.
5. **ACCEPT** : le relais génère un **deal** signé, le stocke et l’envoie aux deux parties.
6. **RECEIPT** : quand les deux parties ont envoyé un receipt, le deal passe en FULFILLED et le relais crée une **deal_attestation** (disponible via `GET /v1/deals/:id/attestation`).

## Conformité

- Signatures Ed25519 vérifiées sur chaque message (hors register).
- Limites : message ≤ 8 KB, `radius_km` ≤ 500, `ttl` ≤ 120 s.
- Anti-phishing : rejet des champs (ex. `location.name`, `offer.service`) contenant URL ou motif téléphone.
- Rate limits : 10 RFQ/min par PA, 100 BID/min par BA.

Voir `spec/SPEC_VS_POC.md` pour la checklist complète.
