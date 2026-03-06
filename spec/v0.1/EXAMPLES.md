# Intent Protocol — Transaction Examples

## Example 1: Haircut Booking (Simple)

> "Find me a haircut tomorrow at 2pm, under €30, within 2km"

### Step 1: RFQ
```json
{
  "proto": "intent/0.1",
  "type": "rfq",
  "id": "01JR0001",
  "from": "agent:alice@relay.openclaw.ai",
  "ts": 1741276800,
  "ttl": 30,
  "sig": "ed25519:...",
  "intent": {
    "action": "book",
    "category": "services.beauty.haircut",
    "when": { "after": "2026-03-06T13:00Z", "before": "2026-03-06T15:00Z", "prefer": "earliest" },
    "where": { "lat": 48.86, "lon": 2.35, "radius_km": 2, "mode": "provider_location" },
    "budget": { "max": 30, "currency": "EUR", "prefer": "cheapest" },
    "specs": { "service": "mens_haircut" }
  }
}
```

### Step 2: Bids (3 received in ~200ms)
```json
// Salon A — too expensive, auto-rejected by PA
{ "type": "bid", "ref": "01JR0001", "from": "agent:salon-a@relay.paris.fr",
  "offer": { "price": 35, "currency": "EUR", "when": "2026-03-06T14:00Z" } }

// Salon B — within budget, good time
{ "type": "bid", "ref": "01JR0001", "from": "agent:salon-b@relay.paris.fr",
  "offer": { "price": 28, "currency": "EUR", "when": "2026-03-06T14:30Z",
             "service": "Mens haircut", "duration_min": 30 },
  "reputation": { "deals_completed": 847, "rating_avg": 4.7 } }

// Salon C — cheapest but lower rated
{ "type": "bid", "ref": "01JR0001", "from": "agent:salon-c@relay.paris.fr",
  "offer": { "price": 22, "currency": "EUR", "when": "2026-03-06T14:00Z" },
  "reputation": { "deals_completed": 45, "rating_avg": 3.8 } }
```

### Step 3: Accept (PA selects Salon B — best price/quality ratio)
```json
{ "type": "accept", "ref": "bid_salon_b", "from": "agent:alice@relay.openclaw.ai",
  "settlement": { "method": "direct", "pay_at": "on_site" } }
```

### Step 4: Deal generated, appointment confirmed
**Total time: ~400ms. Zero human interaction during negotiation.**

---

## Example 2: Restaurant Reservation (with negotiation)

> "Book an Italian restaurant tonight for 2, budget €80 max, terrace if possible"

### Step 1: RFQ
```json
{
  "type": "rfq",
  "intent": {
    "action": "book",
    "category": "services.food.restaurant",
    "when": { "after": "2026-03-06T19:00Z", "before": "2026-03-06T21:00Z" },
    "where": { "lat": 48.86, "lon": 2.35, "radius_km": 5 },
    "budget": { "max": 80, "currency": "EUR" },
    "specs": { "cuisine": "italian", "guests": 2, "preferences": ["terrace"] },
    "quantity": 1
  }
}
```

### Step 2: Bids
```json
// Trattoria Roma — terrace available, €70 menu
{ "offer": { "price": 70, "when": "2026-03-06T19:30Z", "guests": 2,
             "details": "4-course tasting menu", "terrace": true } }

// Pasta e Basta — no terrace but 20:00 slot
{ "offer": { "price": 55, "when": "2026-03-06T20:00Z", "guests": 2,
             "terrace": false, "indoor_note": "Intimate vaulted dining room" } }
```

### Step 3: PA counter-offers Trattoria (wants 19:00 not 19:30)
```json
{ "type": "rfq", "ref": "01JR0002",
  "intent": { "when": { "after": "2026-03-06T19:00Z", "before": "2026-03-06T19:15Z" } } }
```

### Step 4: Trattoria adjusts
```json
{ "type": "bid", "offer": { "when": "2026-03-06T19:00Z", "price": 70 } }
```

### Step 5: Accept + Deal
**Total negotiation: 3 rounds, ~800ms.**

---

## Example 3: Emergency Plumber (urgent, with escrow)

> "I have a water leak, I need a plumber NOW"

### Step 1: RFQ (urgent flag, high budget tolerance)
```json
{
  "type": "rfq",
  "intent": {
    "action": "hire",
    "category": "services.home.plumber",
    "when": { "after": "now", "before": "+2h", "prefer": "fastest" },
    "where": { "lat": 48.86, "lon": 2.35, "radius_km": 10, "mode": "client_location" },
    "budget": { "max": 200, "currency": "EUR", "prefer": "fastest" },
    "specs": { "issue": "water_leak", "urgency": "emergency", "access": "house" }
  }
}
```

