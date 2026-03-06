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

## v0.2 — "Le Marché" (Q2 2026)
*Multi-catégories, vrais business agents, premiers revenus.*

### Protocole
- [ ] Action types étendus : `hire`, `query`, `monitor`, `delegate`
- [ ] Négociation multi-round (counter-offers formalisés)
- [ ] Category Schema Registry (validation des specs par catégorie)
- [ ] Trust Web : agents se voucher mutuellement (PGP-like)
- [ ] Relay federation réelle (2+ relays qui se synchronisent)

### Produit
- [ ] Hosted relay public (`relay.intentprotocol.org`)
- [ ] Dashboard business : analytics, bids envoyés, deals conclus, réputation
- [ ] Onboarding simplifié : "Branche ton salon en 5 min"
- [ ] Stripe Connect intégré pour escrow natif
- [ ] Premier vrai business agent (Websual ? un resto à Pau ?)

### Monétisation
- [ ] Free tier : 100 deals/mois
- [ ] Pro tier : illimité + analytics + priority routing
- [ ] Settlement fee : 0.5% sur les escrow

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

---

*"On ne construit pas un protocole pour aujourd'hui. On le construit pour le monde qu'on veut voir dans 10 ans."*
