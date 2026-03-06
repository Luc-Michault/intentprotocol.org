# Intent Protocol — Critique, angles d’attaque et améliorations

Document de prise de connaissance du projet, remise en question de l’idée, identification des faiblesses et pistes d’amélioration.

---

## 1. Rappel du projet

**Intent Protocol** est un protocole ouvert de communication **agent‑à‑agent** pour la négociation et le commerce : un agent personnel (PA) émet une intention structurée (RFQ), des agents métier (BA) répondent par des offres (BID), l’agent accepte une offre → DEAL signé. Transport WebSocket/HTTP, messages JSON signés Ed25519, relais fédérés (routage par catégorie + géo).

---

## 2. Défis et remise en question de l’idée

### 2.1 « HTTP du commerce agent » — hypothèse à prouver

- **Hypothèse** : un standard ouvert, fédéré, suffit pour que n’importe quel agent réserve un coiffeur, un resto, etc.
- **Défi** : aujourd’hui le « standard » réel, c’est l’API de chaque plateforme (Doctolib, Uber, Google Reserve). La valeur est dans le **catalogue** (qui est sur la plateforme) et la **liquidité** (utilisateurs + prestataires). Un protocole seul ne crée ni catalogue ni liquidité.
- **Question** : qui a intérêt à exposer son catalogue en premier sur Intent plutôt que sur sa propre app/API ? Il faut un argument fort (coût, découverte, interop) pour que les BAs migrent.

### 2.2 Relais = point de confiance réintroduit

- Le protocole évite un « centre » unique, mais **chaque agent dépend d’un relais** pour le routage. Le relais voit catégorie, géo, volume.
- **delivery_ack** et **bid_commitment** limitent la censure, mais un relais peut quand même : ralentir certains BAs, favoriser des partenaires (ordre de livraison des BIDs), ou refuser de fédérer avec certains pairs.
- Donc : **décentralisation partielle**. La confiance est déplacée vers les opérateurs de relais et le bon comportement des répertoires de relais.

### 2.3 Settlement « pluggable » = risque de fragmentation

- Stripe, crypto, facture, sur place : le protocole ne traite pas le paiement, seulement la négociation.
- **Conséquence** : chaque intégration (Stripe Connect, escrow crypto, etc.) reste à construire côté produit. Le protocole ne garantit pas l’atomicité « deal = paiement sécurisé ».
- Risque : des « deals » signés sans lien vérifiable avec un paiement (pas de preuve on-chain ou de reçu Stripe lié au `deal_id`). Amélioration possible : **settlement proof** (hash ou référence de transaction) dans le message `receipt`.

### 2.4 Réputation cross-relay : données incomplètes

- La spec compte sur `cross_relay_ratio` et `diversity_factor` pour limiter le Sybil et l’auto‑réputation.
- En pratique, **les relais ne partagent pas une base de réputation globale**. Chaque relais a une vue locale. Sans mécanisme partagé (attestations signées, DHT, ou registre dédié), un BA peut avoir 1000 deals « cross-relay » avec des PAs sous son contrôle sur d’autres relais.
- **Amélioration** : définir un format d’**attestation de deal** (deal_id, parties, montant, relay, signature) que les relais échangent ou publient, et sur lequel la réputation est calculée de façon vérifiable.

---

## 3. Angles d’attaque et défauts

### 3.1 Sécurité / abus

