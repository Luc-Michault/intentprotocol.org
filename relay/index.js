/**
 * Intent Protocol v0.3 Conformant Relay — "Trust & Recovery"
 *
 * v0.2 features:
 * - WebSocket at /v1/ws
 * - delivery_ack after routing RFQ
 * - bid_commitment (with bids_content_hash) when RFQ TTL expires
 * - deal + deal_attestation on FULFILLED
 * - Anti-phishing, rate limits, signatures
 *
 * v0.3 additions:
 * - Key rotation (compromised/scheduled/precautionary) with deal quarantine
 * - Circuit breakers (volume spike detection, auto-quarantine)
 * - Agent status tracking (active/quarantined/throttled)
 * - Key history audit trail
 * - SECURITY_REVOCATION notifications to counterparties
 * - Clock skew validation
 * - New endpoints: /v1/agents/:id/status, /v1/agents/:id/key-history,
 *   /v1/relay/circuit-breaker-config, /v1/deals?state=quarantined
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { createHash } from 'crypto';
import { generateKeypair, verify, verifyPayload } from './crypto.js';
import { geoMatch } from './geo.js';
import {
  categoryMatch,
  makeDeliveryAck,
  makeBidCommitment,
  makeDeal,
  makeDealAttestation,
  makeKeyRotationNotice,
  makeDealQuarantine,
  makeSecurityRevocation,
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

// ── v0.3 State ─────────────────────────────────────────
const agentStatus = new Map();     // agentId -> 'active' | 'quarantined' | 'throttled'
const keyHistory = new Map();      // agentId -> [{ pubkey, from, to, reason }]
const messageRates = new Map();    // agentId -> { timestamps: [], baseline: 0 }
const MIN_BID_WINDOW_MS = parseInt(process.env.MIN_BID_WINDOW_MS || '5000', 10);
const QUARANTINE_LOOKBACK_S = 72 * 3600; // 72h

const CIRCUIT_BREAKER = {
  volume_spike_multiplier: 10,
  volume_window_ms: 5 * 60_000,
  baseline_window_ms: 60 * 60_000,
  clock_skew_max_s: 30,
  quarantine_appeal_window_h: 72,
  min_bid_window_ms: MIN_BID_WINDOW_MS,
};
const REPUTATION_DECAY = {
  half_life_days: 90,
};

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

function getAgentRecoveryPubkey(agentId) {
  const a = agents.get(agentId);
  return a?.recovery_pubkey || null;
}

/** Canonical JSON for owner attestation (sorted keys). */
function canonicalPayload(obj) {
  const sorted = (o) => {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(sorted);
    return Object.keys(o).sort().reduce((acc, k) => { acc[k] = sorted(o[k]); return acc; }, {});
  };
  return JSON.stringify(sorted(obj));
}

function verifyOwnerAttestation(payloadObj, attestationStr, recoveryPubkeyRaw) {
  if (!attestationStr || !recoveryPubkeyRaw) return false;
  const payloadStr = canonicalPayload(payloadObj);
  const pubkeyB64 = recoveryPubkeyRaw.startsWith('ed25519:') ? recoveryPubkeyRaw.slice(8) : recoveryPubkeyRaw;
  return verifyPayload(payloadStr, attestationStr, pubkeyB64);
}

/** v0.3: Send to PA only bids not yet sent (after min_bid_window). */
function flushBidsToPA(entry) {
  if (!entry.senderWs || !entry.bids) return;
  for (const b of entry.bids) {
    if (entry.sentBidIds.has(b.id)) continue;
    try {
      entry.senderWs.send(JSON.stringify(b));
      entry.sentBidIds.add(b.id);
    } catch (_) {}
  }
}

// ── v0.3: Agent Status & Circuit Breaker ────────────────
function getAgentStatus(agentId) {
  return agentStatus.get(agentId) || 'active';
}

function setAgentStatus(agentId, status) {
  agentStatus.set(agentId, status);
}

