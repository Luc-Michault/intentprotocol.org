import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateKeypair } from './crypto.js';
import { makeRFQ, makeBid, makeAccept, makeDeal, categoryMatch } from './protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '../site');
const PORT = 3100;

// ── Colors ──────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  blue: '\x1b[34m', green: '\x1b[32m', cyan: '\x1b[36m',
  purple: '\x1b[35m', yellow: '\x1b[33m',
};
function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`${C.dim}${ts}${C.reset} ${C.blue}🔵 SERVER${C.reset}    | ${msg}`);
}

// ── Fake Business Agents ────────────────────────────────
const BUSINESS_AGENTS = [
  {
    id: 'agent:salon-bella@relay.pau.fr',
    name: 'Salon Bella',
    categories: ['services.beauty.haircut', 'services.beauty.nails'],
    geo: { lat: 43.296, lon: -0.371, radius_km: 15 },
    offer: {
      price: 28.00, currency: 'EUR',
      service: 'Coupe homme', duration_min: 30,
      location: { name: 'Salon Bella', address: '12 rue des Arts, 64000 Pau', lat: 43.296, lon: -0.371 },
      conditions: { cancellation: 'free_24h', payment_methods: ['card', 'cash'] },
    },
    reputation: { deals_completed: 847, rating_avg: 4.7, disputes: 2, verified: true },
  },
  {
    id: 'agent:coiff-express@relay.pau.fr',
    name: "Coiff'Express",
    categories: ['services.beauty.haircut'],
    geo: { lat: 43.294, lon: -0.369, radius_km: 10 },
    offer: {
      price: 22.00, currency: 'EUR',
      service: 'Coupe express', duration_min: 20,
      location: { name: "Coiff'Express", address: '5 place Clemenceau, 64000 Pau', lat: 43.294, lon: -0.369 },
      conditions: { cancellation: 'free_12h', payment_methods: ['card'] },
    },
    reputation: { deals_completed: 45, rating_avg: 3.8, disputes: 1, verified: false },
  },
  {
    id: 'agent:bistrot-bearnais@relay.pau.fr',
    name: 'Le Bistrot Béarnais',
    categories: ['services.food.restaurant'],
    geo: { lat: 43.295, lon: -0.372, radius_km: 20 },
    offer: {
      price: 45.00, currency: 'EUR',
      service: 'Menu dégustation', duration_min: 90,
      location: { name: 'Le Bistrot Béarnais', address: '8 rue Henri IV, 64000 Pau', lat: 43.295, lon: -0.372 },
      conditions: { cancellation: 'free_48h', payment_methods: ['card', 'cash'] },
    },
    reputation: { deals_completed: 1203, rating_avg: 4.5, disputes: 5, verified: true },
  },
  {
    id: 'agent:plomberie-dupont@relay.pau.fr',
    name: 'Plomberie Dupont',
    categories: ['services.home.plumber'],
    geo: { lat: 43.300, lon: -0.365, radius_km: 25 },
    offer: {
      price: 80.00, currency: 'EUR',
      service: 'Intervention plomberie', duration_min: 60,
      location: { name: 'Plomberie Dupont', address: '22 av. du Général Leclerc, 64000 Pau', lat: 43.300, lon: -0.365 },
      conditions: { cancellation: 'free_24h', payment_methods: ['card', 'cash', 'check'] },
    },
    reputation: { deals_completed: 312, rating_avg: 4.2, disputes: 3, verified: true },
  },
  {
    id: 'agent:auto-ecole-gave@relay.pau.fr',
    name: 'Auto-École du Gave',
    categories: ['services.education.driving'],
    geo: { lat: 43.292, lon: -0.375, radius_km: 15 },
    offer: {
      price: 35.00, currency: 'EUR',
      service: 'Leçon de conduite', duration_min: 60,
      location: { name: 'Auto-École du Gave', address: '15 bd des Pyrénées, 64000 Pau', lat: 43.292, lon: -0.375 },
      conditions: { cancellation: 'free_24h', payment_methods: ['card'] },
    },
    reputation: { deals_completed: 589, rating_avg: 4.6, disputes: 1, verified: true },
  },
];

