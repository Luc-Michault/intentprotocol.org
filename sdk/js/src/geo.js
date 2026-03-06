/**
 * Calculate the Haversine distance between two points on Earth.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if an RFQ geographic constraint overlaps a business agent's service area.
 * @param {{ lat: number, lon: number, radius_km: number }} rfqWhere
 * @param {{ lat: number, lon: number, radius_km?: number }} baGeo
 * @returns {boolean}
 */
export function geoMatch(rfqWhere, baGeo) {
  const dist = haversine(rfqWhere.lat, rfqWhere.lon, baGeo.lat, baGeo.lon);
  return dist <= rfqWhere.radius_km + (baGeo.radius_km || 0);
}
