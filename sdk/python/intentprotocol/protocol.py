"""Intent Protocol message builders."""

from __future__ import annotations

import time
import uuid
from .crypto import sign


def _ulid() -> str:
    """Generate a unique message ID (UUID4-based for simplicity)."""
    return str(uuid.uuid4()).replace("-", "").upper()[:26]


def make_message(
    type_: str,
    from_: str,
    secret_key: bytes,
    payload: dict,
    ref: str | None = None,
    ttl: int = 30,
    to: str | None = None,
) -> dict:
    """Build and sign a protocol message.

    Args:
        type_: Message type (rfq, bid, accept, cancel, receipt)
        from_: Sender identity
        secret_key: Ed25519 secret key (64 bytes)
        payload: Type-specific fields
        ref: Parent message ID
        ttl: Time to live in seconds
        to: Target agent (None for broadcast)

    Returns:
        Signed message dict
    """
    body = {
        "proto": "intent/0.1",
        "type": type_,
        "id": _ulid(),
        "ref": ref,
        "from": from_,
        "ts": int(time.time()),
        "ttl": ttl,
        **payload,
    }
    if to:
        body["to"] = to

    body["sig"] = sign(body, secret_key)
    return body


def make_rfq(from_: str, secret_key: bytes, intent: dict, ttl: int = 30) -> dict:
    """Create a signed RFQ message."""
    return make_message("rfq", from_, secret_key, {"intent": intent}, ttl=ttl)


def make_bid(
    from_: str,
    secret_key: bytes,
    rfq_id: str,
    offer: dict,
    reputation: dict | None = None,
    to: str | None = None,
) -> dict:
    """Create a signed Bid message."""
    payload = {"offer": offer}
    if reputation:
        payload["reputation"] = reputation
    return make_message("bid", from_, secret_key, payload, ref=rfq_id, ttl=60, to=to)


def make_accept(
    from_: str,
    secret_key: bytes,
    bid_id: str,
    settlement: dict | None = None,
) -> dict:
    """Create a signed Accept message."""
    payload = {
        "accepted_bid": bid_id,
        "settlement": settlement or {"method": "direct", "pay_at": "on_site"},
    }
    return make_message("accept", from_, secret_key, payload, ref=bid_id, ttl=10)


def make_cancel(
    from_: str,
    secret_key: bytes,
    ref_id: str,
    reason: str | None = None,
) -> dict:
    """Create a signed Cancel message."""
    return make_message(
        "cancel", from_, secret_key, {"reason": reason, "within_terms": True}, ref=ref_id, ttl=10,
    )


def make_receipt(
    from_: str,
    secret_key: bytes,
    deal_id: str,
    fulfillment: dict | None = None,
) -> dict:
    """Create a signed Receipt message."""
    return make_message(
        "receipt", from_, secret_key, {"fulfillment": fulfillment or {"completed": True}},
        ref=deal_id, ttl=0,
    )
