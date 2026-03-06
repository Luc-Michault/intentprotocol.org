"""Ed25519 cryptography for Intent Protocol message signing."""

from __future__ import annotations

import json
from nacl.signing import SigningKey, VerifyKey
from nacl.encoding import Base64Encoder


def generate_keypair() -> tuple[bytes, bytes]:
    """Generate an Ed25519 signing keypair.

    Returns:
        Tuple of (public_key_bytes, secret_key_bytes)
    """
    sk = SigningKey.generate()
    return bytes(sk.verify_key), bytes(sk)


def sign(message: dict, secret_key: bytes) -> str:
    """Sign a message dict with Ed25519.

    Args:
        message: Message dict to sign (will be JSON-serialized)
        secret_key: 64-byte Ed25519 secret key

    Returns:
        Signature string in "ed25519:<base64>" format
    """
    sk = SigningKey(secret_key[:32])  # NaCl seed is first 32 bytes
    msg_bytes = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode()
    signed = sk.sign(msg_bytes)
    sig_b64 = Base64Encoder.encode(signed.signature).decode()
    return f"ed25519:{sig_b64}"


def verify(message: dict, sig_str: str, public_key: bytes) -> bool:
    """Verify an Ed25519 signature on a message.

    Args:
        message: Original message dict
        sig_str: Signature in "ed25519:<base64>" format
        public_key: 32-byte Ed25519 public key

    Returns:
        True if valid
    """
    if not sig_str.startswith("ed25519:"):
        return False
    try:
        sig_bytes = Base64Encoder.decode(sig_str[8:].encode())
        vk = VerifyKey(public_key)
        msg_bytes = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode()
        vk.verify(msg_bytes, sig_bytes)
        return True
    except Exception:
        return False
