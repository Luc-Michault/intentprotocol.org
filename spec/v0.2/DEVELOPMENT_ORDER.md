# Suite du développement après la spec v0.2

Ordre recommandé pour implémenter la v0.2 et enchaîner sur la suite. **Oui, mettre à jour les SDK fait partie intégrante de la v0.2** — après (ou en parallèle) du relais conforme.

---

## 1. Ordre logique de développement v0.2

```
Spec v0.2 (CHANGES.md)     →  déjà rédigée
        │
        ▼
Relais minimal conforme   →  priorité 1 : valider la spec en conditions réelles
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
Mise à jour SDK (JS + Python)              Tests de sécurité (CI)
        │                                      │
        ▼                                      ▼
SPEC_VS_POC à jour                         Relay + SDK testés ensemble
        │
        ▼
Optionnel : fédération 2 relais, relay hébergé, premiers partenariats
```

**Pourquoi le relais en premier ?** Sans relais conforme, on ne peut pas tester en conditions réelles les `delivery_ack`, `bid_commitment` (avec `bids_content_hash`), `deal_attestation`, ni la validation anti-phishing. Les SDK ont besoin d’un relais réel pour valider leur comportement.

**Ensuite les SDK** : ils doivent parler `intent/0.2`, envoyer/recevoir les nouveaux champs, et appliquer les règles côté client (sanitization, vérification du bid commitment).

---

## 2. Mise à jour des SDK — quoi faire concrètement

### 2.1 Commun (JS + Python)

| Tâche | Détail |
|-------|--------|
| **Proto 0.2** | Émettre `proto: "intent/0.2"` dans tous les messages (tout en acceptant les réponses en 0.1 pour compatibilité). |
| **Settlement proof** | Dans les **receipts** : accepter et permettre de remplir un objet `settlement_proof` : `{ method, reference?, amount?, currency? }`. Exposer une API du type `sendReceipt(dealId, fulfillment, settlementProof?)`. |
| **Bid commitment** | Côté **PA** : écouter le message `bid_commitment` (ref, bid_count, bid_ids_hash, bids_content_hash) ; une fois tous les bids reçus (ou TTL expiré), calculer le hash canonique des bids reçus et le comparer à `bids_content_hash` ; exposer un flag ou event `bidCommitmentVerified` / `bid_commitment_mismatch`. |
| **Sanitization** | Nouvelle fonction exportée `sanitizeForDisplay(str)` ou `sanitizeDisplayFields(obj)` : strip URLs, détection/masquage des motifs type téléphone (regex). L’appliquer par défaut sur les champs affichés à l’utilisateur (`location.name`, `location.address`, `offer.service`, etc.) — soit dans les getters, soit dans une couche d’affichage documentée. |
| **Category schema version** | Dans les **RFQ** : accepter un champ optionnel `intent.category_schema_version` (string, ex. `"1.0"`) et l’inclure dans le payload envoyé au relais. |
| **Deal attestation** | Côté client : accepter et parser le type `deal_attestation` (lecture seule, émis par le relais) ; pas d’émission côté SDK. Optionnel : méthode `fetchDealAttestation(dealId)` si le relais expose `GET /v1/deals/:id/attestation`. |

### 2.2 SDK JavaScript

- **Fichiers à toucher** : `protocol.js` (proto, category_schema_version dans makeRFQ), `client.js` (écoute delivery_ack, bid_commitment, vérification bids_content_hash), `agent.js` (receipt avec settlement_proof, sanitization avant affichage dans les helpers).
- **Nouveau module** : `sanitize.js` (ou dans `protocol.js`) avec les regex anti-URL et anti-téléphone, et une fonction qui nettoie un objet (champs connus affichés à l’utilisateur).
- **Types** (JSDoc ou TypeScript) : ajouter `SettlementProof`, `BidCommitmentMessage`, `DealAttestation`, et `category_schema_version` dans l’intent.

### 2.3 SDK Python

- **Mêmes ajouts** : `protocol.py` (proto 0.2, category_schema_version), `client.py` (bid_commitment, vérification hash), méthode receipt avec `settlement_proof`.
- **Nouveau** : `sanitize.py` (ou dans un module `display.py`) avec `sanitize_for_display(text)` et application sur les champs connus.
- **Types** : typage pour `SettlementProof`, `BidCommitment`, `DealAttestation` si le projet utilise des dataclasses / Pydantic.

### 2.4 Validation côté envoi (optionnel mais recommandé)

- Avant d’envoyer un **bid**, vérifier que `offer.location.name`, `offer.location.address`, `offer.service` ne contiennent pas d’URL ni de motif téléphone ; sinon rejeter ou sanitizer et logger un warning. Cela évite que le relais renvoie E_INVALID et aide les développeurs à respecter la spec.

---

## 3. Relais conforme — rappel des livrables

- WebSocket, enregistrement agents, routage catégorie + géo.
- Envoi de **delivery_ack** après routage RFQ.
- Envoi de **bid_commitment** (bid_count, bid_ids_hash, **bids_content_hash**) avant les bids.
- Génération de **deal** signé et de **deal_attestation** à la finalisation (FULFILLED).
- Validation : signatures, TTL, taille 8 KB, **anti-phishing** (rejet des champs contenant URL / téléphone).
- Rate limits, progressive trust, stats `/v1/stats`.
- Optionnel v0.2 : `GET /v1/deals/:id/attestation` pour récupérer l’attestation.

---

## 4. Tests et CI

- **Relais** : tests unitaires (validation des messages, rejet signature invalide, TTL, anti-phishing, calcul de bid_commitment et deal_attestation).
- **SDK** : tests d’intégration contre le relais conforme (RFQ → delivery_ack → bids → bid_commitment vérifié → accept → deal → receipt avec settlement_proof).
- **Sécurité** : tests automatisés (payloads avec injection-like, URLs dans location.name, champs trop longs) → attente E_INVALID ou rejet.

---

## 5. Après la v0.2 « complète »

Une fois relais conforme + SDK à jour + SPEC_VS_POC à jour + tests en place :

- **Consolidation** : relay hébergé public, onboarding « branche ton agent en 5 min », premiers partenariats ou premiers BAs — selon opportunités.
- **Fédération** : si pas encore fait en v0.2, implémenter 2 relais qui s’échangent les RFQs et les attestations (via, attestations).
- **v0.3** : actions étendues (`query`, `delegate`, `monitor`), capability registry, micro-paiements — sur la même couche de messages, en étendant les types et les catégories.

En résumé : **la suite immédiate = relais conforme puis mise à jour des SDK** ; les deux sont indispensables pour considérer la v0.2 comme base solide. Ensuite, produit et partenariats s’appuient sur cette base.
