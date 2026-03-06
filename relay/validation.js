/**
 * Validation for Intent Protocol v0.2 — signatures, TTL, size, anti-phishing.
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
 * Run all relay-side validations (limits + anti-phishing). Does not verify signature.
 */
export function validateMessage(msg) {
  const limitErr = validateLimits(msg);
  if (limitErr) return limitErr;
  const phishingErr = validateAntiPhishing(msg);
  if (phishingErr) return phishingErr;
  return null;
}