function trackMessageRate(agentId) {
  const now = Date.now();
  if (!messageRates.has(agentId)) messageRates.set(agentId, { timestamps: [], baseline: 5 });
  const entry = messageRates.get(agentId);
  entry.timestamps = entry.timestamps.filter(t => t > now - CIRCUIT_BREAKER.baseline_window_ms);
  entry.timestamps.push(now);

  // Update baseline (messages per 5 min over the last hour)
  const oldTs = entry.timestamps.filter(t => t < now - CIRCUIT_BREAKER.volume_window_ms);
  if (oldTs.length > 0) {
    const periodCount = Math.max(1, (now - CIRCUIT_BREAKER.volume_window_ms - Math.min(...oldTs)) / CIRCUIT_BREAKER.volume_window_ms);
    entry.baseline = Math.max(5, Math.ceil(oldTs.length / periodCount));
  }

  // Check for spike in last 5 min
  const recentTs = entry.timestamps.filter(t => t > now - CIRCUIT_BREAKER.volume_window_ms);
  if (recentTs.length > entry.baseline * CIRCUIT_BREAKER.volume_spike_multiplier) {
    setAgentStatus(agentId, 'quarantined');
    console.log(`[circuit-breaker] Agent ${agentId} quarantined: volume spike (${recentTs.length} msgs in 5min, baseline ${entry.baseline})`);
    return false;
  }
  return true;
}

function addKeyHistory(agentId, pubkey, reason = 'initial') {
  if (!keyHistory.has(agentId)) keyHistory.set(agentId, []);
  const history = keyHistory.get(agentId);
  // Close previous entry
  if (history.length > 0 && !history[history.length - 1].to) {
    history[history.length - 1].to = Math.floor(Date.now() / 1000);
  }
  history.push({ pubkey, from: Math.floor(Date.now() / 1000), to: null, reason });
}