// ── Intent Parsing ──────────────────────────────────────
function parseIntent(text) {
  const lower = text.toLowerCase();

  // Category detection
  let category = null;
  if (/coiffeu[rs]?|haircut|coupe|cheveux/.test(lower)) category = 'services.beauty.haircut';
  else if (/restaurant|resto|dîner|déjeuner|dinner|lunch|manger/.test(lower)) category = 'services.food.restaurant';
  else if (/plombi|fuite|plumber|tuyau/.test(lower)) category = 'services.home.plumber';
  else if (/auto[- ]?[ée]cole|conduite|driving|permis/.test(lower)) category = 'services.education.driving';

  // Price extraction
  let maxBudget = null;
  const priceMatch = lower.match(/(?:max|moins de|budget|maximum)\s*(\d+)\s*[€e]?/);
  if (priceMatch) maxBudget = parseInt(priceMatch[1]);
  // Also try "X€ max" pattern
  if (!maxBudget) {
    const priceMatch2 = lower.match(/(\d+)\s*[€e]\s*(?:max|maximum)/);
    if (priceMatch2) maxBudget = parseInt(priceMatch2[1]);
  }

  // Time extraction
  let when = null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timeMatch = lower.match(/(\d{1,2})\s*h/);
  if (timeMatch) {
    tomorrow.setHours(parseInt(timeMatch[1]), 0, 0, 0);
  } else if (/ce soir|tonight/.test(lower)) {
    tomorrow.setDate(tomorrow.getDate() - 1); // today
    tomorrow.setHours(20, 0, 0, 0);
  } else if (/demain|tomorrow/.test(lower)) {
    tomorrow.setHours(14, 0, 0, 0);
  } else {
    tomorrow.setHours(14, 0, 0, 0);
  }
  when = {
    after: tomorrow.toISOString(),
    before: new Date(tomorrow.getTime() + 3 * 3600000).toISOString(),
    duration_min: 30,
    prefer: 'earliest',
  };

  return {
    action: 'book',
    category: category || 'services.beauty.haircut',
    when,
    where: { lat: 43.295, lon: -0.370, radius_km: 5, mode: 'provider_location' },
    budget: { max: maxBudget || 50, currency: 'EUR', prefer: 'cheapest' },
    specs: { language: 'fr' },
  };
}

// ── Scoring ─────────────────────────────────────────────
function scoreBid(bid, maxBudget) {
  const priceScore = 1 - (bid.offer.price / maxBudget);
  const rep = bid.reputation || {};
  const ratingScore = (rep.rating_avg || 3) / 5;
  const volumeBonus = Math.min(1, (rep.deals_completed || 0) / 500);
  const reputationScore = ratingScore * 0.7 + volumeBonus * 0.3;
  return priceScore * 0.4 + reputationScore * 0.6;
}

