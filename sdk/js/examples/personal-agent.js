#!/usr/bin/env node
/**
 * Personal Agent Example — Book a haircut in ~10 lines.
 *
 * Usage: node examples/personal-agent.js [relay-url]
 * Default relay: ws://localhost:3100
 */

import { PersonalAgent } from '../src/index.js';

const RELAY = process.argv[2] || 'ws://localhost:3100';

async function main() {
  // 1. Create and connect
  const agent = new PersonalAgent(RELAY, 'alice');
  await agent.connect();
  console.log('✅ Connected as', agent.client.identity.agentId);

  // 2. Broadcast intent — find a haircut nearby
  console.log('📡 Broadcasting RFQ: haircut in Pau, max 30€...');
  const bids = await agent.findService(
    {
      action: 'book',
      category: 'services.beauty.haircut',
      when: {
        after: '2026-03-06T13:00:00Z',
        before: '2026-03-06T17:00:00Z',
        duration_min: 30,
        prefer: 'earliest',
      },
      where: { lat: 43.295, lon: -0.37, radius_km: 3, mode: 'provider_location' },
      budget: { max: 30, currency: 'EUR', prefer: 'cheapest' },
      specs: { service: 'coupe homme', language: 'fr' },
    },
    { ttl: 5 },
  );

  console.log(`\n📬 Received ${bids.length} bid(s):`);
  for (const bid of bids) {
    const rep = bid.reputation || {};
    console.log(
      `   • ${bid.from} — ${bid.offer.price}€ @ ${bid.offer.when}` +
        ` (★${rep.rating_avg || '?'}, ${rep.deals_completed || 0} deals)`,
    );
  }

  if (bids.length === 0) {
    console.log('   No bids received. Is a business agent running?');
    agent.disconnect();
    return;
  }

  // 3. Accept the best bid
  console.log('\n🤝 Accepting best bid...');
  const deal = await agent.acceptBest(bids, { strategy: 'balanced' });

  console.log('\n✨ Deal confirmed!');
  console.log(`   ID:       ${deal.id}`);
  console.log(`   Service:  ${deal.deal.terms.service}`);
  console.log(`   Price:    ${deal.deal.terms.price}€`);
  console.log(`   When:     ${deal.deal.terms.when}`);
  console.log(`   Provider: ${deal.deal.provider.agent}`);

  // 4. Clean up
  agent.disconnect();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
