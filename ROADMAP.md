# Intent Protocol — Roadmap

## v0.1 — "Le Coiffeur" (NOW)
*Prouver que ça marche. Un use case, parfaitement exécuté.*

- [x] Spec technique (7 docs, 1451 lignes)
- [x] PoC relay + 3 agents + demo runner
- [x] Site vitrine Awwwards-level
- [x] Live demo interactive ("Try it yourself")
- [x] SDK JavaScript (`@intentprotocol/sdk`)
- [x] SDK Python (`intentprotocol`)
- [ ] GitHub public + README + LICENSE MIT
- [ ] Post Hacker News / r/programming / Twitter
- [ ] Premier feedback communauté

## v0.2 — "La base solide" (Q2 2026)
*Protocole simple à déployer, complet pour construire dessus, fiable en sécurité. Les outils et partenariats (quel relais hébergé, quels premiers BAs) se définiront sur cette couche.*

### Principes
- **Couche de base** : comme HTTP ou SMTP — interop agent-to-agent d’abord ; liquidité et produits viendront par-dessus.
- **Spec v0.2** : delta documenté dans `spec/v0.2/CHANGES.md` (compatibilité ascendante avec 0.1).

### Protocole (spec v0.2)
- [ ] **Settlement proof** : champ optionnel dans `receipt` pour lier deal et paiement (référence Stripe, tx_hash, etc.)
- [ ] **Deal attestations** : format signé par le relais (deal_id, parties, montant, relay) pour réputation cross-relay vérifiable
- [ ] **Anti-phishing** : règles explicites sur `location.name`, `address`, etc. (pas d’URL, pas de téléphone) ; validation relais + sanitization SDK
- [ ] **Bid commitment renforcé** : `bids_content_hash` en plus de `bid_ids_hash` pour détecter les relais qui cachent des bids
- [ ] **Category Schema Registry versionné** : schemas par catégorie avec version ; RFQ peut préciser `category_schema_version`
- [ ] **Réputation** : annulations pondérées par contrepartie (limiter le griefing par PAs multiples)
- [ ] Négociation multi-round (counter-offers) déjà en v0.1 ; formaliser si besoin
- [ ] Trust Web / federation 2+ relais : préparé par attestations et via ; implémentation complète possible en fin de v0.2 ou v0.3

### Conformité et implémentation
- [ ] **Relais minimal conforme** : une implémentation (Node ou Rust) avec WebSocket, `delivery_ack`, `bid_commitment` (avec `bids_content_hash`), génération deal + `deal_attestation`, validation spec (signatures, TTL, anti-phishing)
- [ ] **SPEC_VS_POC** : document `spec/SPEC_VS_POC.md` à jour (PoC démo = simulé, relais conforme = référence)
- [ ] **Tests de sécurité** en CI : signatures invalides, TTL, specs invalides, anti-phishing, rate limits
- [ ] **SDK** : sanitization des champs affichés, support `settlement_proof` et vérification `bids_content_hash` (détail : `spec/v0.2/DEVELOPMENT_ORDER.md`)