// ── Demo Endpoint ───────────────────────────────────────
async function handleDemo(intentText) {
  const t0 = Date.now();
  const events = [];

  function event(type, data) {
    events.push({ ts: Date.now() - t0, type, ...data });
  }

  // Generate keys
  const relayKp = generateKeypair();
  const aliceKp = generateKeypair();

  // Parse intent
  const intent = parseIntent(intentText);
  event('intent_parsed', { intent, raw: intentText });

  // Create RFQ
  const rfq = makeRFQ('agent:user@demo', aliceKp.secretKey, intent);
  event('rfq_sent', {
    rfq_id: rfq.id,
    category: intent.category,
    budget: intent.budget,
    where: 'Pau, France',
  });

  // Find matching business agents
  const matching = BUSINESS_AGENTS.filter(ba =>
    categoryMatch(intent.category, ba.categories)
  );

  if (matching.length === 0) {
    event('no_match', { message: 'Aucun prestataire trouvé pour cette catégorie' });
    return events;
  }

  // Business agents respond with bids (with realistic delays)
  const bids = [];
  for (const ba of matching) {
    const delay = 20 + Math.random() * 60;
    await new Promise(r => setTimeout(r, delay));

    const baKp = generateKeypair();
    const adjustedOffer = { ...ba.offer };

    // Adjust the time to match the RFQ
    if (intent.when?.after) {
      const baseTime = new Date(intent.when.after);
      const offset = Math.floor(Math.random() * 120) * 60000; // 0-2h offset
      adjustedOffer.when = new Date(baseTime.getTime() + offset).toISOString();
    }

    const bid = makeBid(ba.id, baKp.secretKey, rfq.id, adjustedOffer, ba.reputation);
    bids.push({ bid, agent: ba });

    event('bid_received', {
      bid_id: bid.id,
      from: ba.name,
      agent_id: ba.id,
      price: adjustedOffer.price,
      currency: adjustedOffer.currency,
      service: adjustedOffer.service,
      rating: ba.reputation.rating_avg,
      deals: ba.reputation.deals_completed,
      verified: ba.reputation.verified,
    });
  }

  // Evaluate bids
  const maxBudget = intent.budget?.max || 50;
  const scored = bids.map(({ bid, agent }) => ({
    bid, agent,
    score: scoreBid(bid, maxBudget),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];

  event('evaluation', {
    scores: scored.map(s => ({
      name: s.agent.name,
      price: s.bid.offer.price,
      score: Math.round(s.score * 100) / 100,
    })),
    winner: best.agent.name,
  });

  // Check budget
  if (intent.budget?.max && best.bid.offer.price > intent.budget.max) {
    event('budget_exceeded', {
      message: `Meilleure offre (${best.bid.offer.price}€) dépasse le budget (${intent.budget.max}€)`,
      best_price: best.bid.offer.price,
    });
  }

  // Accept best bid
  const accept = makeAccept('agent:user@demo', aliceKp.secretKey, best.bid.id, {
    method: 'direct',
    pay_at: 'on_site',
  });

  event('accept_sent', {
    accepted_bid: best.bid.id,
    provider: best.agent.name,
    price: best.bid.offer.price,
  });

  // Generate deal
  const deal = makeDeal(rfq, best.bid, accept, relayKp.secretKey);

  event('deal_created', {
    deal_id: deal.id,
    service: best.bid.offer.service,
    price: best.bid.offer.price,
    currency: best.bid.offer.currency,
    provider: best.agent.name,
    location: best.bid.offer.location?.name || best.agent.name,
    address: best.bid.offer.location?.address,
    when: best.bid.offer.when,
    state: deal.deal.state,
  });

  const elapsed = Date.now() - t0;
  event('resolved', {
    total_ms: elapsed,
    messages: bids.length + 2, // RFQ + bids + accept
    agents: matching.length + 1,
  });

  return events;
}

// ── MIME Types ───────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// ── HTTP Server ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /v1/demo
  if (req.method === 'POST' && req.url === '/v1/demo') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { intent } = JSON.parse(body);
        if (!intent || typeof intent !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing "intent" string in body' }));
          return;
        }
        log(`Demo request: "${intent}"`);
        const events = await handleDemo(intent);
        log(`Demo complete: ${events.length} events, ${events[events.length - 1]?.total_ms || '?'}ms`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ events }));
      } catch (err) {
        log(`Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /v1/health
  if (req.method === 'GET' && req.url === '/v1/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', agents: BUSINESS_AGENTS.length }));
    return;
  }

  // Static files (serve site directory)
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(SITE_DIR, filePath.split('?')[0]);

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  log(`${C.bold}Intent Protocol Demo Server${C.reset}`);
  log(`HTTP API:    ${C.cyan}http://localhost:${PORT}/v1/demo${C.reset}`);
  log(`Static site: ${C.cyan}http://localhost:${PORT}/${C.reset}`);
  log(`Health:      ${C.cyan}http://localhost:${PORT}/v1/health${C.reset}`);
  log(`Agents registered: ${C.bold}${BUSINESS_AGENTS.length}${C.reset}`);
  BUSINESS_AGENTS.forEach(ba => {
    log(`  ${C.green}✓${C.reset} ${ba.name} — ${ba.categories.join(', ')}`);
  });
});
