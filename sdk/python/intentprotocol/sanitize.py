"""Sanitization for display-safe content (v0.2 anti-phishing)."""

from __future__ import annotations

import re
from typing import Any

URL_PATTERN = re.compile(
    r"https?://\S+|www\.\S+|\b[\w.-]+\.(com|fr|org|net|io)\b",
    re.IGNORECASE,
)
PHONE_PATTERN = re.compile(r"\d[\d\s.\-]{6,}\d")


def sanitize_for_display(s: str | None) -> str:
    """Remove URLs and mask phone-like sequences for safe user display."""
    if s is None or not isinstance(s, str):
        return ""
    out = URL_PATTERN.sub("[url removed]", s)
    out = PHONE_PATTERN.sub("[phone]", out)
    return out


def validate_display_field(s: str | None) -> tuple[bool, str | None]:
    """Check if string contains URL or phone pattern. Returns (ok, reason)."""
    if s is None or not isinstance(s, str):
        return True, None
    if URL_PATTERN.search(s):
        return False, "URL not allowed"
    if PHONE_PATTERN.search(s):
        return False, "Phone pattern not allowed"
    return True, None


def sanitize_bid_for_display(bid: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of bid with offer display fields sanitized."""
    if not bid or "offer" not in bid:
        return bid
    offer = dict(bid["offer"])
    if "location" in offer and offer["location"]:
        loc = dict(offer["location"])
        if isinstance(loc.get("name"), str):
            loc["name"] = sanitize_for_display(loc["name"])
        if isinstance(loc.get("address"), str):
            loc["address"] = sanitize_for_display(loc["address"])
        offer["location"] = loc
    if isinstance(offer.get("service"), str):
        offer["service"] = sanitize_for_display(offer["service"])
    return {**bid, "offer": offer}
