# Intent Protocol — v0.2 Changes (Delta from v0.1)

**Objectif v0.2** : Renforcer la base du protocole pour qu’elle soit **simple à déployer**, **complète pour construire des solutions réelles** et **fiable en sécurité**. Aucun changement breaking sur le flux RFQ → BID → ACCEPT → DEAL ; uniquement des ajouts et des durcissements.

La version de protocole pour v0.2 est : `"proto": "intent/0.2"`. Les relais v0.2 acceptent les messages `intent/0.1` en lecture (compatibilité ascendante) mais émettent en `intent/0.2`.

---

## 1. Settlement proof (lien deal ↔ paiement)

### Problème
Un deal signé n’a pas de lien vérifiable avec un paiement (Stripe, crypto, virement). Les litiges et l’audit sont difficiles.

### Changement

**Receipt** — Nouveau champ optionnel `settlement_proof` :

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

| Champ        | Obligatoire | Description |
|-------------|-------------|-------------|
| `method`    | Oui         | `stripe` \| `escrow_crypto` \| `bank_transfer` \| `invoice` \| `on_site` \| `other` |
| `reference` | Si applicable | ID transaction (payment_intent, tx_hash, invoice_id) — max 128 chars |
| `amount`    | Recommandé  | Montant effectivement réglé |
| `currency`  | Recommandé  | Code ISO 4217 |

- Si le paiement est « sur place » ou « à régler plus tard », `method: "on_site"` ou `"invoice"`, `reference` peut être vide.
- Les relais MAY exiger `settlement_proof` pour les deals au-dessus d’un montant (ex. > 500 €) selon leur politique.

**Règle** : Les agents et relais qui implémentent l’escrow (Stripe, crypto) MUST remplir `settlement_proof` avec une référence vérifiable lorsque disponible.

---

## 2. Attestations de deal (réputation cross-relay vérifiable)

### Problème
La réputation repose sur des données locales par relais. Un BA peut gonfler sa réputation avec des deals « cross-relay » auto-générés.

### Changement

**Format d’attestation** — Chaque relais qui finalise un deal (état FULFILLED) produit une **Deal Attestation** signée :

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

- Signature = relais (clé privée du relais).
- Les relais MAY publier les attestations sur un endpoint `GET /v1/deals/{deal_id}/attestation` ou les échanger avec les relais pairs en fédération.
- Pour le calcul de réputation : un consommateur (autre relais, annuaire, BA) peut vérifier les attestations par signature et déduire `cross_relay_deals` / `diversity_factor` sans faire confiance à un seul relais.

**Règle** : Un relais conforme v0.2 MUST générer et signer une `deal_attestation` lorsque un deal passe en FULFILLED. Il MAY les stocker localement et les exposer via API ; l’échange inter-relais est RECOMMENDED pour la fédération.

---

## 3. Anti-phishing (champs affichés à l’utilisateur)

### Problème
Les champs `location.name`, `location.address`, et tout texte affiché à l’utilisateur peuvent contenir des URLs, numéros de téléphone ou instructions de social engineering.

### Changement

**Règles de contenu (SCHEMAS + SECURITY)** :

| Champ (exemples)     | Interdictions explicites |
|----------------------|--------------------------|
| `location.name`      | Aucune URL (http, https, www), aucun motif type numéro de téléphone (E.164, espacé), max 100 caractères |
| `location.address`   | Idem, max 200 caractères |
| `offer.service`      | Idem (pas d’URL, pas de téléphone), max 200 caractères |
| Tout champ libre dans `offer` ou `reputation` affiché à l’humain | Idem |

- **Validation** : Les relais MUST rejeter (E_INVALID) les messages dont ces champs contiennent des URLs ou des motifs téléphone (regex à définir dans SECURITY.md v0.2).
- **SDK** : Les SDK MUST fournir une fonction de sanitization (strip URLs, masquage ou rejet de motifs téléphone) et l’appliquer par défaut avant affichage à l’utilisateur.

**Regex indicatives** (à affiner) :
- URL : `https?://\S+` ou présence de `\.(com|fr|org|net)\b`
- Téléphone : séquence de 8+ chiffres avec éventuellement espaces, points, tirets

---

## 4. Bid commitment renforcé

### Problème
Un relais peut prétendre avoir reçu N bids et n’en transmettre que N-1 ; le PA ne peut pas prouver qu’un bid manquant existait.

### Changement

**bid_commitment** — En plus de `bid_count` et `bid_ids_hash`, le relais MUST inclure un engagement sur le **contenu** des bids :

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

- `bids_content_hash` = `SHA256(concat(sort(bid_id, from, price, currency pour chaque bid)))` — ordre canonique (tri par bid_id). Ainsi le PA peut vérifier que l’ensemble des bids reçus correspond au commitment ; si le relais omet un bid, le hash ne matche pas.
- Les relais MUST envoyer `bid_commitment` avant de transmettre les premiers bids. Les PAs SHOULD vérifier le hash une fois tous les bids reçus (ou à l’expiration du TTL).

---

## 5. Category Schema Registry versionné

### Problème
Les schemas de catégories peuvent diverger entre relais ; pas de référence de version dans les messages.

### Changement

