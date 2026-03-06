import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { sign } from './crypto.js';

const PROTO_VERSION = 'intent/0.2';

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
    proto: PROTO_VERSION,
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
 * Create a signed Receipt message (v0.2: optional settlement_proof).
 * @param {string} from - Agent identity
 * @param {string} secretKey - Base64 secret key
 * @param {string} dealId - Deal ID being confirmed
 * @param {Object} [fulfillment] - Fulfillment details
 * @param {import('./types.js').SettlementProof} [settlementProof] - Optional payment reference (v0.2)
 * @returns {Object}
 */
export function makeReceipt(from, secretKey, dealId, fulfillment, settlementProof) {
  const payload = { fulfillment: fulfillment || { completed: true } };
  if (settlementProof && typeof settlementProof === 'object') {
    payload.settlement_proof = {
      method: settlementProof.method || 'other',
      reference: settlementProof.reference ?? '',
      amount: settlementProof.amount,
      currency: settlementProof.currency,
    };
  }
  return makeMessage('receipt', from, secretKey, payload, dealId, 0);
}

/**
 * Canonical line for one bid (must match relay computation for v0.2 bid_commitment).
 * @param {import('./types.js').BidMessage} bid
 * @returns {string}
 */
function bidCanonicalLine(bid) {
  const price = bid.offer?.price ?? '';
  const currency = bid.offer?.currency ?? '';
  return `${bid.id}\t${bid.from}\t${price}\t${currency}`;
}

/**
 * Compute bids_content_hash from received bids (same canonical order as relay).
 * Use to verify bid_commitment.bids_content_hash after collecting bids.
 * @param {import('./types.js').BidMessage[]} bids
 * @returns {string} 'sha256:' + hex
 */
export function computeBidsContentHash(bids) {
  const sorted = [...bids].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const contentConcat = sorted.map(bidCanonicalLine).join('\n');
  const hex = createHash('sha256').update(contentConcat, 'utf8').digest('hex');
  return 'sha256:' + hex;
}
