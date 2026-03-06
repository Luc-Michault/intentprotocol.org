import { ulid } from 'ulid';
import { sign } from './crypto.js';

export function makeMessage(type, from, secretKey, payload, ref = null, ttl = 30) {
  const body = {
    proto: 'intent/0.1',
    type,
    id: ulid(),
    ref,
    from,
    ts: Math.floor(Date.now() / 1000),
    ttl,
    ...payload
  };
  body.sig = sign(body, secretKey);
  return body;
}

export function makeRFQ(from, secretKey, intent) {
  return makeMessage('rfq', from, secretKey, { intent });
}

export function makeBid(from, secretKey, rfqId, offer, reputation) {
  return makeMessage('bid', from, secretKey, { offer, reputation }, rfqId, 60);
}

export function makeAccept(from, secretKey, bidId, settlement) {
  return makeMessage('accept', from, secretKey, { accepted_bid: bidId, settlement }, bidId, 10);
}

export function makeDeal(rfq, bid, accept, relaySecretKey) {
  const deal = {
    rfq_id: rfq.id,
    bid_id: bid.id,
    accept_id: accept.id,
    client: { agent: rfq.from, pubkey: null },
    provider: { agent: bid.from, pubkey: null },
    terms: { ...bid.offer },
    state: 'PENDING'
  };
  return makeMessage('deal', 'relay:localhost', relaySecretKey, { deal }, rfq.id, 0);
}

export function categoryMatch(rfqCategory, baCategories) {
  return baCategories.some(baCat => {
    return rfqCategory === baCat || rfqCategory.startsWith(baCat + '.');
  });
}
