import nacl from 'tweetnacl';
import tnaclUtil from 'tweetnacl-util';
import { createHash } from 'crypto';

const { encodeBase64, decodeBase64 } = tnaclUtil;

export function generateKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
    _kp: kp,
  };
}

export function sign(message, secretKeyB64) {
  const secretKey = decodeBase64(secretKeyB64);
  const msgBytes = new TextEncoder().encode(JSON.stringify(message));
  const sig = nacl.sign.detached(msgBytes, secretKey);
  return 'ed25519:' + encodeBase64(sig);
}

export function verify(message, sigStr, publicKeyB64) {
  if (!sigStr || !sigStr.startsWith('ed25519:')) return false;
  try {
    const sig = decodeBase64(sigStr.slice(8));
    const pubKey = decodeBase64(publicKeyB64);
    const msgBytes = new TextEncoder().encode(JSON.stringify(message));
    return nacl.sign.detached.verify(msgBytes, sig, pubKey);
  } catch {
    return false;
  }
}

/**
 * Verify a signature over a raw payload string (e.g. canonical JSON for owner attestation).
 * @param {string} payloadStr - Exact string that was signed (e.g. JSON.stringify(canonicalObject))
 * @param {string} sigStr - "ed25519:base64..."
 * @param {string} publicKeyB64 - Base64 public key (without ed25519: prefix)
 */
export function verifyPayload(payloadStr, sigStr, publicKeyB64) {
  if (!sigStr || !sigStr.startsWith('ed25519:')) return false;
  try {
    const sig = decodeBase64(sigStr.slice(8));
    const pubKey = publicKeyB64.startsWith('ed25519:') ? decodeBase64(publicKeyB64.slice(8)) : decodeBase64(publicKeyB64);
    const msgBytes = new TextEncoder().encode(payloadStr);
    return nacl.sign.detached.verify(msgBytes, sig, pubKey);
  } catch {
    return false;
  }
}

/** SHA256 hex for bid commitment */
export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
