"""Intent Protocol data types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class When:
    """Temporal constraints for an intent."""
    after: str | None = None
    before: str | None = None
    duration_min: int | None = None
    prefer: str | None = None  # earliest | latest | cheapest


@dataclass
class Where:
    """Geographic constraints for an intent."""
    lat: float = 0.0
    lon: float = 0.0
    radius_km: float = 5.0
    mode: str = "provider_location"  # provider_location | client_location | remote


@dataclass
class Budget:
    """Budget constraints for an intent."""
    max: float = 0.0
    currency: str = "EUR"
    prefer: str | None = None  # cheapest | best_rated | fastest


@dataclass
class RFQ:
    """Request For Quote — a structured intent to broadcast (v0.2: category_schema_version)."""
    action: str = "book"  # book | buy | rent | hire | quote | info
    category: str = ""
    when: When | dict | None = None
    where: Where | dict | None = None
    budget: Budget | dict | None = None
    specs: dict[str, Any] | None = None
    category_schema_version: str | None = None  # v0.2
    quantity: int = 1
    flexible: bool = False

    def to_dict(self) -> dict:
        """Convert to protocol-compatible dict."""
        d: dict[str, Any] = {"action": self.action, "category": self.category}
        if self.category_schema_version:
            d["category_schema_version"] = self.category_schema_version
        if self.when:
            d["when"] = self.when if isinstance(self.when, dict) else {
                k: v for k, v in self.when.__dict__.items() if v is not None
            }
        if self.where:
            d["where"] = self.where if isinstance(self.where, dict) else {
                k: v for k, v in self.where.__dict__.items() if v is not None
            }
        if self.budget:
            d["budget"] = self.budget if isinstance(self.budget, dict) else {
                k: v for k, v in self.budget.__dict__.items() if v is not None
            }
        if self.specs:
            d["specs"] = self.specs
        if self.quantity != 1:
            d["quantity"] = self.quantity
        if self.flexible:
            d["flexible"] = self.flexible
        return d


@dataclass
class Offer:
    """A concrete offer in response to an RFQ."""
    price: float = 0.0
    currency: str = "EUR"
    when: str | None = None
    duration_min: int | None = None
    service: str | None = None
    location: dict | None = None
    conditions: dict | None = None
    extras_available: list[dict] | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class Reputation:
    """Agent reputation data."""
    deals_completed: int = 0
    rating_avg: float = 0.0
    disputes: int = 0
    member_since: str | None = None
    verified: bool = False

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class Settlement:
    """Deal settlement terms."""
    method: str = "direct"  # direct | escrow_stripe | escrow_crypto | escrow_relay | invoice
    pay_at: str | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class BusinessProfile:
    """Business agent registration profile."""
    name: str = ""
    categories: list[str] = field(default_factory=list)
    geo: dict | None = None  # { lat, lon, radius_km }
    hours: dict | None = None
    min_price: dict | None = None
    languages: list[str] | None = None
    payment_methods: list[str] | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"name": self.name, "categories": self.categories}
        if self.geo:
            d["geo"] = self.geo
        if self.hours:
            d["hours"] = self.hours
        if self.min_price:
            d["min_price"] = self.min_price
        if self.languages:
            d["languages"] = self.languages
        if self.payment_methods:
            d["payment_methods"] = self.payment_methods
        return d


@dataclass
class AgentIdentity:
    """Agent identity (keypair + metadata)."""
    name: str = ""
    agent_id: str = ""
    public_key: bytes = b""
    secret_key: bytes = b""


@dataclass
class Bid:
    """A received bid message (parsed)."""
    id: str = ""
    ref: str = ""
    from_agent: str = ""
    to: str | None = None
    ts: int = 0
    offer: dict = field(default_factory=dict)
    reputation: dict = field(default_factory=dict)
    score: float = 0.0
    raw: dict = field(default_factory=dict)


@dataclass
class Deal:
    """A confirmed deal (parsed)."""
    id: str = ""
    rfq_id: str = ""
    bid_id: str = ""
    client: dict = field(default_factory=dict)
    provider: dict = field(default_factory=dict)
    terms: dict = field(default_factory=dict)
    state: str = "PENDING"
    raw: dict = field(default_factory=dict)