| Angle d’attaque | Description | Mitigation actuelle | Lacune / amélioration |
|-----------------|-------------|---------------------|------------------------|
| **Injection dans les specs** | Chaînes dans `specs` pour manipuler un LLM côté BA. | Schemas par catégorie, enums, RULE-INJECT-01. | Dépend du respect par les implémentations ; pas de « proof » que le BA n’envoie pas les specs à un LLM. Renforcer les schemas stricts et l’audit des SDK. |
| **Bid injection (BA → PA)** | Nom d’établissement, adresse, etc. utilisés pour phishing / social engineering. | Limites de longueur et de jeu de caractères. | Pas de liste blanche (ex. pas de numéros de téléphone dans les champs libres). Ajouter des règles explicites (no URLs/phone in `location.name`, etc.) et sanitization côté SDK. |
| **Relay qui cache des bids** | Le relais ne transmet qu’une partie des BIDs. | `bid_commitment` (nombre + hash des IDs). | Un relais peut envoyer N-1 bids et prétendre qu’il n’y en avait que N-1 ; le PA ne peut pas savoir qu’un N‑ième existait. Piste : engagement sur le **contenu** (e.g. hash de l’ensemble des bids) ou mécanisme de réclamation si un BA prouve avoir envoyé un bid à temps. |
| **Sybil / réputation** | Beaucoup de comptes pour gonfler sa réputation. | diversity_factor, âge des contreparties, progressive trust. | Les « unique counterparties » peuvent être des Sybils coordonnés sur plusieurs relais. Combiner avec attestations cross-relay et, à terme, coût (staking, proof-of-work léger) ou identité vérifiable. |
| **DoS / spam** | Flood de RFQs ou de BIDs. | Rate limits (10 RFQ/min PA, 100 BID/min BA). | Par IP ou par clé : un attaquant avec beaucoup d’IPs ou de clés peut diluer la limite. Ponderer par coût (e.g. micro-dépôt par RFQ sur relais publics) ou par preuve (CAPTCHA, token). |

### 3.2 Spécification vs implémentation (PoC)

- Le **relay-server.js** actuel est un **démo HTTP** (POST /v1/demo) qui simule le flux en mémoire. Il n’implémente pas :
  - WebSocket relais (connexions agents)
  - `delivery_ack` / `bid_commitment`
  - Fédération (via, plusieurs relais)
  - Vraie validation des schemas de catégorie
- La **site** affiche `delivery_ack` et `bid_commitment` comme si ils existaient, alors qu’ils ne sont pas émis par un vrai relais.
- **Recommandation** : soit documenter clairement que le PoC est une « simulation » (et ajouter une checklist spec vs PoC), soit implémenter un relais minimal conforme (WebSocket + delivery_ack + bid_commitment) pour valider la spec.

### 3.3 Fédération

- **Max 3 hops** : limite la portée géographique pour des intents très larges (ex. « n’importe où en Europe »). Selon le modèle économique des relais, cela peut être voulu ; à documenter.
- **Via-chain** : chaque relais signe le `via`. Si un relais malveillant retire un hop de la chaîne, les signatures précédentes ne correspondent plus → c’est cohérent. Mais la **découverte** des pairs (DNS SRV, registre) n’est pas sécurisée : un relais peut annoncer de faux pairs. Prévoir une liste de relais « connus » ou des attestations de pairs.
- **Boucles** : la règle « ne pas retransmettre si déjà dans `via` » évite les boucles simples ; en revanche, des topologies en anneau (A→B→C→A) ne sont pas évidentes à éviter sans id unique de « requête » (ex. rfq_id + ensemble des relais déjà vus).

### 3.4 Privacy

- **Géo** : arrondi à 2 décimales (~1 km). Pour des services très locaux (livraison, dépannage), 1 km peut encore être trop précis pour la vie privée. Envisager des niveaux (ex. ville, arrondissement, ~1 km).
- **Budget optionnel** : bonne idée ; mais si omis, le relais route à tous les BAs de la catégorie/géo, ce qui peut augmenter le bruit pour les BAs. Documenter le trade-off.
- **Deals persistants** : la spec exige de garder les deals (pour litiges). Durée de rétention (30 jours après FULFILLED/CANCELLED) et droit à l’effacement (RGPD) à clarifier par juridiction.

### 3.5 Économie et griefing

- **Annulations** : `cancellation_rate > 0.20` → flag, `> 0.40` → suspension. Un concurrent peut créer des PAs, accepter des deals avec un BA cible puis annuler systématiquement pour dégrader son taux. Mitigation partielle : compter les annulations par **contrepartie** (même PA qui annule souvent compte plus) et par **âge du PA**.
- **Micro-dépôt** : recommandé mais optionnel. Sans dépôt, le coût d’une fausse réservation est faible pour un PA malveillant.
- **Pas de pénalité on-chain** : en dehors de la réputation et des règles de relais, pas de sanction « économique » vérifiable (ex. slashing). Pour v0.4 (intents on-chain), les bounties pourront jouer ce rôle.

---

## 4. Améliorations proposées

### 4.1 Spec / protocole

