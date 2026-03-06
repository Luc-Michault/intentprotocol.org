import { ulid } from 'ulid';
import { sign, sha256Hex } from './crypto.js';

const PROTO = 'intent/0.2';

function relayMessage(type, relayId, relaySecretKey, payload, ref = null) {
  const body = {
    proto: PROTO,
    type,
    id: ulid(),
    ref,
    from: relayId,
    ts: Math.floor(Date.now() / 1000),
    ttl: 0,
    ...payload,
  };
  body.sig = sign(body, relaySecretKey);
  return body;
}

export function makeDeliveryAck(relayId, relaySecretKey, rfqId, routedTo, categoryMatched = true, geoMatched = true) {
  return relayMessage('delivery_ack', relayId, relaySecretKey, {
    routed_to: routedTo,
    categories_matched: categoryMatched ? [] : [],
    geo_matched: geoMatched,
  }, rfqId);
}

/**
 * Canonical string for one bid (for content hash).
 * Sort key: bid_id.
 */
function bidCanonicalLine(bid) {
  const price = bid.offer?.price ?? '';
  const currency = bid.offer?.currency ?? '';
  return `${bid.id}\t${bid.from}\t${price}\t${currency}`;
}

/**
 * Build bid_commitment: bid_count, bid_ids_hash, bids_content_hash.
 * Bids must be sorted by id for canonical order.
 */
export function makeBidCommitment(relayId, relaySecretKey, rfqId, bids) {
  const sorted = [...bids].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const idsConcat = sorted.map((b) => b.id).join('');
  const contentConcat = sorted.map(bidCanonicalLine).join('\n');
  const bid_ids_hash = 'sha256:' + sha256Hex(idsConcat);
  const bids_content_hash = 'sha256:' + sha256Hex(contentConcat);
  return relayMessage('bid_commitment', relayId, relaySecretKey, {
    bid_count: bids.length,
    bid_ids_hash,
    bids_content_hash,
  }, rfqId);
}

export function categoryMatch(rfqCategory, baCategories) {
  if (!rfqCategory || !baCategories?.length) return true;
  return baCategories.some(
    (baCat) => rfqCategory === baCat || rfqCategory.startsWith(baCat + '.')
  );
}

export function makeDeal(rfq, bid, accept, relayId, relaySecretKey) {
  const deal = {
    rfq_id: rfq.id,
    bid_id: bid.id,
    accept_id: accept.id,
    client: { agent: rfq.from, pubkey: null },
    provider: { agent: bid.from, pubkey: null },
    terms: { ...(bid.offer || {}) },
    state: 'PENDING',
  };
  return relayMessage('deal', relayId, relaySecretKey, { deal }, rfq.id);
}

export function makeDealAttestation(relayId, relaySecretKey, dealId, rfqId, client, provider, amount, currency, state = 'FULFILLED') {
  const payload = {
    deal_id: dealId,
    rfq_id: rfqId,
    client,
    provider,
    relay: relayId.replace(/^relay:/, ''),
    amount: amount ?? 0,
    currency: currency ?? 'EUR',
    state,
    ts: Math.floor(Date.now() / 1000),
  };
  const body = {
    proto: PROTO,
    type: 'deal_attestation',
    id: ulid(),
    ...payload,
  };
  body.sig = sign(body, relaySecretKey);
  return body;
}
