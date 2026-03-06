import WebSocket from 'ws';
import { generateKeypair } from './crypto.js';
import { makeRFQ, makeBid, makeAccept, makeCancel, makeReceipt } from './protocol.js';

const DEFAULT_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * Intent Protocol SDK client.
 *
 * Provides a high-level API to interact with an Intent Protocol relay
 * via WebSocket. Handles connection management, message signing,
 * and event dispatching.
 *
 * @example
 * const client = new IntentClient('ws://localhost:3100');
 * client.generateIdentity('my-agent');
 * await client.connect();
 *
 * // Broadcast an RFQ and collect bids
 * const bids = await client.broadcast({
 *   action: 'book',
 *   category: 'services.beauty.haircut',
 *   budget: { max: 30, currency: 'EUR' },
 *   where: { lat: 43.3, lon: -0.37, radius_km: 3 },
 * });
 */
export class IntentClient {
  /**
   * @param {string} relayUrl - WebSocket URL of the relay (e.g. ws://localhost:3100)
   * @param {Object} [options]
   * @param {boolean} [options.autoReconnect=true] - Auto-reconnect on disconnect
   * @param {string} [options.relayDomain] - Relay domain for agent ID (default: extracted from URL)
   */
  constructor(relayUrl, options = {}) {
    this.relayUrl = relayUrl;
    this.autoReconnect = options.autoReconnect ?? true;
    this.relayDomain = options.relayDomain || this._extractDomain(relayUrl);

    /** @type {WebSocket|null} */
    this._ws = null;
    this._identity = null;
    this._listeners = new Map();
    this._pendingBroadcasts = new Map();
    this._reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this._shouldReconnect = false;
    this._connected = false;
    this._registered = false;
    this._registerProfile = null;
  }

  // ── Identity ────────────────────────────────────────

  /**
   * Generate a new Ed25519 identity for this client.
   * @param {string} name - Agent name (used in agent ID)
   * @returns {import('./types.js').AgentIdentity}
   */
  generateIdentity(name) {
    const kp = generateKeypair();
    this._identity = {
      name,
      agentId: `agent:${name}@${this.relayDomain}`,
      publicKey: kp.publicKey,
      secretKey: kp.secretKey,
    };
    return this._identity;
  }

  /**
   * Import an existing identity.
   * @param {import('./types.js').AgentIdentity} identity
   */
  setIdentity(identity) {
    this._identity = identity;
  }

  /**
   * Get the current agent identity.
   * @returns {import('./types.js').AgentIdentity|null}
   */
  get identity() {
    return this._identity;
  }

  // ── Connection ──────────────────────────────────────

