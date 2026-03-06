"""Intent Protocol SDK client for Python (v0.2)."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlparse

import websockets
from websockets.asyncio.client import connect as ws_connect

from .crypto import generate_keypair
from .protocol import (
    make_rfq,
    make_bid,
    make_accept,
    make_cancel,
    make_receipt,
    compute_bids_content_hash,
)
from .types import (
    AgentIdentity,
    Bid,
    BusinessProfile,
    Deal,
    Offer,
    RFQ,
    Reputation,
    Settlement,
)

logger = logging.getLogger("intentprotocol")


class IntentClient:
    """High-level async client for the Intent Protocol.

    Example::

        client = IntentClient("ws://localhost:3100")
        client.generate_identity("alice")
        await client.connect()

        bids = await client.broadcast(RFQ(
            action="book",
            category="services.beauty.haircut",
            budget={"max": 30, "currency": "EUR"},
            where={"lat": 43.3, "lon": -0.37, "radius_km": 3},
        ))

        best = max(bids, key=lambda b: b.score)
        deal = await client.accept(best)
    """

    def __init__(
        self,
        relay_url: str,
        *,
        auto_reconnect: bool = True,
        relay_domain: str | None = None,
    ):
        self.relay_url = relay_url
        self.auto_reconnect = auto_reconnect
        self.relay_domain = relay_domain or self._extract_domain(relay_url)

        self._ws: Any = None
        self._identity: AgentIdentity | None = None
        self._listeners: dict[str, list[Callable]] = {}
        self._pending_broadcasts: dict[str, dict] = {}
        self._connected = False
        self._should_reconnect = False
        self._register_profile: dict | None = None
        self._receive_task: asyncio.Task | None = None

    # ── Identity ────────────────────────────────────────

    def generate_identity(self, name: str) -> AgentIdentity:
        """Generate a new Ed25519 identity.

        Args:
            name: Agent name (used in agent ID)

        Returns:
            AgentIdentity with keypair
        """
        pub, sec = generate_keypair()
        self._identity = AgentIdentity(
            name=name,
            agent_id=f"agent:{name}@{self.relay_domain}",
            public_key=pub,
            secret_key=sec,
        )
        return self._identity

    def set_identity(self, identity: AgentIdentity) -> None:
        """Import an existing identity."""
        self._identity = identity

    @property
    def identity(self) -> AgentIdentity | None:
        """Current agent identity."""
        return self._identity

    # ── Connection ──────────────────────────────────────

    async def connect(self) -> None:
        """Connect to the relay via WebSocket."""
        if self._connected:
            return

        self._should_reconnect = self.auto_reconnect
        self._ws = await ws_connect(self.relay_url)
        self._connected = True
        self._emit("connected")

        # Start receive loop
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def disconnect(self) -> None:
        """Close connection to the relay."""
        self._should_reconnect = False
        self._connected = False

        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        if self._ws:
            await self._ws.close()
            self._ws = None

    @property
    def connected(self) -> bool:
        """Whether the client is connected."""
        return self._connected

    # ── Personal Agent Methods ──────────────────────────

    async def broadcast(self, rfq: RFQ, timeout: float = 30, max_bids: int | None = None) -> list[Bid]:
        """Broadcast an RFQ and collect bids.

        Args:
            rfq: The RFQ to broadcast
            timeout: Seconds to collect bids (default: 30)
            max_bids: Stop early after this many bids

        Returns:
            List of received bids
        """
        self._require_identity()
        self._require_connection()

        intent = rfq.to_dict() if isinstance(rfq, RFQ) else rfq
        msg = make_rfq(self._identity.agent_id, self._identity.secret_key, intent, ttl=int(timeout))
        await self._send(msg)

        future: asyncio.Future[list[Bid]] = asyncio.get_event_loop().create_future()
        entry = {
            "bids": [],
            "future": future,
            "max_bids": max_bids or float("inf"),
            "commitment": None,
        }
        self._pending_broadcasts[msg["id"]] = entry

        async def _timeout():
            await asyncio.sleep(timeout)
            if msg["id"] in self._pending_broadcasts:
                e = self._pending_broadcasts.pop(msg["id"])
                if e["commitment"] and e["commitment"].get("bids_content_hash"):
                    computed = compute_bids_content_hash([b.raw for b in e["bids"]])
                    ok = computed == e["commitment"]["bids_content_hash"]
                    self._emit(
                        "bid_commitment_verified" if ok else "bid_commitment_mismatch",
                        {
                            "rfq_id": msg["id"],
                            "expected": e["commitment"]["bids_content_hash"],
                            "computed": computed,
                            "bid_count": len(e["bids"]),
                        },
                    )
                if not e["future"].done():
                    e["future"].set_result(e["bids"])

        asyncio.create_task(_timeout())
        return await future

    async def accept(self, bid: Bid, settlement: Settlement | None = None) -> Deal:
        """Accept a bid and receive the deal.

        Args:
            bid: The bid to accept
            settlement: Settlement terms (default: direct/on_site)

        Returns:
            The confirmed Deal
        """
        self._require_identity()
        self._require_connection()

        settle_dict = settlement.to_dict() if isinstance(settlement, Settlement) else (
            settlement or {"method": "direct", "pay_at": "on_site"}
        )
        msg = make_accept(self._identity.agent_id, self._identity.secret_key, bid.id, settle_dict)
        await self._send(msg)

        future: asyncio.Future[Deal] = asyncio.get_event_loop().create_future()

        def handler(deal: Deal):
            if not future.done():
                future.set_result(deal)
                self.off("deal", handler)

        self.on("deal", handler)

        try:
            return await asyncio.wait_for(future, timeout=10.0)
        except asyncio.TimeoutError:
            self.off("deal", handler)
            raise TimeoutError("Deal confirmation timeout")

    # ── Business Agent Methods ──────────────────────────

    async def register(self, profile: BusinessProfile | dict) -> None:
        """Register as a business agent on the relay.

        Args:
            profile: Business profile (BusinessProfile or dict)
        """
        self._require_identity()
        self._require_connection()

        profile_dict = profile.to_dict() if isinstance(profile, BusinessProfile) else profile
        self._register_profile = profile_dict

        pubkey_b64 = base64.b64encode(self._identity.public_key).decode()
        await self._send({
            "type": "register",
            "agent_id": self._identity.agent_id,
            "pubkey": f"ed25519:{pubkey_b64}",
            "profile": profile_dict,
        })

        future: asyncio.Future[None] = asyncio.get_event_loop().create_future()

        def handler(msg: dict):
            if msg.get("type") == "registered" and not future.done():
                future.set_result(None)
                self.off("_raw", handler)

        self.on("_raw", handler)

        try:
            await asyncio.wait_for(future, timeout=5.0)
        except asyncio.TimeoutError:
            self.off("_raw", handler)
            raise TimeoutError("Registration timeout")

    async def on_intent(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        """Register a callback for incoming RFQs.

        Args:
            callback: Async function called with each RFQ message
        """
        self.on("rfq", callback)

    async def bid(
        self,
        rfq_id: str,
        offer: Offer | dict,
        reputation: Reputation | dict | None = None,
        to: str | None = None,
    ) -> None:
        """Send a bid in response to an RFQ.

        Args:
            rfq_id: ID of the RFQ being bid on
            offer: The offer
            reputation: Agent reputation data
            to: Target agent
        """
        self._require_identity()
        self._require_connection()

        offer_dict = offer.to_dict() if isinstance(offer, Offer) else offer
        rep_dict = reputation.to_dict() if isinstance(reputation, Reputation) else reputation

        msg = make_bid(
            self._identity.agent_id,
            self._identity.secret_key,
            rfq_id,
            offer_dict,
            rep_dict,
            to,
        )
        await self._send(msg)

    # ── Deal Management ─────────────────────────────────

    async def confirm(
        self,
        deal_id: str,
        fulfillment: dict | None = None,
        settlement_proof: dict | None = None,
    ) -> None:
        """Send a fulfillment receipt for a deal (v0.2: optional settlement_proof)."""
        self._require_identity()
        self._require_connection()
        msg = make_receipt(
            self._identity.agent_id,
            self._identity.secret_key,
            deal_id,
            fulfillment,
            settlement_proof,
        )
        await self._send(msg)

    async def fetch_deal_attestation(self, deal_id: str) -> dict | None:
        """Fetch deal attestation from relay (v0.2). Returns None if not found or on error."""
        base = self.relay_url.replace("ws:", "http:").replace("wss:", "https:").rstrip("/")
        if base.endswith("/v1/ws"):
            base = base[: -len("/v1/ws")]
        url = f"{base}/v1/deals/{deal_id}/attestation"
        try:
            import urllib.request
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            return None

    async def cancel(self, deal_id: str, reason: str | None = None) -> None:
        """Cancel a deal."""
        self._require_identity()
        self._require_connection()
        msg = make_cancel(self._identity.agent_id, self._identity.secret_key, deal_id, reason)
        await self._send(msg)

    # ── Events ──────────────────────────────────────────

    def on(self, event: str, callback: Callable) -> "IntentClient":
        """Subscribe to an event.

        Events: 'rfq', 'bid', 'deal', 'cancel', 'receipt', 'error', 'connected', 'disconnected'
        """
        self._listeners.setdefault(event, []).append(callback)
        return self

    def off(self, event: str, callback: Callable) -> "IntentClient":
        """Unsubscribe from an event."""
        if event in self._listeners:
            self._listeners[event] = [fn for fn in self._listeners[event] if fn is not callback]
        return self

    # ── Private ─────────────────────────────────────────

    @staticmethod
    def _extract_domain(url: str) -> str:
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port
        return f"{host}:{port}" if port else host

    def _require_identity(self) -> None:
        if not self._identity:
            raise RuntimeError("No identity set. Call generate_identity() or set_identity() first.")

    def _require_connection(self) -> None:
        if not self._connected or not self._ws:
            raise RuntimeError("Not connected. Call connect() first.")

    async def _send(self, data: dict) -> None:
        await self._ws.send(json.dumps(data))

    def _emit(self, event: str, *args: Any) -> None:
        for fn in self._listeners.get(event, []):
            try:
                result = fn(*args)
                if asyncio.iscoroutine(result):
                    asyncio.create_task(result)
            except Exception as e:
                logger.error(f"Error in {event} handler: {e}")

    async def _receive_loop(self) -> None:
        """Main message receive loop."""
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    self._handle_message(msg)
                except json.JSONDecodeError:
                    continue
        except websockets.exceptions.ConnectionClosed:
            self._connected = False
            self._emit("disconnected")
            if self._should_reconnect:
                await asyncio.sleep(1)
                try:
                    await self.connect()
                    if self._register_profile:
                        await self.register(self._register_profile)
                except Exception:
                    pass
        except asyncio.CancelledError:
            return

    def _handle_message(self, msg: dict) -> None:
        self._emit("_raw", msg)
        msg_type = msg.get("type", "")

        if msg_type == "rfq":
            self._emit("rfq", msg)

        elif msg_type == "delivery_ack":
            self._emit("delivery_ack", msg)

        elif msg_type == "bid_commitment":
            self._emit("bid_commitment", msg)
            entry = self._pending_broadcasts.get(msg.get("ref", ""))
            if entry:
                entry["commitment"] = msg

        elif msg_type == "bid":
            bid = Bid(
                id=msg.get("id", ""),
                ref=msg.get("ref", ""),
                from_agent=msg.get("from", ""),
                to=msg.get("to"),
                ts=msg.get("ts", 0),
                offer=msg.get("offer", {}),
                reputation=msg.get("reputation", {}),
                score=self._score_bid(msg),
                raw=msg,
            )
            self._emit("bid", bid)

            entry = self._pending_broadcasts.get(msg.get("ref", ""))
            if entry:
                entry["bids"].append(bid)
                if len(entry["bids"]) >= entry["max_bids"]:
                    self._pending_broadcasts.pop(msg.get("ref", ""))
                    if entry.get("commitment") and entry["commitment"].get("bids_content_hash"):
                        computed = compute_bids_content_hash([b.raw for b in entry["bids"]])
                        ok = computed == entry["commitment"]["bids_content_hash"]
                        self._emit(
                            "bid_commitment_verified" if ok else "bid_commitment_mismatch",
                            {"rfq_id": msg.get("ref"), "expected": entry["commitment"]["bids_content_hash"], "computed": computed, "bid_count": len(entry["bids"])},
                        )
                    if not entry["future"].done():
                        entry["future"].set_result(entry["bids"])

        elif msg_type == "deal":
            deal = Deal(
                id=msg.get("id", ""),
                rfq_id=msg.get("deal", {}).get("rfq_id", ""),
                bid_id=msg.get("deal", {}).get("bid_id", ""),
                client=msg.get("deal", {}).get("client", {}),
                provider=msg.get("deal", {}).get("provider", {}),
                terms=msg.get("deal", {}).get("terms", {}),
                state=msg.get("deal", {}).get("state", "PENDING"),
                raw=msg,
            )
            self._emit("deal", deal)

        elif msg_type == "deal_attestation":
            self._emit("deal_attestation", msg)

        elif msg_type == "cancel":
            self._emit("cancel", msg)

        elif msg_type == "receipt":
            self._emit("receipt", msg)

    @staticmethod
    def _score_bid(msg: dict) -> float:
        """Score a bid (higher = better)."""
        offer = msg.get("offer", {})
        rep = msg.get("reputation", {})
        price_score = 1 / (1 + (offer.get("price", 100)))
        rating = (rep.get("rating_avg", 3)) / 5
        volume = min(1, (rep.get("deals_completed", 0)) / 500)
        reputation_score = rating * 0.7 + volume * 0.3
        return price_score * 0.4 + reputation_score * 0.6
