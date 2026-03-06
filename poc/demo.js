import { startRelay } from './relay.js';
import { generateKeypair } from './crypto.js';
import { makeRFQ, makeBid, makeAccept } from './protocol.js';
import WebSocket from 'ws';

// ── Colors & formatting ─────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', purple: '\x1b[35m', blue: '\x1b[34m',
  cyan: '\x1b[36m', yellow: '\x1b[33m',
};

const t0 = Date.now();
let msgCount = 0;

function ts() {
  return `${C.dim}[${String(Date.now() - t0).padStart(4)}ms]${C.reset}`;
}

function logAlice(arrow, msg) { console.log(`${ts()} 🟣 ${C.purple}ALICE${C.reset}     ${arrow} ${msg}`); }
function logSalonB(arrow, msg) { console.log(`${ts()} 🟢 ${C.green}SALON-B${C.reset}   ${arrow} ${msg}`); }
function logSalonC(arrow, msg) { console.log(`${ts()} 🟢 ${C.green}SALON-C${C.reset}   ${arrow} ${msg}`); }

// ── Helpers ─────────────────────────────────────────────
function connect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

function sendJSON(ws, data) { ws.send(JSON.stringify(data)); }
function onMsg(ws) { return new Promise(r => ws.once('message', d => r(JSON.parse(d)))); }

function waitForMessages(ws, count) {
  return new Promise((resolve) => {
    const msgs = [];
    const handler = (data) => {
      msgs.push(JSON.parse(data));
      if (msgs.length >= count) {
        ws.removeListener('message', handler);
        resolve(msgs);
      }
    };
    ws.on('message', handler);
  });
}

// ── Scoring ─────────────────────────────────────────────
function scoreBid(bid, maxBudget) {
  const priceScore = 1 - (bid.offer.price / maxBudget); // lower = better
  const rep = bid.reputation || {};
  const ratingScore = (rep.rating_avg || 3) / 5;
  const volumeBonus = Math.min(1, (rep.deals_completed || 0) / 500);
  const reputationScore = ratingScore * 0.7 + volumeBonus * 0.3;
  return priceScore * 0.4 + reputationScore * 0.6;
}