1. **Settlement proof**  
   Ajouter dans `receipt` (ou message dédié) un champ optionnel `settlement_proof`: `{ method, reference, tx_hash_or_invoice_id }` pour lier le deal à un paiement vérifiable.

2. **Attestations de deal cross-relay**  
   Format standardisé (signed payload : deal_id, client, provider, relay, amount, timestamp). Les relais les échangent ou les publient pour que la réputation soit calculable de façon déterministe et anti-triche.

3. **Règles explicites anti-phishing**  
   Dans SECURITY.md / SCHEMAS : interdiction de URLs, numéros de téléphone, et chaînes ressemblant à des instructions dans `location.name`, `location.address`, et tout champ affiché à l’utilisateur. SDK : sanitization par défaut (strip URLs, détection de motifs type téléphone).

4. **Bid commitment plus fort**  
   En plus du nombre et du hash des IDs, engagement sur le hash d’un agrégat des offres (ex. hash(sorted(bid_id, from, price)) pour chaque bid). Le PA peut vérifier qu’aucun bid « meilleur » n’a été omis (sous réserve que le relais publie l’engagement).

5. **Documentation « spec vs PoC »**  
   Un tableau ou un fichier (e.g. SPEC_VS_POC.md) listant chaque exigence MUST/SHOULD de la spec et le statut dans le PoC (implémenté / simulé / absent).

### 4.2 Implémentation

6. **Relais minimal conforme**  
   Une implémentation (Node ou Rust) avec : WebSocket, enregistrement d’agents, routage catégorie+géo, envoi de `delivery_ack` et `bid_commitment`, génération de deal signé, pas de fédération au début. Servira de référence pour les tests de conformité.

7. **Tests de sécurité dans la CI**  
   Tests automatisés : messages avec signatures invalides, TTL expiré, specs invalides (injection, champs trop longs), rate limits. Idéalement un fuzzer sur les schemas.

8. **Category schema registry versionné**  
   Les schemas de catégories (ex. `services.beauty.haircut`) en fichiers versionnés (JSON Schema) avec numéro de version ; les messages référencent la version du schema pour éviter les dérives.

### 4.3 Produit / écosystème

9. **Onboarding « premier deal »**  
   Pour les BAs : flux explicite « brancher mon salon en 5 min » (clé, catégories, horaires, geo). Pour les PAs : « connecter mon agent » (clé, relais). Réduire la friction pour la première adoption.

10. **Relay directory avec métriques**  
    Un annuaire (relays.intentprotocol.org ou équivalent) avec stats publiques (uptime, nb de deals, nb d’agents, politique de rétention). Permet de choisir un relais et de détecter les relais qui « sous-deliver » (peu de bids par RFQ).

---

## 5. Synthèse

| Aspect | Évaluation | Priorité d’amélioration |
|--------|------------|-------------------------|
| Vision (standard agent-to-agent) | Forte, mais dépend de l’adoption et de la liquidité | Clarifier la proposition de valeur pour les BAs et les plateformes |
| Sécurité (injection, relais, Sybil) | Bien pensée (spec), partiellement implémentée | Conformité PoC, settlement proof, attestations |
| Fédération | Conçue, non démontrée en PoC | Implémenter 1 relais conforme puis 2 relais fédérés |
| Privacy / conformité | Bonnes bases (géo, budget optionnel, ephemeral) | Documenter rétention et effacement (RGPD) |
| Économie / griefing | Limites par réputation et taux d’annulation | Pénalités par contrepartie, micro-dépôt encouragé |

Le protocole est **solide sur le papier** (surtout SECURITY.md et la structure des messages) et **ambitieux sur la roadmap**. Les principaux risques sont : (1) l’écart entre spec et PoC, (2) l’absence de preuve de settlement et de réputation cross-relay vérifiable, (3) la dépendance à l’adoption par des BAs réels. En priorisant un relais conforme, des attestations de deal et une doc spec-vs-PoC, le projet renforce la crédibilité technique et la capacité à convaincre des partenaires.

---

*Document rédigé après lecture de la spec v0.1 (PROTOCOL, SCHEMAS, SECURITY, RELAY, EXAMPLES), du ROADMAP, du README et du PoC (relay-server.js, protocol.js).*
