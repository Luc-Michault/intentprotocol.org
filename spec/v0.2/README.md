# Intent Protocol — v0.2

v0.2 renforce la **base** du protocole : simple à mettre en place, complète pour construire des solutions réelles, fiable en sécurité.

## Documents

- **[CHANGES.md](CHANGES.md)** — Delta complet v0.1 → v0.2 (nouveaux champs, règles, conformité).
- Les documents détaillés (PROTOCOL, SCHEMAS, SECURITY, RELAY) restent en `spec/v0.1/` ; les changements v0.2 sont décrits dans CHANGES.md et seront intégrés dans des mises à jour futures des docs.

## Version de protocole

Les messages v0.2 utilisent :

```json
"proto": "intent/0.2"
```

Les relais v0.2 acceptent les messages `intent/0.1` (compatibilité ascendante) et émettent en `intent/0.2`.

## Résumé des ajouts v0.2

| Domaine | Ajout |
|---------|--------|
| **Settlement** | `settlement_proof` dans receipt (lien deal ↔ paiement) |
| **Réputation** | Deal attestations signées par le relais ; réputation cross-relay vérifiable |
| **Sécurité** | Règles anti-phishing (URL, téléphone) sur champs affichés ; bid_commitment avec `bids_content_hash` |
| **Catégories** | Schema registry versionné ; `category_schema_version` dans RFQ |
| **Griefing** | Annulations pondérées par contrepartie |
| **Conformité** | Relais de référence conforme, SPEC_VS_POC, tests sécurité CI, SDK sanitization |

Voir [CHANGES.md](CHANGES.md) pour le détail et les formats.

## Suite du développement

**[DEVELOPMENT_ORDER.md](DEVELOPMENT_ORDER.md)** décrit l’ordre recommandé : relais conforme d’abord, puis mise à jour des SDK (JS + Python) pour proto 0.2, settlement_proof, sanitization, vérification du bid commitment — et ce qui vient après la v0.2 (fédération, v0.3).
