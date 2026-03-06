import { IntentClient } from './client.js';

/**
 * High-level Personal Agent — wraps IntentClient for consumer workflows.
 *
 * @example
 * const agent = new PersonalAgent('ws://localhost:3100', 'alice');
 * await agent.connect();
 * const bids = await agent.findService({
 *   action: 'book',
 *   category: 'services.beauty.haircut',
 *   budget: { max: 30, currency: 'EUR' },
 *   where: { lat: 43.3, lon: -0.37, radius_km: 3 },
 * });
 * const deal = await agent.acceptBest(bids);
 */
export class PersonalAgent {
  /**
   * @param {string} relayUrl - WebSocket URL of the relay
   * @param {string} name - Agent name
   * @param {Object} [options] - IntentClient options
   */
  constructor(relayUrl, name, options = {}) {
    this.client = new IntentClient(relayUrl, options);
    this.client.generateIdentity(name);
    this.name = name;
  }

  /**
   * Connect to the relay.
   */
  async connect() {
    await this.client.connect();
    // Register as personal agent
    this.client._send({
      type: 'register',
      agent_id: this.client.identity.agentId,
      profile: { type: 'personal' },
    });
    // Wait for ack
    await new Promise((resolve) => {
      const handler = (msg) => {
        if (msg.type === 'registered') {
          this.client.off('_raw', handler);
          resolve();
        }
      };
      this.client.on('_raw', handler);
    });
  }

  /**
   * Disconnect from the relay.
   */
  disconnect() {
    this.client.disconnect();
  }

  /**
   * Broadcast an RFQ and collect bids.
   * Alias for client.broadcast().
   *
   * @param {import('./types.js').Intent} intent
   * @param {Object} [options]
   * @returns {Promise<import('./types.js').BidMessage[]>}
   */
  async findService(intent, options) {
    return this.client.broadcast(intent, options);
  }

  /**
   * Score and accept the best bid from a list.
   *
   * @param {import('./types.js').BidMessage[]} bids
   * @param {Object} [options]
   * @param {'cheapest'|'best_rated'|'balanced'} [options.strategy='balanced']
   * @param {import('./types.js').Settlement} [options.settlement]
   * @returns {Promise<import('./types.js').DealMessage>}
   */
  async acceptBest(bids, options = {}) {
    if (!bids.length) throw new Error('No bids to accept');

    const strategy = options.strategy || 'balanced';
    const sorted = [...bids].sort((a, b) => {
      if (strategy === 'cheapest') return a.offer.price - b.offer.price;
      if (strategy === 'best_rated') {
        return (b.reputation?.rating_avg || 0) - (a.reputation?.rating_avg || 0);
      }
      // balanced: weighted score
      return PersonalAgent._score(b) - PersonalAgent._score(a);
    });

    return this.client.accept(sorted[0], options.settlement);
  }

  /**
   * Calculate a composite score for a bid (higher = better).
   * @param {import('./types.js').BidMessage} bid
   * @returns {number}
   */
  static _score(bid) {
    const priceScore = 1 / (1 + (bid.offer?.price || 100));
    const rep = bid.reputation || {};
    const ratingScore = (rep.rating_avg || 3) / 5;
    const volumeBonus = Math.min(1, (rep.deals_completed || 0) / 500);
    const reputationScore = ratingScore * 0.7 + volumeBonus * 0.3;
    return priceScore * 0.4 + reputationScore * 0.6;
  }
}

/**
 * High-level Business Agent — wraps IntentClient for provider workflows.
 *
 * @example
 * const agent = new BusinessAgent('ws://localhost:3100', 'salon-bella', {
 *   name: 'Salon Bella',
 *   categories: ['services.beauty.haircut'],
 *   geo: { lat: 43.296, lon: -0.371, radius_km: 15 },
 * });
 * await agent.connect();
 * agent.onIntent(async (rfq) => {
 *   await agent.bid(rfq.id, {
 *     price: 28, currency: 'EUR',
 *     when: '2026-03-06T14:30:00Z',
 *     service: 'Coupe homme',
 *   });
 * });
 */
export class BusinessAgent {
  /**
   * @param {string} relayUrl - WebSocket URL of the relay
   * @param {string} name - Agent name
   * @param {import('./types.js').BusinessProfile} profile - Business profile
   * @param {Object} [options] - IntentClient options
   */
  constructor(relayUrl, name, profile, options = {}) {
    this.client = new IntentClient(relayUrl, options);
    this.client.generateIdentity(name);
    this.profile = profile;
    this.name = name;
  }

  /**
   * Connect to the relay and register the business profile.
   */
  async connect() {
    await this.client.connect();
    await this.client.register(this.profile);
  }

  /**
   * Disconnect from the relay.
   */
  disconnect() {
    this.client.disconnect();
  }

  /**
   * Listen for incoming RFQs.
   * @param {function(import('./types.js').RFQMessage): void} callback
   */
  onIntent(callback) {
    this.client.onIntent(callback);
  }

  /**
   * Send a bid in response to an RFQ.
   *
   * @param {string} rfqId - RFQ ID
   * @param {import('./types.js').Offer} offer
   * @param {import('./types.js').Reputation} [reputation]
   * @param {string} [to] - Target agent
   */
  async bid(rfqId, offer, reputation, to) {
    await this.client.bid(rfqId, offer, reputation, to);
  }

  /**
   * Confirm deal fulfillment.
   * @param {string} dealId
   * @param {Object} [fulfillment]
   */
  async confirm(dealId, fulfillment) {
    await this.client.confirm(dealId, fulfillment);
  }

  /**
   * Listen for deal events.
   * @param {function(import('./types.js').DealMessage): void} callback
   */
  onDeal(callback) {
    this.client.on('deal', callback);
  }
}