function quarantineDealsForKey(agentId, compromisedKey) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - QUARANTINE_LOOKBACK_S;
  const affected = [];
  for (const [dealId, entry] of deals) {
    if (!entry.dealMsg?.deal) continue;
    const deal = entry.dealMsg.deal;
    const dealTs = entry.dealMsg.ts ?? 0;
    if (dealTs < windowStart) continue; // only deals created within 72h
    if ((deal.client?.agent === agentId || deal.provider?.agent === agentId) && deal.state !== 'QUARANTINED') {
      deal.state = 'QUARANTINED';
      affected.push(dealId);
    }
  }
  return { affected, windowStart, windowEnd: now };
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

  // v0.3: Check agent status (circuit breaker)
  const status = getAgentStatus(senderKey);
  if (status === 'quarantined' && msg.type !== 'quarantine_appeal') {
    sendError(ws, 'E_QUARANTINED', msg.id);
    return;
  }

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

  // v0.3: Track message rate for circuit breaker
  if (!trackMessageRate(senderKey)) {
    sendError(ws, 'E_QUARANTINED', msg.id);
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
      recovery_pubkey: msg.recovery_pubkey || profile.recovery_pubkey || null,
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

  // ── KEY ROTATION (v0.3) ────────────────────────────────
  if (msg.type === 'key_rotation') {
    const targetAgent = agents.get(msg.agent);
    if (!targetAgent || msg.agent !== senderId) {
      sendError(ws, 'E_INVALID', msg.id);
      return;
    }
    if (targetAgent.pubkey !== msg.old_pubkey) {
      sendError(ws, 'E_AUTH', msg.id);
      return;
    }
    // reason "compromised" REQUIRES valid owner attestation (recovery key)
    if (msg.reason === 'compromised') {
      const recoveryPub = getAgentRecoveryPubkey(msg.agent);
      if (!recoveryPub || !msg.owner_attestation) {
        sendError(ws, 'E_INVALID: compromised rotation requires recovery_pubkey and owner_attestation', msg.id);
        return;
      }
      const rotationPayload = { agent: msg.agent, old_pubkey: msg.old_pubkey, new_pubkey: msg.new_pubkey, reason: msg.reason, ts: msg.ts };
      if (!verifyOwnerAttestation(rotationPayload, msg.owner_attestation, recoveryPub)) {
        sendError(ws, 'E_AUTH: invalid owner_attestation', msg.id);
        return;
      }
    }
    addKeyHistory(msg.agent, msg.old_pubkey, 'rotated');
    targetAgent.pubkey = msg.new_pubkey;
    addKeyHistory(msg.agent, msg.new_pubkey, msg.reason || 'rotation');

    if (msg.reason === 'compromised') {
      const { affected, windowStart, windowEnd } = quarantineDealsForKey(msg.agent, msg.old_pubkey);
      if (affected.length > 0) {
        const quarantineMsg = makeDealQuarantine(RELAY_ID, relayKeypair.secretKey, msg.agent, msg.old_pubkey, affected, windowStart, windowEnd);
        // Notify counterparties
        for (const dealId of affected) {
          const dealEntry = deals.get(dealId);
          if (!dealEntry) continue;
          const revocation = makeSecurityRevocation(RELAY_ID, relayKeypair.secretKey, msg.agent, [dealId]);
          const { rfq, bid } = dealEntry;
          const counterpartyId = rfq.from === msg.agent ? bid.from : rfq.from;
          const counterpartyAgent = agents.get(counterpartyId);
          if (counterpartyAgent) {
            try { counterpartyAgent.ws.send(JSON.stringify(revocation)); } catch (_) {}
          }
        }
        try { ws.send(JSON.stringify(quarantineMsg)); } catch (_) {}
      }
    }

    // Broadcast key_rotation_notice to all connected agents
    const notice = makeKeyRotationNotice(RELAY_ID, relayKeypair.secretKey, msg.agent, msg.old_pubkey, msg.new_pubkey, msg.reason);
    for (const [, agent] of agents) {
      try { agent.ws.send(JSON.stringify(notice)); } catch (_) {}
    }
    try { ws.send(JSON.stringify({ type: 'key_rotated', agent: msg.agent })); } catch (_) {}
    console.log(`[key-rotation] Agent ${msg.agent} rotated key (reason: ${msg.reason})`);
    return;
  }

  // ── QUARANTINE APPEAL (v0.3) ──────────────────────────
  if (msg.type === 'quarantine_appeal') {
    if (getAgentStatus(senderId) !== 'quarantined') {
      sendError(ws, 'E_INVALID', msg.id);
      return;
    }
    if (!msg.owner_attestation) {
      sendError(ws, 'E_INVALID: quarantine_appeal requires owner_attestation', msg.id);
      return;
    }
    const targetAgent = agents.get(senderId);
    const appealPayload = { agent: senderId, type: 'quarantine_appeal', ts: msg.ts ?? Math.floor(Date.now() / 1000) };
    const recoveryPub = getAgentRecoveryPubkey(senderId);
    const currentPub = getAgentPubkey(senderId);
    const verified = recoveryPub
      ? verifyOwnerAttestation(appealPayload, msg.owner_attestation, recoveryPub)
      : verifyOwnerAttestation(appealPayload, msg.owner_attestation, currentPub);
    if (!verified) {
      sendError(ws, 'E_AUTH: invalid owner_attestation', msg.id);
      return;
    }
    setAgentStatus(senderId, 'active');
    try { ws.send(JSON.stringify({ type: 'quarantine_lifted', agent: senderId })); } catch (_) {}
    console.log(`[quarantine] Appeal accepted for ${senderId}`);
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
      sentBidIds: new Set(),
      rfqReceivedAt: Date.now(),
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
      flushBidsToPA(entry);
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
    if (Date.now() - entry.rfqReceivedAt >= MIN_BID_WINDOW_MS) {
      flushBidsToPA(entry);
    }
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
      proto: 'intent/0.3',
      host: RELAY_HOST,
    });
  }

  // ── v0.3 Endpoints ────────────────────────────────────

  // GET /v1/agents/:id/status
  const agentStatusMatch = path.match(/^\/v1\/agents\/([^/]+)\/status$/);
  if (req.method === 'GET' && agentStatusMatch) {
    const agentId = decodeURIComponent(agentStatusMatch[1]);
    return sendJson({
      agent: agentId,
      status: getAgentStatus(agentId),
      connected: agents.has(agentId),
    });
  }

  // GET /v1/agents/:id/key-history
  const keyHistoryMatch = path.match(/^\/v1\/agents\/([^/]+)\/key-history$/);
  if (req.method === 'GET' && keyHistoryMatch) {
    const agentId = decodeURIComponent(keyHistoryMatch[1]);
    return sendJson({
      agent: agentId,
      history: keyHistory.get(agentId) || [],
    });
  }

  // GET /v1/relay/circuit-breaker-config
  if (req.method === 'GET' && path === '/v1/relay/circuit-breaker-config') {
    return sendJson({
      ...CIRCUIT_BREAKER,
      reputation_decay: REPUTATION_DECAY,
    });
  }

  // GET /v1/deals?state=quarantined
  if (req.method === 'GET' && path === '/v1/deals' && url.searchParams.get('state') === 'quarantined') {
    const quarantined = [];
    for (const [dealId, entry] of deals) {
      if (entry.dealMsg?.deal?.state === 'QUARANTINED') {
        quarantined.push({ deal_id: dealId, deal: entry.dealMsg.deal });
      }
    }
    return sendJson({ quarantined, count: quarantined.length });
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
  console.log(`Intent Protocol v0.3 Relay: ws://${RELAY_HOST}:${PORT}/v1/ws`);
  console.log(`  Health: http://localhost:${PORT}/v1/health`);
  console.log(`  Stats:  http://localhost:${PORT}/v1/stats`);
  console.log(`  Deals:  http://localhost:${PORT}/v1/deals/:id`);
});
