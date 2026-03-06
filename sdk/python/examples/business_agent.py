#!/usr/bin/env python3
"""Business Agent Example — Register a salon and respond to RFQs.

Usage: python examples/business_agent.py [relay-url]
Default relay: ws://localhost:3100
"""

import asyncio
import signal
import sys

from intentprotocol import IntentClient, BusinessProfile

RELAY = sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:3100"


async def main():
    # 1. Create and connect with business profile
    client = IntentClient(RELAY)
    client.generate_identity("salon-bella")

    await client.connect()
    await client.register(BusinessProfile(
        name="Salon Bella",
        categories=["services.beauty.haircut", "services.beauty.nails"],
        geo={"lat": 43.296, "lon": -0.371, "radius_km": 15},
        hours={
            "mon": ["09:00-19:00"],
            "tue": ["09:00-19:00"],
            "wed": None,
            "thu": ["09:00-19:00"],
            "fri": ["09:00-19:00"],
            "sat": ["09:00-17:00"],
            "sun": None,
        },
        languages=["fr", "en"],
        payment_methods=["card", "cash"],
    ))

    print(f"✅ Registered as {client.identity.agent_id}")
    print("👂 Listening for RFQs...\n")

    # 2. Handle incoming RFQs
    async def handle_rfq(rfq: dict):
        intent = rfq.get("intent", {})
        print(f"📨 RFQ received from {rfq.get('from')}:")
        print(f"   Category: {intent.get('category')}")
        print(f"   Budget:   max {intent.get('budget', {}).get('max')}{intent.get('budget', {}).get('currency')}")
        print(f"   When:     {intent.get('when', {}).get('after')} → {intent.get('when', {}).get('before')}")

        # Auto-bid
        offer = {
            "price": 28.00,
            "currency": "EUR",
            "when": "2026-03-06T14:30:00Z",
            "duration_min": 30,
            "service": intent.get("specs", {}).get("service", "Coupe"),
            "location": {
                "name": "Salon Bella",
                "address": "12 rue des Arts, 64000 Pau",
                "lat": 43.296,
                "lon": -0.371,
            },
            "conditions": {
                "cancellation": "free_24h",
                "payment_methods": ["card", "cash"],
            },
        }
        reputation = {
            "deals_completed": 847,
            "rating_avg": 4.7,
            "disputes": 2,
            "verified": True,
        }

        await client.bid(rfq.get("id", ""), offer, reputation, rfq.get("from"))
        print(f"   → BID sent: {offer['price']}€ @ {offer['when']}\n")

    await client.on_intent(handle_rfq)

    # 3. Handle deals
    def handle_deal(deal):
        print(f"✨ DEAL confirmed: #{deal.id[:12]}...")
        print(f"   Client:  {deal.client.get('agent')}")
        print(f"   Service: {deal.terms.get('service')}")
        print(f"   Price:   {deal.terms.get('price')}€")
        print(f"   When:    {deal.terms.get('when')}\n")

    client.on("deal", handle_deal)

    # 4. Keep alive
    print("Press Ctrl+C to stop.\n")
    stop = asyncio.Event()
    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGINT, stop.set)

    await stop.wait()
    print("\n👋 Shutting down...")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
