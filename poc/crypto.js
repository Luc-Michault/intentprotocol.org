import nacl from 'tweetnacl';
import tnaclUtil from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tnaclUtil;

export function generateKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
    _kp: kp
  };
}

export function sign(message, secretKeyB64) {
  const secretKey = decodeBase64(secretKeyB64);
  const msgBytes = new TextEncoder().encode(JSON.stringify(message));
  const sig = nacl.sign.detached(msgBytes, secretKey);
  return 'ed25519:' + encodeBase64(sig);
}

export function verify(message, sigStr, publicKeyB64) {
  if (!sigStr.startsWith('ed25519:')) return false;
  const sig = decodeBase64(sigStr.slice(8));
  const pubKey = decodeBase64(publicKeyB64);
  const msgBytes = new TextEncoder().encode(JSON.stringify(message));
  return nacl.sign.detached.verify(msgBytes, sig, pubKey);
}
