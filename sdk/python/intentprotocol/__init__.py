"""
intentprotocol — Build AI agents that negotiate and transact.

Intent Protocol SDK for Python.
"""

__version__ = "0.1.0"

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
from .protocol import make_rfq, make_bid, make_accept, make_cancel, make_receipt
from .geo import haversine, geo_match

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
    # Geo
    "haversine",
    "geo_match",
]
