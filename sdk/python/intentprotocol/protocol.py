"""Intent Protocol message builders (v0.2)."""

from __future__ import annotations

import hashlib
import time
import uuid
from .crypto import sign

PROTO_VERSION = "intent/0.2"


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
    """Build and sign a protocol message."""
    body = {
        "proto": PROTO_VERSION,
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
    settlement_proof: dict | None = None,
) -> dict:
    """Create a signed Receipt message (v0.2: optional settlement_proof)."""
    payload: dict = {"fulfillment": fulfillment or {"completed": True}}
    if settlement_proof and isinstance(settlement_proof, dict):
        payload["settlement_proof"] = {
            "method": settlement_proof.get("method", "other"),
            "reference": settlement_proof.get("reference", ""),
            "amount": settlement_proof.get("amount"),
            "currency": settlement_proof.get("currency"),
        }
    return make_message("receipt", from_, secret_key, payload, ref=deal_id, ttl=0)


def _bid_canonical_line(bid: dict) -> str:
    """Canonical line for one bid (must match relay)."""
    offer = bid.get("offer") or {}
    return f"{bid.get('id', '')}\t{bid.get('from', '')}\t{offer.get('price', '')}\t{offer.get('currency', '')}"


def compute_bids_content_hash(bids: list[dict]) -> str:
    """Compute bids_content_hash for verifying bid_commitment (v0.2)."""
    sorted_bids = sorted(bids, key=lambda b: b.get("id", ""))
    content = "\n".join(_bid_canonical_line(b) for b in sorted_bids)
    return "sha256:" + hashlib.sha256(content.encode()).hexdigest()