### Produit (dès que la base est prête)
- [ ] Hosted relay public optionnel (`relay.intentprotocol.org`) pour tester la conformité en conditions réelles
- [ ] Onboarding simplifié : "Branche ton agent / ton salon en 5 min"
- [ ] **Partenariat cible** : [holia.me](https://holia.me) — SaaS regroupant plusieurs dizaines de milliers de praticiens ; excellente source de liquidité pour connecter des agents métier au protocole
- [ ] Stripe Connect / escrow : intégration produit sur la couche settlement_proof (optionnel v0.2)

## v0.3 — "L'Économie des Agents" (Q3-Q4 2026)
*Les agents se vendent des compétences entre eux.*

### Agent-to-Agent Marketplace
- [ ] Action `query` : agents échangent des connaissances
  - Ex: "Quel est le meilleur prix pour un vol Paris→NYC le 15 mars ?"
  - Agent spécialisé répond moyennant micro-paiement
- [ ] Action `delegate` : sous-traitance de tâches
  - Ex: "Parse ce PDF et retourne du JSON structuré" — 0.001$/page
  - Ex: "Traduis ce texte en japonais" — 0.01$/1000 mots
- [ ] Action `monitor` : surveillance conditionnelle
  - Ex: "Préviens-moi si BTC > 100K" — bounty 0.05$
  - Ex: "Alerte si ce produit passe sous 50€" — bounty 0.02$
- [ ] Capability registry : agents déclarent ce qu'ils savent faire
- [ ] Micro-paiements Lightning Network ou USDC L2

### Use Cases Débloqués
- Agent journaliste achète des synthèses à des agents data
- Agent DevOps sous-traite le déploiement à un agent infra
- Agent trading utilise des agents sentinelles pour le monitoring
- Chaînes d'agents : A → B → C pipeline automatique

## v0.4 — "Le Smart Contract" (2027)
*Intents on-chain. Exécution conditionnelle. MEV légal.*

### Intent-Based Execution (Crypto)
- [ ] Smart contracts qui stockent des intentions avec conditions
  - "Execute ma tx quand $ETH > $4000" + bounty 0.10$
  - "Swap 1000 USDC → ETH au meilleur prix dans les 24h" + bounty 0.05$
- [ ] Réseau d'agents "fillers" qui monitore et exécute
- [ ] Compatible EVM (Ethereum, Arbitrum, Base) + Solana
- [ ] Oracles intégrés (Chainlink, Pyth) pour vérification des conditions
- [ ] Revenue model : % du bounty collecté

### Inspirations existantes (à étudier, pas copier)
- UniswapX (intent-based swaps, fillers)
- CoW Protocol (batch auctions, solvers)
- Anoma (intent-centric L1)
- Khalani (cross-chain intent settlement)
- Essential (intent-based architecture)

## v1.0 — "Le Standard" (2027-2028)
*Le protocole est adopté. On ne le contrôle plus, et c'est le but.*

- [ ] RFC formelle soumise à un organisme de standards
- [ ] 10+ relays fédérés opérés par des tiers
- [ ] 1000+ business agents actifs
- [ ] Intégrations natives : OpenClaw, LangChain, AutoGPT, etc.
- [ ] SDK dans 5+ langages
- [ ] Gouvernance communautaire du protocole

---

## Use Cases par Phase

| Phase | Use Case | Qui paye | Comment |
|-------|----------|----------|---------|
| v0.1 | Coiffeur, restaurant, plombier | Client (direct) | Cash/carte sur place |
| v0.2 | + freelance, B2B, e-commerce | Client (escrow) | Stripe, virement |
| v0.3 | + agent↔agent (compétences, data) | Agent (micro) | Lightning, USDC L2 |
| v0.4 | + DeFi intents, conditional orders | Bounty | Smart contract |
| v1.0 | Tout | Tout | Tout |

## La Vision

> Aujourd'hui : tu cherches un coiffeur sur Google, tu appelles, tu réserves.
> Demain : tu dis "coiffeur 14h max 30€" et c'est fait.
> Après-demain : ton agent le fait sans que tu le demandes, parce qu'il sait que t'as besoin d'une coupe.

Le protocole ne change pas entre ces 3 étapes. Seule l'intelligence de l'agent évolue. C'est pour ça qu'il faut poser le standard maintenant.

**Couche de base d’abord** : Intent Protocol vise à être une base d’interopérabilité (comme HTTP, SMTP) entre agents. Les outils concrets et les partenariats (quel relais hébergé, quels premiers BAs, monétisation) se construiront sur cette couche — à définir au fil de l’adoption.

---

*"On ne construit pas un protocole pour aujourd'hui. On le construit pour le monde qu'on veut voir dans 10 ans."*
