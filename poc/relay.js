import { WebSocketServer } from 'ws';
import { generateKeypair } from './crypto.js';
import { geoMatch } from './geo.js';
import { makeDeal, categoryMatch } from './protocol.js';

// ── Colors ──────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  blue:  '\x1b[34m',
  green: '\x1b[32m',
  cyan:  '\x1b[36m',
  dim:   '\x1b[2m',
  bold:  '\x1b[1m',
};

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`${C.dim}${ts}${C.reset} ${C.blue}🔵 RELAY${C.reset}     | ${msg}`);
}

// ── Relay Server ────────────────────────────────────────
export function startRelay(port = 3100) {
  const keypair = generateKeypair();
  const agents = new Map();   // agentId → { ws, profile }
  const rfqs = new Map();     // rfqId   → { rfqMsg, senderWs, bids: [] }

  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    let agentId = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // ── Register ──────────────────────────────────────
      if (msg.type === 'register') {
        agentId = msg.agent_id;
        agents.set(agentId, {
          ws,
          profile: msg.profile || {},
          categories: msg.profile?.categories || [],
          geo: msg.profile?.geo || null,
        });
        log(`Agent registered: ${C.bold}${agentId}${C.reset}`);
        ws.send(JSON.stringify({ type: 'registered', agent_id: agentId }));
        return;
      }

      // ── RFQ ───────────────────────────────────────────
      if (msg.type === 'rfq') {
        const rfqCat = msg.intent?.category;
        const rfqWhere = msg.intent?.where;
        rfqs.set(msg.id, { rfq: msg, senderWs: ws, senderAgent: agentId || msg.from, bids: [] });

        let forwarded = 0;
        for (const [aId, agent] of agents) {
          if (agent.ws === ws) continue; // don't send back to sender
          const catOk = rfqCat ? categoryMatch(rfqCat, agent.categories) : true;
          const geoOk = (rfqWhere && agent.geo) ? geoMatch(rfqWhere, agent.geo) : true;
          if (catOk && geoOk) {
            agent.ws.send(JSON.stringify(msg));
            forwarded++;
          }
        }
        log(`RFQ ${C.cyan}${msg.id.slice(0,10)}...${C.reset} → forwarded to ${forwarded} agent(s)`);
        return;
      }

      // ── BID ───────────────────────────────────────────
      if (msg.type === 'bid' && msg.ref) {
        const rfqEntry = rfqs.get(msg.ref);
        if (!rfqEntry) return;
        rfqEntry.bids.push(msg);
        rfqEntry.senderWs.send(JSON.stringify(msg));
        log(`BID ${C.cyan}${msg.id.slice(0,10)}...${C.reset} from ${msg.from} → forwarded to RFQ sender`);
        return;
      }

      // ── ACCEPT ────────────────────────────────────────
      if (msg.type === 'accept' && msg.accepted_bid) {
        // Find the RFQ that this bid belongs to
        let rfqEntry = null;
        let acceptedBid = null;
        for (const [, entry] of rfqs) {
          acceptedBid = entry.bids.find(b => b.id === msg.accepted_bid);
          if (acceptedBid) { rfqEntry = entry; break; }
        }
        if (!rfqEntry || !acceptedBid) return;

        // Generate DEAL
        const deal = makeDeal(rfqEntry.rfq, acceptedBid, msg, keypair.secretKey);
        log(`DEAL ${C.bold}${C.cyan}#${deal.id.slice(0,10)}...${C.reset} generated ✨`);

        // Send deal to both parties
        rfqEntry.senderWs.send(JSON.stringify(deal));

        // Find the provider's ws
        const providerAgent = agents.get(acceptedBid.from);
        if (providerAgent) {
          providerAgent.ws.send(JSON.stringify(deal));
        }

        return;
      }
    });

    ws.on('close', () => {
      if (agentId) {
        agents.delete(agentId);
        log(`Agent disconnected: ${agentId}`);
      }
    });
  });

  log(`Started on ${C.bold}ws://localhost:${port}${C.reset}`);

  return { wss, keypair, agents, rfqs };
}

// Run standalone if executed directly
if (process.argv[1] && process.argv[1].endsWith('relay.js')) {
  const port = parseInt(process.env.PORT || '3100');
  startRelay(port);
}
