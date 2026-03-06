#!/usr/bin/env python3
"""Personal Agent Example — Book a haircut.

Usage: python examples/personal_agent.py [relay-url]
Default relay: ws://localhost:3100
"""

import asyncio
import sys

from intentprotocol import IntentClient, RFQ

RELAY = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:3100"


async def main():
    # 1. Create and connect
    client = IntentClient(RELAY)
    client.generate_identity("alice")
    await client.connect()

    # Register as personal agent
    await client._send({
        "type": "register",
        "agent_id": client.identity.agent_id,
        "profile": {"type": "personal"},
    })
    print(f"✅ Connected as {client.identity.agent_id}")

    # 2. Broadcast intent — find a haircut nearby
    print("📡 Broadcasting RFQ: haircut in Pau, max 30€...")
    bids = await client.broadcast(
        RFQ(
            action="book",
            category="services.beauty.haircut",
            when={
                "after": "2026-03-06T13:00:00Z",
                "before": "2026-03-06T17:00:00Z",
                "duration_min": 30,
                "prefer": "earliest",
            },
            where={"lat": 43.295, "lon": -0.37, "radius_km": 3, "mode": "provider_location"},
            budget={"max": 30, "currency": "EUR", "prefer": "cheapest"},
            specs={"service": "coupe homme", "language": "fr"},
        ),
        timeout=5,
    )

    print(f"\n📬 Received {len(bids)} bid(s):")
    for bid in bids:
        rep = bid.reputation
        print(
            f"   • {bid.from_agent} — {bid.offer.get('price')}€ "
            f"@ {bid.offer.get('when')} "
            f"(★{rep.get('rating_avg', '?')}, {rep.get('deals_completed', 0)} deals)"
        )

    if not bids:
        print("   No bids received. Is a business agent running?")
        await client.disconnect()
        return

    # 3. Accept the best bid (highest score)
    best = max(bids, key=lambda b: b.score)
    print(f"\n🤝 Accepting best bid from {best.from_agent}...")
    deal = await client.accept(best)

    print("\n✨ Deal confirmed!")
    print(f"   ID:       {deal.id}")
    print(f"   Service:  {deal.terms.get('service')}")
    print(f"   Price:    {deal.terms.get('price')}€")
    print(f"   When:     {deal.terms.get('when')}")
    print(f"   Provider: {deal.provider.get('agent')}")

    # 4. Clean up
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