- **Registry** : Les schemas de catégories sont des fichiers JSON Schema versionnés, par ex. `schemas/services.beauty.haircut/v1.0.json`. Le protocole ou la communauté héberge le registry (repo, CDN).
- **RFQ** : Champ optionnel `intent.category_schema_version` :
  ```json
  "intent": {
    "category": "services.beauty.haircut",
    "category_schema_version": "1.0",
    ...
  }
  ```
  Si absent, le relais utilise la dernière version connue pour cette catégorie.
- **Validation** : Le relais valide `specs` contre le schema de la version demandée (ou par défaut). Si la version n’existe pas, E_INVALID.

Cela permet d’évoluer les catégories sans casser les anciens agents (ils pinent une version).

---

## 6. Réputation et griefing (annulations par contrepartie)

### Problème
Un attaquant peut créer plusieurs PAs, accepter des deals avec un BA puis annuler pour dégrader son `cancellation_rate`.

### Changement

- **Comptage par contrepartie** : Le `cancellation_rate_as_provider` (et équivalents) MUST être calculé en pondérant les annulations par **identité de contrepartie** : une même PA qui annule 10 fois compte comme une seule « contrepartie annulante » pour le ratio, pas 10. Formule indicative :
  - `cancellation_rate = unique_cancelling_counterparties / unique_counterparties_with_deals`
  ou variante qui limite l’impact d’un seul PA malveillant.
- **Documentation** : SECURITY.md v0.2 décrit cette règle et recommande d’exposer `cancellation_rate_by_counterparty` (ou équivalent) pour que les PAs puissent évaluer un BA.

---

## 7. Conformité et implémentation

### 7.1 Relais minimal conforme

Une implémentation de référence (Node ou Rust) MUST exister qui :

- Accepte des connexions WebSocket d’agents.
- Enregistre les agents (PA/BA), route par catégorie + géo.
- Envoie **delivery_ack** (nombre de BAs routés) après routage d’un RFQ.
- Envoie **bid_commitment** (bid_count, bid_ids_hash, bids_content_hash) avant d’envoyer les bids au PA.
- Génère des **deal** signés et des **deal_attestation** à la finalisation.
- Valide les messages (signatures, TTL, tailles, champs anti-phishing).
- N’implémente pas obligatoirement la fédération en v0.2 (peut être une phase suivante).

Ce relais sert de référence pour les tests de conformité et la checklist SPEC_VS_POC.

### 7.2 SPEC_VS_POC (documentation)

Un document **SPEC_VS_POC.md** (dans `spec/` ou `doc/`) liste chaque exigence MUST/SHOULD de la spec v0.1 (et v0.2) avec le statut dans chaque implémentation :

- **PoC demo** (relay-server.js actuel) : simulé / absent / partiel.
- **Relais conforme v0.2** : implémenté / N/A.

Objectif : clarté pour les contributeurs et les partenaires sur ce qui est « démo » vs « conforme ».

### 7.3 Tests de sécurité (CI)

- Messages avec signature invalide → rejet.
- TTL expiré → rejet.
- Specs invalides (caractères de contrôle, champs trop longs, injection-like) → rejet.
- Champs anti-phishing (URL, téléphone dans `location.name`) → rejet.
- Rate limits (comportement attendu sous charge).

Idéalement : fuzzer léger sur les schemas (génération de payloads invalides).

### 7.4 SDK

- **Sanitization** : Les SDK MUST fournir (et utiliser par défaut en affichage) une sanitization des champs affichés à l’utilisateur (strip URL, détection téléphone).
- **Settlement proof** : Les SDK MUST permettre de remplir `settlement_proof` dans les receipts lorsque l’intégration paiement le fournit.
- **Bid commitment** : Les clients PA MUST pouvoir vérifier `bids_content_hash` une fois les bids reçus.

---

## 8. Résumé des numéros de version

| Composant      | v0.1        | v0.2        |
|----------------|------------|-------------|
| Proto          | `intent/0.1` | `intent/0.2` |
| Receipt        | fulfillment only | + `settlement_proof` |
| Nouveau type   | —           | `deal_attestation` |
| bid_commitment | count + id hash | + `bids_content_hash` |
| RFQ            | —           | + `category_schema_version` (optionnel) |
| Contraintes    | specs + length | + anti-URL, anti-phone sur champs affichés |
| Réputation     | cancellation_rate | + pondération par contrepartie |
| Relais         | spec only   | + relais conforme de référence + attestations |

---

## 9. Ce qui reste hors scope v0.2 (reporté)

- **Trust Web** (agents qui se vouchent) : reporté à une version ultérieure.
- **Fédération multi-relais** : le format `via` et les attestations préparent la fédération ; une implémentation 2-relais peut être en « preview » mais n’est pas obligatoire pour valider v0.2.
- **Actions étendues** (`hire`, `query`, `monitor`, `delegate`) : roadmap produit ; le protocole v0.2 reste compatible (même envelope, mêmes types de base).
- **Stripe Connect / escrow** : intégration produit ; le protocole se contente de `settlement_proof` et des références.

---

*Ce document est le delta officiel v0.1 → v0.2. Les documents détaillés (PROTOCOL, SCHEMAS, SECURITY, RELAY) seront mis à jour pour refléter ces changements ; en attendant, les règles ci-dessus font autorité pour la v0.2.*
