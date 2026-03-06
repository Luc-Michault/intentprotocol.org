#!/usr/bin/env node
/**
 * Business Agent Example — Register a salon and respond to RFQs.
 *
 * Usage: node examples/business-agent.js [relay-url]
 * Default relay: ws://localhost:3100
 */

import { BusinessAgent } from '../src/index.js';

const RELAY = process.argv[2] || 'ws://localhost:3100';

async function main() {
  // 1. Create and connect with business profile
  const agent = new BusinessAgent(RELAY, 'salon-bella', {
    name: 'Salon Bella',
    categories: ['services.beauty.haircut', 'services.beauty.nails'],
    geo: { lat: 43.296, lon: -0.371, radius_km: 15 },
    hours: {
      mon: ['09:00-19:00'],
      tue: ['09:00-19:00'],
      wed: null,
      thu: ['09:00-19:00'],
      fri: ['09:00-19:00'],
      sat: ['09:00-17:00'],
      sun: null,
    },
    languages: ['fr', 'en'],
    payment_methods: ['card', 'cash'],
  });

  await agent.connect();
  console.log('✅ Registered as', agent.client.identity.agentId);
  console.log('👂 Listening for RFQs...\n');

  // 2. Listen for incoming intents
  agent.onIntent(async (rfq) => {
    console.log(`📨 RFQ received from ${rfq.from}:`);
    console.log(`   Category: ${rfq.intent.category}`);
    console.log(`   Budget:   max ${rfq.intent.budget?.max}${rfq.intent.budget?.currency}`);
    console.log(`   When:     ${rfq.intent.when?.after} → ${rfq.intent.when?.before}`);
    console.log(`   Specs:    ${JSON.stringify(rfq.intent.specs)}`);

    // 3. Auto-bid (in a real agent, this would check availability)
    const offer = {
      price: 28.0,
      currency: 'EUR',
      when: '2026-03-06T14:30:00Z',
      duration_min: 30,
      service: rfq.intent.specs?.service || 'Coupe',
      location: {
        name: 'Salon Bella',
        address: '12 rue des Arts, 64000 Pau',
        lat: 43.296,
        lon: -0.371,
      },
      conditions: {
        cancellation: 'free_24h',
        payment_methods: ['card', 'cash'],
      },
    };

    const reputation = {
      deals_completed: 847,
      rating_avg: 4.7,
      disputes: 2,
      verified: true,
    };

    await agent.bid(rfq.id, offer, reputation, rfq.from);
    console.log(`   → BID sent: ${offer.price}€ @ ${offer.when}\n`);
  });

  // 4. Listen for deals
  agent.onDeal((deal) => {
    console.log(`✨ DEAL confirmed: #${deal.id.slice(0, 12)}...`);
    console.log(`   Client:  ${deal.deal.client.agent}`);
    console.log(`   Service: ${deal.deal.terms.service}`);
    console.log(`   Price:   ${deal.deal.terms.price}€`);
    console.log(`   When:    ${deal.deal.terms.when}\n`);
  });

  // Keep alive
  console.log('Press Ctrl+C to stop.\n');
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    agent.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
