/**
 * @intentprotocol/sdk — Build AI agents that negotiate and transact.
 *
 * @module @intentprotocol/sdk
 */

// High-level API
export { IntentClient } from './client.js';
export { PersonalAgent, BusinessAgent } from './agent.js';

// Low-level utilities
export { generateKeypair, sign, verify } from './crypto.js';
export { makeRFQ, makeBid, makeAccept, makeCancel, makeReceipt, makeMessage } from './protocol.js';
export { haversine, geoMatch } from './geo.js';