  /**
   * Connect to the relay via WebSocket.
   * @returns {Promise<void>} Resolves when connected
   */
  async connect() {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(this.relayUrl);
      this._shouldReconnect = this.autoReconnect;

      this._ws.on('open', () => {
        this._connected = true;
        this._reconnectDelay = DEFAULT_RECONNECT_DELAY;
        this._emit('connected');
        resolve();
      });

      this._ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this._handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      this._ws.on('close', () => {
        this._connected = false;
        this._registered = false;
        this._emit('disconnected');
        if (this._shouldReconnect) {
          setTimeout(() => this._reconnect(), this._reconnectDelay);
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }
      });

      this._ws.on('error', (err) => {
        this._emit('error', err);
        if (!this._connected) reject(err);
      });
    });
  }

  /**
   * Disconnect from the relay.
   */
  disconnect() {
    this._shouldReconnect = false;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
    this._registered = false;
  }

  /**
   * Whether the client is currently connected.
   * @returns {boolean}
   */
  get connected() {
    return this._connected;
  }

  // ── Personal Agent Methods ──────────────────────────

  /**
   * Broadcast an RFQ and collect bids for the TTL duration.
   *
   * @param {import('./types.js').Intent} intent - The intent to broadcast
   * @param {Object} [options]
   * @param {number} [options.ttl=30] - Time to collect bids (seconds)
   * @param {number} [options.maxBids] - Stop early after this many bids
   * @returns {Promise<import('./types.js').BidMessage[]>} Collected bids
   *
   * @example
   * const bids = await client.broadcast({
   *   action: 'book',
   *   category: 'services.beauty.haircut',
   *   budget: { max: 30, currency: 'EUR' },
   *   where: { lat: 43.3, lon: -0.37, radius_km: 3 },
   * }, { ttl: 15 });
   */
  async broadcast(intent, options = {}) {
    this._requireIdentity();
    this._requireConnection();

    const ttl = options.ttl ?? 30;
    const maxBids = options.maxBids ?? Infinity;

    const rfq = makeRFQ(this._identity.agentId, this._identity.secretKey, intent, ttl);
    this._send(rfq);

    return new Promise((resolve) => {
      const bids = [];
      const entry = {
        bids,
        resolve,
        maxBids,
        timer: setTimeout(() => {
          this._pendingBroadcasts.delete(rfq.id);
          resolve(bids);
        }, ttl * 1000),
      };
      this._pendingBroadcasts.set(rfq.id, entry);
    });
  }

  /**
   * Accept a bid and receive the deal.
   *
   * @param {import('./types.js').BidMessage} bid - The bid to accept
   * @param {import('./types.js').Settlement} [settlement] - Settlement terms
   * @returns {Promise<import('./types.js').DealMessage>} The resulting deal
   */
  async accept(bid, settlement) {
    this._requireIdentity();
    this._requireConnection();

    const accept = makeAccept(
      this._identity.agentId,
      this._identity.secretKey,
      bid.id,
      settlement || { method: 'direct', pay_at: 'on_site' },
    );
    this._send(accept);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Deal confirmation timeout'));
      }, 10000);

      const handler = (deal) => {
        if (deal.deal?.bid_id === bid.id || deal.ref === bid.ref) {
          clearTimeout(timeout);
          this.off('deal', handler);
          resolve(deal);
        }
      };
      this.on('deal', handler);
    });
  }

  // ── Business Agent Methods ──────────────────────────

  /**
   * Register as a business agent on the relay.
   *
   * @param {import('./types.js').BusinessProfile} profile - Business profile
   * @returns {Promise<void>} Resolves when registration is confirmed
   */
  async register(profile) {
    this._requireIdentity();
    this._requireConnection();

    this._registerProfile = profile;

    this._send({
      type: 'register',
      agent_id: this._identity.agentId,
      pubkey: 'ed25519:' + this._identity.publicKey,
      profile,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Registration timeout')), 5000);
      const handler = (msg) => {
        if (msg.type === 'registered') {
          clearTimeout(timeout);
          this._registered = true;
          this.off('_raw', handler);
          resolve();
        }
      };
      this.on('_raw', handler);
    });
  }

  /**
   * Listen for incoming RFQs (business agent mode).
   *
   * @param {function(import('./types.js').RFQMessage): void} callback
   */
  onIntent(callback) {
    this.on('rfq', callback);
  }

  /**
   * Send a bid in response to an RFQ.
   *
   * @param {string} rfqId - ID of the RFQ
   * @param {import('./types.js').Offer} offer - Your offer
   * @param {import('./types.js').Reputation} [reputation] - Your reputation
   * @param {string} [to] - Target agent
   */
  async bid(rfqId, offer, reputation, to) {
    this._requireIdentity();
    this._requireConnection();

    const bidMsg = makeBid(
      this._identity.agentId,
      this._identity.secretKey,
      rfqId,
      offer,
      reputation,
      to,
    );
    this._send(bidMsg);
  }

  // ── Deal Management ─────────────────────────────────

  /**
   * Confirm deal fulfillment by sending a receipt.
   *
   * @param {string} dealId - Deal ID
   * @param {Object} [fulfillment] - Fulfillment details
   */
  async confirm(dealId, fulfillment) {
    this._requireIdentity();
    this._requireConnection();

    const receipt = makeReceipt(
      this._identity.agentId,
      this._identity.secretKey,
      dealId,
      fulfillment || { completed: true },
    );
    this._send(receipt);
  }

  /**
   * Cancel a deal.
   *
   * @param {string} dealId - Deal ID
   * @param {string} [reason] - Cancellation reason
   */
  async cancel(dealId, reason) {
    this._requireIdentity();
    this._requireConnection();

    const cancelMsg = makeCancel(
      this._identity.agentId,
      this._identity.secretKey,
      dealId,
      reason,
    );
    this._send(cancelMsg);
  }

  // ── Events ──────────────────────────────────────────

  /**
   * Subscribe to events.
   *
   * @param {'rfq'|'bid'|'deal'|'cancel'|'receipt'|'error'|'connected'|'disconnected'} event
   * @param {Function} callback
   * @returns {this}
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
    return this;
  }

  /**
   * Unsubscribe from events.
   *
   * @param {string} event
   * @param {Function} callback
   * @returns {this}
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      this._listeners.set(
        event,
        listeners.filter((fn) => fn !== callback),
      );
    }
    return this;
  }

  // ── Private ─────────────────────────────────────────

  _extractDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname + (u.port ? ':' + u.port : '');
    } catch {
      return 'localhost';
    }
  }

  _requireIdentity() {
    if (!this._identity) {
      throw new Error('No identity set. Call generateIdentity() or setIdentity() first.');
    }
  }

  _requireConnection() {
    if (!this._connected || !this._ws) {
      throw new Error('Not connected. Call connect() first.');
    }
  }

  _send(data) {
    this._ws.send(JSON.stringify(data));
  }

  _emit(event, ...args) {
    const listeners = this._listeners.get(event) || [];
    for (const fn of listeners) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[IntentClient] Error in ${event} handler:`, err);
      }
    }
  }

  _handleMessage(msg) {
    // Emit raw for internal use
    this._emit('_raw', msg);

    switch (msg.type) {
      case 'rfq':
        this._emit('rfq', msg);
        break;

      case 'bid': {
        this._emit('bid', msg);
        // Check if this bid belongs to a pending broadcast
        const entry = this._pendingBroadcasts.get(msg.ref);
        if (entry) {
          entry.bids.push(msg);
          if (entry.bids.length >= entry.maxBids) {
            clearTimeout(entry.timer);
            this._pendingBroadcasts.delete(msg.ref);
            entry.resolve(entry.bids);
          }
        }
        break;
      }

      case 'deal':
        this._emit('deal', msg);
        break;

      case 'cancel':
        this._emit('cancel', msg);
        break;

      case 'receipt':
        this._emit('receipt', msg);
        break;

      case 'registered':
        // Handled by register() promise
        break;

      default:
        // Unknown message type
        break;
    }
  }

  async _reconnect() {
    if (!this._shouldReconnect) return;
    try {
      await this.connect();
      // Re-register if we were registered before
      if (this._registerProfile) {
        await this.register(this._registerProfile);
      }
    } catch {
      // Will retry via the close handler
    }
  }
}