### Step 2: Single bid (plumber available in 20min)
```json
{ "offer": { "price": 120, "eta_min": 20, "service": "Emergency leak repair",
             "conditions": { "diagnostic_included": true, "parts_extra": true } } }
```

### Step 3: Accept with escrow (high value + no established trust)
```json
{ "type": "accept",
  "settlement": { "method": "escrow_stripe", "amount": 120, "release_on": "receipt_both" } }
```

### Step 4: After repair, both parties confirm
```json
// Plumber receipt
{ "type": "receipt", "fulfillment": { "completed": true, "actual_price": 120,
  "parts_used": [{"name": "3/4 gasket", "price": 8}], "total_with_parts": 128 } }

// Client receipt
{ "type": "receipt", "fulfillment": { "completed": true, "rating_provider": 5 } }
```

**Escrow releases €128 to plumber. Deal fulfilled.**

---

## Example 4: B2B Freelance Hire (invoice settlement)

> "I need a TypeScript developer for 3 days, remote, max €500/day"

### Step 1: RFQ
```json
{
  "type": "rfq",
  "intent": {
    "action": "hire",
    "category": "services.tech.development",
    "when": { "after": "2026-03-10", "before": "2026-03-12", "duration_min": 4320 },
    "where": { "mode": "remote" },
    "budget": { "max": 1500, "currency": "EUR" },
    "specs": { "skills": ["typescript", "react", "nextjs"], "experience_years_min": 3,
               "language": "en", "timezone": "Europe/Paris" }
  }
}
```

### Step 2: Multiple bids from freelance agents
```json
// Dev A — senior, higher price
{ "offer": { "price": 1350, "currency": "EUR", "duration_days": 3,
             "skills": ["typescript", "react", "nextjs", "node"],
             "portfolio": "https://dev-a.com" },
  "reputation": { "deals_completed": 34, "rating_avg": 4.9 } }

// Dev B — mid-level, cheaper
{ "offer": { "price": 900, "currency": "EUR", "duration_days": 3,
             "skills": ["typescript", "react"],
             "portfolio": "https://dev-b.com" },
  "reputation": { "deals_completed": 12, "rating_avg": 4.5 } }
```

### Step 3: Accept Dev A with invoice settlement
```json
{ "type": "accept",
  "settlement": { "method": "invoice", "payment_terms": "net_30", "invoice_format": "factur-x" } }
```

---

## Example 5: Cross-border Product Purchase (crypto escrow)

> "Find me a refurbished MacBook Pro M3, under $1500, ships to France"

### Step 1: RFQ
```json
{
  "type": "rfq",
  "intent": {
    "action": "buy",
    "category": "goods.electronics.laptop",
    "where": { "mode": "delivery", "delivery_to": "FR" },
    "budget": { "max": 1500, "currency": "USD" },
    "specs": { "brand": "apple", "model_contains": "macbook pro",
               "chip_contains": "m3", "condition": "refurbished",
               "warranty_months_min": 6 }
  }
}
```

### Step 2: Bid from refurb dealer agent
```json
{ "offer": { "price": 1299, "currency": "USD", "item": "MacBook Pro 14 M3 16GB 512GB",
             "condition": "Grade A refurbished", "warranty_months": 12,
             "shipping": { "to": "FR", "cost": 45, "days": 5 } },
  "reputation": { "deals_completed": 2340, "rating_avg": 4.6 } }
```

### Step 3: Accept with crypto escrow
```json
{ "type": "accept",
  "settlement": { "method": "escrow_crypto", "chain": "arbitrum",
                  "token": "USDC", "amount": "1344.00",
                  "release_condition": "delivery_confirmed", "timeout": 604800 } }
```

**USDC locked in smart contract. Released when delivery tracking confirms receipt.**

---

## Example 6: Information Request (zero settlement)

> "What are the opening hours for the community pool?"

```json
// RFQ
{ "type": "rfq",
  "intent": { "action": "info", "category": "services.leisure.pool",
              "where": { "lat": 48.86, "lon": 2.35, "radius_km": 5 },
              "specs": { "query": "opening_hours" } } }

// Response (not a bid — just info)
{ "type": "bid",
  "offer": { "price": 0, "info": {
    "name": "Municipal Pool",
    "hours": { "mon-fri": "07:00-21:00", "sat": "08:00-19:00", "sun": "09:00-17:00" },
    "prices": { "adult": 4.50, "child": 2.80, "pack_10": 36 } } },
  "settlement": { "method": "none" } }
```

**Free query, free response. No deal needed.**
