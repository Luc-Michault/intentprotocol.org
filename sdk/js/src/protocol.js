import { ulid } from 'ulid';
import { sign } from './crypto.js';

/**
 * Build and sign a protocol message.
 * @param {string} type - Message type (rfq, bid, accept, cancel, receipt)
 * @param {string} from - Sender identity
 * @param {string} secretKey - Base64-encoded Ed25519 secret key
 * @param {Object} payload - Type-specific fields
 * @param {string|null} [ref] - Parent message ID
 * @param {number} [ttl] - Time to live in seconds
 * @param {string|null} [to] - Target agent (null for broadcast)
 * @returns {Object} Signed protocol message
 */
export function makeMessage(type, from, secretKey, payload, ref = null, ttl = 30, to = null) {
  const body = {
    proto: 'intent/0.1',
    type,
    id: ulid(),
    ref,
    from,
    ...(to && { to }),
    ts: Math.floor(Date.now() / 1000),
    ttl,
    ...payload,
  };
  body.sig = sign(body, secretKey);
  return body;
}

/**
 * Create a signed RFQ message.
 * @param {string} from - Agent identity
 * @param {string} secretKey - Base64 secret key
 * @param {import('./types.js').Intent} intent - Intent payload
 * @param {number} [ttl=30] - TTL in seconds
 * @returns {import('./types.js').RFQMessage}
 */
export function makeRFQ(from, secretKey, intent, ttl = 30) {
  return makeMessage('rfq', from, secretKey, { intent }, null, ttl);
}

/**
 * Create a signed Bid message.
 * @param {string} from - Agent identity
 * @param {string} secretKey - Base64 secret key
 * @param {string} rfqId - ID of the RFQ being bid on
 * @param {import('./types.js').Offer} offer - The offer
 * @param {import('./types.js').Reputation} [reputation] - Agent reputation
 * @param {string} [to] - Target agent
 * @returns {import('./types.js').BidMessage}
 */
export function makeBid(from, secretKey, rfqId, offer, reputation, to = null) {
  return makeMessage('bid', from, secretKey, { offer, reputation }, rfqId, 60, to);
}

/**
 * Create a signed Accept message.
 * @param {string} from - Agent identity
 * @param {string} secretKey - Base64 secret key
 * @param {string} bidId - ID of the accepted bid
 * @param {import('./types.js').Settlement} [settlement] - Settlement terms
 * @returns {Object}
 */
export function makeAccept(from, secretKey, bidId, settlement) {
  return makeMessage('accept', from, secretKey, { accepted_bid: bidId, settlement }, bidId, 10);
}

/**
 * Create a signed Cancel message.
 * @param {string} from - Agent identity
 * @param {string} secretKey - Base64 secret key
 * @param {string} refId - ID of the message being cancelled
 * @param {string} [reason] - Cancellation reason
 * @returns {Object}
 */
export function makeCancel(from, secretKey, refId, reason) {
  return makeMessage('cancel', from, secretKey, { reason, within_terms: true }, refId, 10);
}

/**
 * Create a signed Receipt message.
 * @param {string} from - Agent identity
 * @param {string} secretKey - Base64 secret key
 * @param {string} dealId - Deal ID being confirmed
 * @param {Object} fulfillment - Fulfillment details
 * @returns {Object}
 */
export function makeReceipt(from, secretKey, dealId, fulfillment) {
  return makeMessage('receipt', from, secretKey, { fulfillment }, dealId, 0);
}
