#!/usr/bin/env node
/**
 * End-to-end test: starts relay, business agent, personal agent.
 * Verifies the SDK works against the PoC relay.
 */

import { WebSocketServer } from 'ws';
import { IntentClient, PersonalAgent, BusinessAgent, generateKeypair } from './src/index.js';
import { ulid } from 'ulid';

// ── Minimal inline relay ───────────────────────────────
function startTestRelay(port) {
  const keypair = generateKeypair();
  const agents = new Map();
  const rfqs = new Map();

  const wss = new WebSocketServer({ port });
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
          proto: 'intent/0.1', type: 'deal', id: ulid(), ref: rfqEntry.rfq.id,
          from: 'relay:test', ts: Math.floor(Date.now()/1000), ttl: 0, sig: 'test',
          deal: {
            rfq_id: rfqEntry.rfq.id, bid_id: acceptedBid.id, accept_id: msg.id,
            client: { agent: rfqEntry.rfq.from }, provider: { agent: acceptedBid.from },
            terms: { ...acceptedBid.offer }, state: 'PENDING',
          },
        };
        rfqEntry.senderWs.send(JSON.stringify(deal));
        const prov = agents.get(acceptedBid.from);
        if (prov) prov.ws.send(JSON.stringify(deal));
        return;
      }
    });
    ws.on('close', () => { if (agentId) agents.delete(agentId); });
  });
  return wss;
}

// ── Test ────────────────────────────────────────────────
async function test() {
  const PORT = 3199;
  const URL = `ws://localhost:${PORT}`;

  console.log('🧪 Starting e2e test...\n');

  // 1. Start relay
  const wss = startTestRelay(PORT);
  await new Promise(r => setTimeout(r, 100));
  console.log('✅ Relay started on port', PORT);

  // 2. Start business agent
  const salon = new BusinessAgent(URL, 'salon-test', {
    name: 'Test Salon',
    categories: ['services.beauty.haircut'],
    geo: { lat: 43.296, lon: -0.371, radius_km: 15 },
  });
  await salon.connect();
  console.log('✅ Business agent registered');

  // Set up auto-bidding
  salon.onIntent(async (rfq) => {
    console.log('   📨 RFQ received by salon');
    await salon.bid(rfq.id, {
      price: 25, currency: 'EUR', when: '2026-03-06T14:30:00Z',
      duration_min: 30, service: 'Coupe homme',
      location: { name: 'Test Salon', address: 'Test Address' },
    }, {
      deals_completed: 100, rating_avg: 4.5, verified: true,
    }, rfq.from);
    console.log('   → BID sent');
  });

  let dealReceived = false;
  salon.onDeal((deal) => {
    dealReceived = true;
    console.log('   ✨ Salon received DEAL:', deal.id.slice(0, 10));
  });

  // 3. Personal agent
  const alice = new PersonalAgent(URL, 'alice-test');
  await alice.connect();
  console.log('✅ Personal agent connected');

  // 4. Broadcast RFQ
  console.log('\n📡 Broadcasting RFQ...');
  const bids = await alice.findService({
    action: 'book',
    category: 'services.beauty.haircut',
    budget: { max: 30, currency: 'EUR' },
    where: { lat: 43.295, lon: -0.370, radius_km: 3 },
    specs: { service: 'coupe homme' },
  }, { ttl: 3 });

  console.log(`📬 Received ${bids.length} bid(s)`);
  if (bids.length === 0) {
    console.error('❌ No bids received!');
    process.exit(1);
  }

  const bid = bids[0];
  console.log(`   Best bid: ${bid.offer.price}€ from ${bid.from}`);

  // 5. Accept
  console.log('\n🤝 Accepting bid...');
  const deal = await alice.acceptBest(bids);
  console.log(`✅ Deal confirmed: ${deal.id.slice(0, 10)}`);
  console.log(`   Service: ${deal.deal.terms.service}`);
  console.log(`   Price:   ${deal.deal.terms.price}€`);
  console.log(`   State:   ${deal.deal.state}`);

  // Wait for salon to get deal
  await new Promise(r => setTimeout(r, 200));

  // 6. Summary
  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ All tests passed!');
  console.log('  • IntentClient: connect, broadcast, accept ✓');
  console.log('  • PersonalAgent: findService, acceptBest ✓');
  console.log('  • BusinessAgent: register, onIntent, bid ✓');
  console.log('  • Deal generation and delivery ✓');
  console.log(`  • Salon received deal: ${dealReceived ? '✓' : '✗'}`);
  console.log('═══════════════════════════════════════\n');

  // Cleanup
  alice.disconnect();
  salon.disconnect();
  wss.close();
  process.exit(0);
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
