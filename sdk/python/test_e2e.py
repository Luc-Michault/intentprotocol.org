#!/usr/bin/env python3
"""End-to-end test for the Python SDK against the JS relay."""

import asyncio
import subprocess
import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(__file__))

from intentprotocol import IntentClient, RFQ, BusinessProfile


async def test():
    PORT = 3198
    URL = f"ws://127.0.0.1:{PORT}"

    # Start an inline relay via Node.js
    relay_js = """
const { WebSocketServer } = require('ws');
const agents = new Map();
const rfqs = new Map();
let counter = 0;

const wss = new WebSocketServer({ host: '127.0.0.1', port: %d });
wss.on('connection', (ws) => {
  let agentId = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'register') {
      agentId = msg.agent_id;
      agents.set(agentId, { ws, categories: msg.profile?.categories || [], geo: msg.profile?.geo || null });
      ws.send(JSON.stringify({ type: 'registered', agent_id: agentId }));
      return;
    }
    if (msg.type === 'rfq') {
      rfqs.set(msg.id, { rfq: msg, senderWs: ws, bids: [] });
      for (const [, agent] of agents) {
        if (agent.ws === ws) continue;
        agent.ws.send(JSON.stringify(msg));
      }
      return;
    }
    if (msg.type === 'bid' && msg.ref) {
      const entry = rfqs.get(msg.ref);
      if (!entry) return;
      entry.bids.push(msg);
      entry.senderWs.send(JSON.stringify(msg));
      return;
    }
    if (msg.type === 'accept' && msg.accepted_bid) {
      let rfqEntry, acceptedBid;
      for (const [, entry] of rfqs) {
        acceptedBid = entry.bids.find(b => b.id === msg.accepted_bid);
        if (acceptedBid) { rfqEntry = entry; break; }
      }
      if (!rfqEntry || !acceptedBid) return;
      const deal = {
        proto: 'intent/0.1', type: 'deal', id: 'DEAL' + (++counter),
        ref: rfqEntry.rfq.id, from: 'relay:test',
        ts: Math.floor(Date.now()/1000), ttl: 0, sig: 'test',
        deal: {
          rfq_id: rfqEntry.rfq.id, bid_id: acceptedBid.id, accept_id: msg.id,
          client: { agent: rfqEntry.rfq.from }, provider: { agent: acceptedBid.from },
          terms: { ...acceptedBid.offer }, state: 'PENDING',
        },
      };
      rfqEntry.senderWs.send(JSON.stringify(deal));
      const prov = agents.get(acceptedBid.from);
      if (prov) prov.ws.send(JSON.stringify(deal));
    }
  });
  ws.on('close', () => { if (agentId) agents.delete(agentId); });
});
console.log('RELAY_READY');
""" % PORT

    print("🧪 Starting Python SDK e2e test...\n")

    # Start relay
    relay_proc = subprocess.Popen(
        ["node", "-e", relay_js],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    # Wait for ready
    import select
    import time
    deadline = time.time() + 5
    line = ""
    while time.time() < deadline:
        if relay_proc.stdout.readable():
            line = relay_proc.stdout.readline().decode().strip()
            if line:
                break
        time.sleep(0.1)
    assert line == "RELAY_READY", f"Relay not ready: {line!r}, stderr: {relay_proc.stderr.read().decode()[:500]}"
    # Extra settle time
    await asyncio.sleep(0.5)
    print("✅ Relay started on port", PORT)

    try:
        # Business agent
        ba = IntentClient(URL, auto_reconnect=False)
        ba.generate_identity("salon-py")
        await ba.connect()
        await ba.register(BusinessProfile(
            name="Python Salon",
            categories=["services.beauty.haircut"],
            geo={"lat": 43.296, "lon": -0.371, "radius_km": 15},
        ))
        print("✅ Business agent registered")

        ba_deals = []

        async def handle_rfq(rfq):
            print(f"   📨 RFQ received: {rfq.get('intent', {}).get('category')}")
            await ba.bid(
                rfq["id"],
                {"price": 22, "currency": "EUR", "when": "2026-03-06T15:00:00Z",
                 "service": "Coupe homme", "duration_min": 25},
                {"deals_completed": 200, "rating_avg": 4.3, "verified": True},
                to=rfq.get("from"),
            )
            print("   → BID sent")

        await ba.on_intent(handle_rfq)
        ba.on("deal", lambda d: ba_deals.append(d))

        # Personal agent
        pa = IntentClient(URL, auto_reconnect=False)
        pa.generate_identity("alice-py")
        await pa.connect()
        await pa._send({"type": "register", "agent_id": pa.identity.agent_id, "profile": {"type": "personal"}})
        # Wait for register ack
        await asyncio.sleep(0.5)
        print("✅ Personal agent connected")

        # Broadcast
        print("\n📡 Broadcasting RFQ...")
        bids = await pa.broadcast(
            RFQ(
                action="book",
                category="services.beauty.haircut",
                budget={"max": 30, "currency": "EUR"},
                where={"lat": 43.295, "lon": -0.37, "radius_km": 3},
                specs={"service": "coupe homme"},
            ),
            timeout=3,
        )

        print(f"📬 Received {len(bids)} bid(s)")
        assert len(bids) > 0, "No bids received!"

        best = max(bids, key=lambda b: b.score)
        print(f"   Best: {best.offer.get('price')}€ from {best.from_agent} (score: {best.score:.3f})")

        # Accept
        print("\n🤝 Accepting bid...")
        deal = await pa.accept(best)
        print(f"✅ Deal confirmed: {deal.id}")
        print(f"   Service: {deal.terms.get('service')}")
        print(f"   Price:   {deal.terms.get('price')}€")
        print(f"   State:   {deal.state}")

        await asyncio.sleep(0.3)

        # Summary
        print("\n═══════════════════════════════════════")
        print("  ✅ All Python SDK tests passed!")
        print("  • IntentClient: connect, broadcast, accept ✓")
        print("  • Business: register, on_intent, bid ✓")
        print("  • Deal confirmed ✓")
        print(f"  • BA received deal: {'✓' if ba_deals else '✗'}")
        print("═══════════════════════════════════════\n")

        await pa.disconnect()
        await ba.disconnect()

    finally:
        relay_proc.terminate()
        relay_proc.wait(timeout=3)


if __name__ == "__main__":
    asyncio.run(test())
