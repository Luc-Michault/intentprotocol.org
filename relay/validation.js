/**
 * Validation for Intent Protocol v0.3 — signatures, TTL, size, anti-phishing, key rotation.
 */

const MAX_MESSAGE_BYTES = 8 * 1024;
const MAX_RADIUS_KM = 500;
const MAX_TTL = 120;

// Anti-phishing: reject if these patterns appear in displayable fields
const URL_PATTERN = /https?:\/\/\S+|\.(com|fr|org|net|io)\b/i;
const PHONE_PATTERN = /\d[\d\s.\-]{7,}\d|\d{8,}/;

function hasUrl(s) {
  if (typeof s !== 'string') return false;
  return URL_PATTERN.test(s);
}

function hasPhone(s) {
  if (typeof s !== 'string') return false;
  return PHONE_PATTERN.test(s);
}

function checkDisplayField(value) {
  if (value == null) return null;
  const str = typeof value === 'string' ? value : String(value);
  if (hasUrl(str)) return 'E_INVALID: URL not allowed in this field';
  if (hasPhone(str)) return 'E_INVALID: phone number pattern not allowed in this field';
  return null;
}

/**
 * Validate message size and protocol limits (relay-side).
 * Returns null or error code string.
 */
export function validateLimits(msg) {
  const raw = JSON.stringify(msg);
  if (Buffer.byteLength(raw, 'utf8') > MAX_MESSAGE_BYTES) return 'E_INVALID: message exceeds 8KB';

  const intent = msg.intent;
  if (intent?.where?.radius_km != null && intent.where.radius_km > MAX_RADIUS_KM) {
    return 'E_INVALID: radius_km exceeds 500';
  }
  if (msg.ttl != null && msg.ttl > MAX_TTL) {
    return 'E_INVALID: ttl exceeds 120';
  }
  const now = Math.floor(Date.now() / 1000);
  if (msg.ts != null && msg.ttl != null && msg.ts + msg.ttl < now) {
    return 'E_EXPIRED';
  }
  return null;
}

/**
 * Anti-phishing: check fields that are displayed to users.
 * Returns null or error string.
 */
export function validateAntiPhishing(msg) {
  if (msg.type === 'bid' && msg.offer) {
    const o = msg.offer;
    const err =
      checkDisplayField(o.location?.name) ||
      checkDisplayField(o.location?.address) ||
      checkDisplayField(o.service);
    if (err) return err;
  }
  return null;
}

/**
 * v0.3: Validate key_rotation messages.
 */
export function validateKeyRotation(msg) {
  if (msg.type !== 'key_rotation') return null;
  if (!msg.agent) return 'E_INVALID: key_rotation requires agent field';
  if (!msg.old_pubkey) return 'E_INVALID: key_rotation requires old_pubkey';
  if (!msg.new_pubkey) return 'E_INVALID: key_rotation requires new_pubkey';
  if (msg.old_pubkey === msg.new_pubkey) return 'E_INVALID: new key must differ from old key';
  if (!msg.reason) return 'E_INVALID: key_rotation requires reason';
  const validReasons = ['compromised', 'scheduled', 'precautionary'];
  if (!validReasons.includes(msg.reason)) return 'E_INVALID: invalid rotation reason';
  return null;
}

/**
 * v0.3: Validate quarantine_appeal messages.
 */
export function validateQuarantineAppeal(msg) {
  if (msg.type !== 'quarantine_appeal') return null;
  if (!msg.owner_attestation) return 'E_INVALID: quarantine_appeal requires owner_attestation';
  return null;
}

/**
 * v0.3: Clock skew check.
 */
export function validateClockSkew(msg, maxSkewS = 30) {
  if (!msg.ts) return null;
  const now = Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - msg.ts);
  if (skew > maxSkewS) return 'E_INVALID: clock skew exceeds threshold';
  return null;
}

/**
 * Run all relay-side validations (limits + anti-phishing + v0.3 checks). Does not verify signature.
 */
export function validateMessage(msg) {
  const limitErr = validateLimits(msg);
  if (limitErr) return limitErr;
  const phishingErr = validateAntiPhishing(msg);
  if (phishingErr) return phishingErr;
  // v0.3 validations
  if (msg.type === 'key_rotation') {
    const rotErr = validateKeyRotation(msg);
    if (rotErr) return rotErr;
  }
  if (msg.type === 'quarantine_appeal') {
    const appealErr = validateQuarantineAppeal(msg);
    if (appealErr) return appealErr;
  }
  const skewErr = validateClockSkew(msg);
  if (skewErr) return skewErr;
  return null;
}
