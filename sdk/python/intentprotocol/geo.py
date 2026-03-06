"""Geographic utilities for Intent Protocol."""

from __future__ import annotations

import math


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth.

    Args:
        lat1, lon1: Coordinates of point 1 (degrees)
        lat2, lon2: Coordinates of point 2 (degrees)

    Returns:
        Distance in kilometers
    """
    R = 6371.0
    to_rad = math.radians

    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def geo_match(
    rfq_where: dict,
    ba_geo: dict,
) -> bool:
    """Check if an RFQ location overlaps a business agent's service area.

    Args:
        rfq_where: RFQ geographic constraint {lat, lon, radius_km}
        ba_geo: Business agent geo {lat, lon, radius_km}

    Returns:
        True if areas overlap
    """
    dist = haversine(rfq_where["lat"], rfq_where["lon"], ba_geo["lat"], ba_geo["lon"])
    return dist <= rfq_where.get("radius_km", 5) + ba_geo.get("radius_km", 0)