// ── Main Demo ───────────────────────────────────────────
async function main() {
  console.log();
  console.log(`${C.bold}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  🌐 Intent Protocol — Proof of Concept Demo${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════${C.reset}`);
  console.log();

  // 1. Start relay
  const relay = startRelay(3100);

  // Small delay for server startup
  await new Promise(r => setTimeout(r, 50));

  // 2. Generate keypairs for all agents
  const kpAlice = generateKeypair();
  const kpSalonB = generateKeypair();
  const kpSalonC = generateKeypair();

  // 3. Connect business agents and register
  const wsSalonB = await connect('ws://localhost:3100');
  sendJSON(wsSalonB, {
    type: 'register',
    agent_id: 'agent:salon-bella@relay.pau.fr',
    profile: {
      name: 'Salon Bella',
      categories: ['services.beauty.haircut', 'services.beauty.nails'],
      geo: { lat: 43.296, lon: -0.371, radius_km: 15 },
    }
  });
  await onMsg(wsSalonB); // registered ack
  logSalonB('|', `Registered: ${C.cyan}services.beauty.haircut${C.reset} @ Pau (43.30, -0.37)`);

  const wsSalonC = await connect('ws://localhost:3100');
  sendJSON(wsSalonC, {
    type: 'register',
    agent_id: 'agent:salon-express@relay.pau.fr',
    profile: {
      name: 'Salon Express',
      categories: ['services.beauty.haircut'],
      geo: { lat: 43.294, lon: -0.369, radius_km: 10 },
    }
  });
  await onMsg(wsSalonC); // registered ack
  logSalonC('|', `Registered: ${C.cyan}services.beauty.haircut${C.reset} @ Pau (43.29, -0.37)`);

  // 4. Connect Alice (personal agent)
  const wsAlice = await connect('ws://localhost:3100');
  sendJSON(wsAlice, {
    type: 'register',
    agent_id: 'agent:alice@relay.openclaw.ai',
    profile: { type: 'personal' }
  });
  await onMsg(wsAlice); // registered ack
  logAlice('|', 'Connected to relay');
  console.log();

  // 5. Alice sends RFQ
  const rfq = makeRFQ('agent:alice@relay.openclaw.ai', kpAlice.secretKey, {
    action: 'book',
    category: 'services.beauty.haircut',
    when: {
      after: '2026-03-06T13:00:00Z',
      before: '2026-03-06T17:00:00Z',
      duration_min: 30,
      prefer: 'earliest',
    },
    where: { lat: 43.295, lon: -0.370, radius_km: 3, mode: 'provider_location' },
    budget: { max: 30, currency: 'EUR', prefer: 'cheapest' },
    specs: { service: 'coupe homme', language: 'fr' },
  });
  sendJSON(wsAlice, rfq);
  msgCount++;
  logAlice('→', `RFQ: ${C.bold}Coupe homme${C.reset}, max 30€, Pau, tomorrow 14h`);

  // 6. Set up Alice's bid collector BEFORE bids are sent
  const bidsPromise = waitForMessages(wsAlice, 2);

  // Business agents receive RFQ and send bids
  const rfqAtB = await onMsg(wsSalonB);
  logSalonB('←', 'RFQ received');

  const rfqAtC = await onMsg(wsSalonC);
  logSalonC('←', 'RFQ received');

  // Salon Bella bids
  await new Promise(r => setTimeout(r, 30));
  const bidB = makeBid('agent:salon-bella@relay.pau.fr', kpSalonB.secretKey, rfq.id, {
    price: 28.00,
    currency: 'EUR',
    when: '2026-03-06T14:30:00Z',
    duration_min: 30,
    service: 'Coupe homme',
    location: { name: 'Salon Bella', address: '12 rue des Arts, 64000 Pau', lat: 43.296, lon: -0.371 },
    conditions: { cancellation: 'free_24h', payment_methods: ['card', 'cash'] },
  }, {
    deals_completed: 847,
    rating_avg: 4.7,
    disputes: 2,
    verified: true,
  });
  sendJSON(wsSalonB, bidB);
  msgCount++;
  logSalonB('→', `BID: ${C.bold}28€${C.reset} @ 14:30 — ★4.7 (847 deals)`);

  // Salon Express bids
  await new Promise(r => setTimeout(r, 10));
  const bidC = makeBid('agent:salon-express@relay.pau.fr', kpSalonC.secretKey, rfq.id, {
    price: 22.00,
    currency: 'EUR',
    when: '2026-03-06T14:00:00Z',
    duration_min: 25,
    service: 'Coupe homme',
    location: { name: 'Salon Express', address: '5 place Clemenceau, 64000 Pau', lat: 43.294, lon: -0.369 },
    conditions: { cancellation: 'free_12h', payment_methods: ['card'] },
  }, {
    deals_completed: 45,
    rating_avg: 3.8,
    disputes: 1,
    verified: false,
  });
  sendJSON(wsSalonC, bidC);
  msgCount++;
  logSalonC('→', `BID: ${C.bold}22€${C.reset} @ 14:00 — ★3.8 (45 deals)`);

  // 7. Alice receives bids and evaluates
  const bids = await bidsPromise;
  console.log();
  logAlice('←', `${C.bold}${bids.length} bids${C.reset} received, evaluating...`);

  const scoreB = scoreBid(bids.find(b => b.from.includes('bella')) || bids[0], 30);
  const scoreC = scoreBid(bids.find(b => b.from.includes('express')) || bids[1], 30);

  const best = scoreB >= scoreC ? bidB : bidC;
  const bestName = scoreB >= scoreC ? 'Salon Bella' : 'Salon Express';
  const bestPrice = scoreB >= scoreC ? 28 : 22;

  logAlice('→', `ACCEPT: ${C.bold}${bestName}${C.reset} @ ${bestPrice}€ (score: ${C.cyan}${scoreB.toFixed(2)}${C.reset} vs ${C.cyan}${scoreC.toFixed(2)}${C.reset})`);

  // 8. Set up deal listeners BEFORE sending accept
  const dealAtAliceP = onMsg(wsAlice);
  const dealAtProviderP = onMsg(scoreB >= scoreC ? wsSalonB : wsSalonC);

  // Alice sends ACCEPT
  const accept = makeAccept('agent:alice@relay.openclaw.ai', kpAlice.secretKey, best.id, {
    method: 'direct',
    pay_at: 'on_site',
  });
  sendJSON(wsAlice, accept);
  msgCount++;

  // 9. Both parties receive DEAL
  const dealAtAlice = await dealAtAliceP;
  const dealAtProvider = await dealAtProviderP;
  msgCount += 2; // deal sent to both

  console.log();
  logSalonB('←', `DEAL ${C.bold}#${dealAtAlice.id.slice(0,10)}...${C.reset} confirmed ✅`);
  logAlice('←', `DEAL ${C.bold}#${dealAtAlice.id.slice(0,10)}...${C.reset} confirmed ✅`);

  // ── Summary ─────────────────────────────────────────
  const elapsed = Date.now() - t0;
  console.log();
  console.log(`${C.bold}════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  ✅ Intent resolved in ${elapsed}ms${C.reset}`);
  console.log(`     Messages: ${msgCount} | Agents: 3 | Human input: 0`);
  console.log(`${C.bold}════════════════════════════════════════════════════${C.reset}`);
  console.log();

  // ── Deal details ──────────────────────────────────────
  console.log(`${C.dim}Deal details:${C.reset}`);
  console.log(`  ${C.dim}ID:${C.reset}       ${dealAtAlice.id}`);
  console.log(`  ${C.dim}Service:${C.reset}  ${dealAtAlice.deal.terms.service}`);
  console.log(`  ${C.dim}Price:${C.reset}    ${dealAtAlice.deal.terms.price}€`);
  console.log(`  ${C.dim}When:${C.reset}     ${dealAtAlice.deal.terms.when}`);
  console.log(`  ${C.dim}Where:${C.reset}    ${dealAtAlice.deal.terms.location?.name || bestName}`);
  console.log(`  ${C.dim}Client:${C.reset}   ${dealAtAlice.deal.client.agent}`);
  console.log(`  ${C.dim}Provider:${C.reset} ${dealAtAlice.deal.provider.agent}`);
  console.log(`  ${C.dim}State:${C.reset}    ${dealAtAlice.deal.state}`);
  console.log();

  // Clean exit
  wsAlice.close();
  wsSalonB.close();
  wsSalonC.close();
  relay.wss.close();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Demo failed:', err);
  process.exit(1);
});
