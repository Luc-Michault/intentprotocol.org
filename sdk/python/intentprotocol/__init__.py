"""
intentprotocol — Build AI agents that negotiate and transact.

Intent Protocol SDK for Python.
"""

__version__ = "0.2.0"

from .client import IntentClient
from .types import (
    AgentIdentity,
    Bid,
    Budget,
    BusinessProfile,
    Deal,
    Offer,
    RFQ,
    Reputation,
    Settlement,
    When,
    Where,
)
from .crypto import generate_keypair, sign, verify
from .protocol import (
    make_rfq,
    make_bid,
    make_accept,
    make_cancel,
    make_receipt,
    compute_bids_content_hash,
)
from .geo import haversine, geo_match
from .sanitize import sanitize_for_display, sanitize_bid_for_display, validate_display_field

__all__ = [
    "IntentClient",
    # Types
    "AgentIdentity",
    "Bid",
    "Budget",
    "BusinessProfile",
    "Deal",
    "Offer",
    "RFQ",
    "Reputation",
    "Settlement",
    "When",
    "Where",
    # Crypto
    "generate_keypair",
    "sign",
    "verify",
    # Protocol
    "make_rfq",
    "make_bid",
    "make_accept",
    "make_cancel",
    "make_receipt",
    "compute_bids_content_hash",
    # Geo
    "haversine",
    "geo_match",
    # Sanitize (v0.2)
    "sanitize_for_display",
    "sanitize_bid_for_display",
    "validate_display_field",
]
