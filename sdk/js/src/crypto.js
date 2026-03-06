import nacl from 'tweetnacl';
import tnaclUtil from 'tweetnacl-util';

const { encodeBase64, decodeBase64 } = tnaclUtil;

/**
 * Generate an Ed25519 keypair.
 * @returns {{ publicKey: string, secretKey: string }}
 */
export function generateKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
}

/**
 * Sign a message object with an Ed25519 secret key.
 * @param {Object} message - Message to sign (will be JSON-stringified)
 * @param {string} secretKeyB64 - Base64-encoded secret key
 * @returns {string} Signature in "ed25519:<base64>" format
 */
export function sign(message, secretKeyB64) {
  const secretKey = decodeBase64(secretKeyB64);
  const msgBytes = new TextEncoder().encode(JSON.stringify(message));
  const sig = nacl.sign.detached(msgBytes, secretKey);
  return 'ed25519:' + encodeBase64(sig);
}

/**
 * Verify an Ed25519 signature on a message.
 * @param {Object} message - Original message object
 * @param {string} sigStr - Signature in "ed25519:<base64>" format
 * @param {string} publicKeyB64 - Base64-encoded public key
 * @returns {boolean}
 */
export function verify(message, sigStr, publicKeyB64) {
  if (!sigStr.startsWith('ed25519:')) return false;
  const sig = decodeBase64(sigStr.slice(8));
  const pubKey = decodeBase64(publicKeyB64);
  const msgBytes = new TextEncoder().encode(JSON.stringify(message));
  return nacl.sign.detached.verify(msgBytes, sig, pubKey);
}
