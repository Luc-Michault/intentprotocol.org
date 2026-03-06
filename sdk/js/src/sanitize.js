/**
 * Sanitization for display-safe content (v0.2 anti-phishing).
 * Strip URLs and mask or remove phone-like patterns from text shown to users.
 */

const URL_PATTERN = /https?:\/\/[^\s]+|www\.[^\s]+|\b[\w.-]+\.(com|fr|org|net|io)\b/gi;
const PHONE_PATTERN = /\d[\d\s.\-]{6,}\d/g;

/**
 * Sanitize a string for safe display: remove URLs, mask phone-like sequences.
 * @param {string} str - Raw string (e.g. from location.name, offer.service)
 * @returns {string} Sanitized string safe for user display
 */
export function sanitizeForDisplay(str) {
  if (str == null || typeof str !== 'string') return '';
  let out = str.replace(URL_PATTERN, '[url removed]');
  out = out.replace(PHONE_PATTERN, (m) => '[phone]');
  return out;
}

/**
 * Check if a string contains URL or phone pattern (for validation before sending).
 * @param {string} str
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateDisplayField(str) {
  if (str == null || typeof str !== 'string') return { ok: true };
  if (str.match(URL_PATTERN)) return { ok: false, reason: 'URL not allowed' };
  if (str.match(PHONE_PATTERN)) return { ok: false, reason: 'Phone pattern not allowed' };
  return { ok: true };
}

/**
 * Sanitize a bid's offer for display (location.name, location.address, service).
 * Use before rendering bid content to users.
 * @param {import('./types.js').BidMessage} bid
 * @returns {Object} Copy of bid with offer display fields sanitized
 */
export function sanitizeBidForDisplay(bid) {
  if (!bid?.offer) return bid;
  const offer = { ...bid.offer };
  if (offer.location) {
    offer.location = { ...offer.location };
    if (typeof offer.location.name === 'string') offer.location.name = sanitizeForDisplay(offer.location.name);
    if (typeof offer.location.address === 'string') offer.location.address = sanitizeForDisplay(offer.location.address);
  }
  if (typeof offer.service === 'string') offer.service = sanitizeForDisplay(offer.service);
  return { ...bid, offer };
}
