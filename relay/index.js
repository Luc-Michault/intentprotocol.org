/**
 * Intent Protocol v0.2 Conformant Relay
 *
 * - WebSocket at /v1/ws
 * - delivery_ack after routing RFQ
 * - bid_commitment (with bids_content_hash) when RFQ TTL expires, then bids already forwarded
 * - deal + deal_attestation on FULFILLED
 * - Anti-phishing, rate limits, signatures, /v1/stats, /v1/health, /v1/deals/:id, /v1/deals/:id/attestation
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { createHash } from 'crypto';
import { generateKeypair, verify } from './crypto.js';
import { geoMatch } from './geo.js';
import {
  categoryMatch,
  makeDeliveryAck,
  makeBidCommitment,
  makeDeal,
  makeDealAttestation,
} from './protocol.js';
import { validateMessage } from './validation.js';

// ── Config ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3100', 10);
const RELAY_HOST = process.env.RELAY_HOST || 'localhost';
const RELAY_ID = `relay:${RELAY_HOST}`;

// Rate limits: 10 RFQ/min per PA, 100 bid/min per BA
const RATE_RFQ_PER_MIN = 10;
const RATE_BID_PER_MIN = 100;
const RATE_WINDOW_MS = 60_000;

// ── State ──────────────────────────────────────────────
const relayKeypair = generateKeypair();
const agents = new Map(); // agentId -> { ws, profile, pubkey, type: 'personal'|'business', categories, geo }
const rfqs = new Map();   // rfqId -> { rfq, senderWs, senderAgent, bids: [], ttlTimer }
const deals = new Map();  // dealId -> { dealMsg, receipts: { client: bool, provider: bool } }
const attestations = new Map(); // dealId -> attestation object

// Rate limit: agentId -> { rfqTs: [], bidTs: [] }
const rateLimit = new Map();
function checkRateLimit(agentId, type) {
  const now = Date.now();
  if (!rateLimit.has(agentId)) rateLimit.set(agentId, { rfqTs: [], bidTs: [] });
  const r = rateLimit.get(agentId);
  const list = type === 'rfq' ? r.rfqTs : r.bidTs;
  const limit = type === 'rfq' ? RATE_RFQ_PER_MIN : RATE_BID_PER_MIN;
  const cutoff = now - RATE_WINDOW_MS;
  const trimmed = list.filter((t) => t > cutoff);
  if (trimmed.length >= limit) return false;
  trimmed.push(now);
  if (type === 'rfq') r.rfqTs = trimmed; else r.bidTs = trimmed;
  return true;
}

// Stats (for /v1/stats)
const stats = {
  rfq_received_30d: 0,
  rfq_routed_30d: 0,
  bids_received_30d: 0,
  bids_delivered_30d: 0,
  deals_finalized_30d: 0,
  startTime: Date.now(),
};

// ── Helpers ─────────────────────────────────────────────
function sendError(ws, code, ref = null) {
  try {
    ws.send(JSON.stringify({ type: 'error', error: code, ref }));
  } catch (_) {}
}

function getAgentPubkey(agentId) {
  const a = agents.get(agentId);
  return a?.pubkey || null;
}

// ── WebSocket handler ───────────────────────────────────
function handleWsMessage(ws, agentId, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(ws, 'E_INVALID');
    return;
  }

  const err = validateMessage(msg);
  if (err) {
    sendError(ws, err, msg.id);
    return;
  }

  const senderKey = msg.from || agentId;
  const pubkeyRaw = getAgentPubkey(senderKey);
  if (!pubkeyRaw) {
    sendError(ws, 'E_AUTH', msg.id);
    return;
  }
  const pubkeyB64 = pubkeyRaw.startsWith('ed25519:') ? pubkeyRaw.slice(8) : pubkeyRaw;
  const { sig, ...rest } = msg;
  if (!verify(rest, sig, pubkeyB64)) {
    sendError(ws, 'E_AUTH', msg.id);
    return;
  }

  // ── Register ─────────────────────────────────────────
  if (msg.type === 'register') {
    const id = msg.agent_id || msg.from;
    if (!id) {
      sendError(ws, 'E_INVALID', null);
      return;
    }
    const profile = msg.profile || {};
    const type = profile.type || (profile.categories ? 'business' : 'personal');
    agents.set(id, {
      ws,
      profile,
      pubkey: msg.pubkey || null,
      type,
      categories: profile.categories || [],
      geo: profile.geo || null,
    });
    try {
      ws.send(JSON.stringify({ type: 'registered', agent_id: id }));
    } catch (_) {}
    return;
  }

  // Resolve agentId from message if not yet set (e.g. first message was rfq)
  const senderId = msg.from || agentId;
  if (!senderId) {
    sendError(ws, 'E_AUTH', msg.id);
    return;
  }

  // ── RFQ ───────────────────────────────────────────────
  if (msg.type === 'rfq') {
    if (!checkRateLimit(senderId, 'rfq')) {
      sendError(ws, 'E_RATE', msg.id);
      return;
    }
    stats.rfq_received_30d++;

    const intent = msg.intent || {};
    const rfqCat = intent.category;
    const rfqWhere = intent.where;
    const matchingAgents = [];
    for (const [aId, agent] of agents) {
      if (agent.ws === ws) continue;
      if (agent.type !== 'business') continue;
      const catOk = categoryMatch(rfqCat, agent.categories);
      const geoOk = geoMatch(rfqWhere, agent.geo);
      if (catOk && geoOk) {
        matchingAgents.push(agent);
      }
    }

    rfqs.set(msg.id, {
      rfq: msg,
      senderWs: ws,
      senderAgent: senderId,
      bids: [],
      ttlTimer: null,
    });

    for (const agent of matchingAgents) {
      try {
        agent.ws.send(JSON.stringify(msg));
      } catch (_) {}
    }
    stats.rfq_routed_30d += matchingAgents.length;

    const ack = makeDeliveryAck(RELAY_ID, relayKeypair.secretKey, msg.id, matchingAgents.length, !!rfqCat, !!rfqWhere);
    try {
      ws.send(JSON.stringify(ack));
    } catch (_) {}

    const ttl = (msg.ttl ?? 30) * 1000;
    const ttlTimer = setTimeout(() => {
      const entry = rfqs.get(msg.id);
      if (!entry) return;
      entry.ttlTimer = null;
      const commitment = makeBidCommitment(RELAY_ID, relayKeypair.secretKey, msg.id, entry.bids);
      try {
        entry.senderWs.send(JSON.stringify(commitment));
      } catch (_) {}
      stats.bids_delivered_30d += entry.bids.length;
      if (entry.bids.length === 0) {
        try {
          entry.senderWs.send(JSON.stringify({ type: 'EXPIRED', ref: msg.id }));
        } catch (_) {}
      }
      rfqs.delete(msg.id);
    }, ttl);
    rfqs.get(msg.id).ttlTimer = ttlTimer;
    return;
  }

  // ── BID ───────────────────────────────────────────────
  if (msg.type === 'bid' && msg.ref) {
    const baId = msg.from;
    if (!checkRateLimit(baId, 'bid')) {
      sendError(ws, 'E_RATE', msg.id);
      return;
    }
    stats.bids_received_30d++;

    const entry = rfqs.get(msg.ref);
    if (!entry) return;
    entry.bids.push(msg);
    try {
      entry.senderWs.send(JSON.stringify(msg));
    } catch (_) {}
    return;
  }

  // ── ACCEPT ─────────────────────────────────────────────
  if (msg.type === 'accept' && msg.accepted_bid) {
    let rfqEntry = null;
    let acceptedBid = null;
    for (const [, e] of rfqs) {
      acceptedBid = e.bids.find((b) => b.id === msg.accepted_bid);
      if (acceptedBid) {
        rfqEntry = e;
        break;
      }
    }
    if (!rfqEntry || !acceptedBid) {
      sendError(ws, 'E_INVALID', msg.id);
      return;
    }

    const dealMsg = makeDeal(rfqEntry.rfq, acceptedBid, msg, RELAY_ID, relayKeypair.secretKey);
    const dealId = dealMsg.id;
    deals.set(dealId, {
      dealMsg,
      rfq: rfqEntry.rfq,
      bid: acceptedBid,
      accept: msg,
      receipts: { client: false, provider: false },
    });
    stats.deals_finalized_30d++;

    try {
      rfqEntry.senderWs.send(JSON.stringify(dealMsg));
    } catch (_) {}
    const providerAgent = agents.get(acceptedBid.from);
    if (providerAgent) {
      try {
        providerAgent.ws.send(JSON.stringify(dealMsg));
      } catch (_) {}
    }
    rfqs.delete(rfqEntry.rfq.id);
    if (rfqEntry.ttlTimer) clearTimeout(rfqEntry.ttlTimer);
    return;
  }

  // ── RECEIPT ───────────────────────────────────────────
  if (msg.type === 'receipt' && msg.ref) {
    const dealEntry = deals.get(msg.ref);
    if (!dealEntry) return;
    const { dealMsg, rfq, bid } = dealEntry;
    const isClient = msg.from === rfq.from;
    const isProvider = msg.from === bid.from;
    if (isClient) dealEntry.receipts.client = true;
    if (isProvider) dealEntry.receipts.provider = true;

    if (dealEntry.receipts.client && dealEntry.receipts.provider) {
      dealEntry.dealMsg.deal.state = 'FULFILLED';
      const terms = dealMsg.deal?.terms || {};
      const attestation = makeDealAttestation(
        RELAY_ID,
        relayKeypair.secretKey,
        dealMsg.id,
        rfq.id,
        rfq.from,
        bid.from,
        terms.price,
        terms.currency,
        'FULFILLED'
      );
      attestations.set(dealMsg.id, attestation);
    }
    return;
  }
}

// ── HTTP server ─────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${RELAY_HOST}`);
  const path = url.pathname;

  const sendJson = (obj, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && path === '/v1/health') {
    return sendJson({ status: 'ok', relay: RELAY_ID, agents: agents.size });
  }

  if (req.method === 'GET' && path === '/v1/stats') {
    const uptimeSec = Math.floor((Date.now() - stats.startTime) / 1000);
    return sendJson({
      rfq_received_30d: stats.rfq_received_30d,
      rfq_routed_30d: stats.rfq_routed_30d,
      bids_received_30d: stats.bids_received_30d,
      bids_delivered_30d: stats.bids_delivered_30d,
      deals_finalized_30d: stats.deals_finalized_30d,
      uptime_sec: uptimeSec,
      agents_connected: agents.size,
    });
  }

  if (req.method === 'GET' && path.startsWith('/v1/deals/') && path.endsWith('/attestation')) {
    const dealId = path.slice('/v1/deals/'.length).replace(/\/attestation$/, '');
    const att = attestations.get(dealId);
    if (!att) {
      return sendJson({ error: 'not_found' }, 404);
    }
    return sendJson(att);
  }

  if (req.method === 'GET' && path.startsWith('/v1/deals/')) {
    const dealId = path.slice('/v1/deals/'.length).split('/')[0];
    const dealEntry = deals.get(dealId);
    if (!dealId || !dealEntry) {
      return sendJson({ error: 'not_found' }, 404);
    }
    return sendJson(dealEntry.dealMsg);
  }

  if (req.method === 'GET' && path === '/v1/info') {
    return sendJson({
      relay_id: RELAY_ID,
      proto: 'intent/0.2',
      host: RELAY_HOST,
    });
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ── WebSocket upgrade ───────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${RELAY_HOST}`);
  if (url.pathname !== '/v1/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  let agentId = null;
  ws.on('message', (raw) => {
    const str = raw.toString();
    try {
      const msg = JSON.parse(str);
      if (msg.type === 'register') agentId = msg.agent_id || msg.from;
      else if (msg.from) agentId = msg.from;
    } catch (_) {}
    handleWsMessage(ws, agentId, str);
  });
  ws.on('close', () => {
    if (agentId) agents.delete(agentId);
    for (const [id, a] of agents) {
      if (a.ws === ws) {
        agents.delete(id);
        break;
      }
    }
  });
});

// Start
server.listen(PORT, () => {
  console.log(`Intent Protocol v0.2 Relay: ws://${RELAY_HOST}:${PORT}/v1/ws`);
  console.log(`  Health: http://localhost:${PORT}/v1/health`);
  console.log(`  Stats:  http://localhost:${PORT}/v1/stats`);
  console.log(`  Deals:  http://localhost:${PORT}/v1/deals/:id`);
});
