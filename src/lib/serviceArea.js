// Luzon-only service area enforcement for the customer booking flow.
//
// The service area is defined as a set of latitude/longitude polygons
// (GeoJSON-style rings in [lat, lng] order) covering the main Luzon island
// plus the islands administratively grouped with it (Mindoro, Marinduque,
// Catanduanes, Polillo). Every location-selection path (map click, pin drag,
// search suggestion, submit-time geocode) validates against these polygons,
// so a coordinate outside Luzon can never be selected or saved.

// Luzon mainland envelope (includes the Bicol peninsula) plus the outlying
// service islands (Mindoro, Marinduque, Catanduanes, Polillo). Each ring is
// the convex hull of the traced Natural Earth coastline pushed a uniform
// 0.05 deg (~5.5 km) out into the ocean: the hull contains every coastal
// vertex of its island by construction, and the ocean pad makes piers,
// coastal barangays and nearshore clicks validate while distant open sea,
// the Visayas and Palawan stay outside. A deliberately loose envelope that
// favors easy location selection over tracing the exact shoreline.

const LUZON_MAINLAND = [
  [15.975, 119.7133], [15.9061, 119.7215], [15.4158, 119.84], [14.7843, 120.0336],
  [13.7806, 120.5877], [13.7326, 120.6355], [13.5805, 121.0299], [12.5019, 123.9673],
  [12.4914, 124.061], [12.5357, 124.1285], [12.6837, 124.1727], [13.0266, 124.2301],
  [13.0669, 124.2193], [13.7556, 124.0164], [18.4118, 122.3468], [18.5563, 122.2701],
  [18.6927, 121.11], [18.696, 120.826], [18.6846, 120.7933], [18.5738, 120.594],
  [18.5357, 120.5293], [16.36, 119.7458], [16.2267, 119.7196], [15.975, 119.7133]
]

const MINDORO = [
  [13.4437, 120.2603], [13.38, 120.2844], [12.3937, 120.9453], [12.2068, 121.0844],
  [12.1669, 121.2549], [12.2616, 121.4295], [12.3414, 121.4881], [12.6352, 121.5964],
  [13.0873, 121.5954], [13.1531, 121.5939], [13.4843, 121.2236], [13.5704, 121.0002],
  [13.5761, 120.9798], [13.5803, 120.9541], [13.5763, 120.3682], [13.5414, 120.2981],
  [13.4437, 120.2603]
]

const MARINDUQUE = [
  [13.3252, 121.7661], [13.2452, 121.8324], [13.1421, 122.0189], [13.2182, 122.0893],
  [13.3097, 122.1445], [13.3765, 122.1716], [13.4626, 122.1722], [13.5076, 122.1424],
  [13.5986, 122.0172], [13.6204, 121.863], [13.5921, 121.8139], [13.4718, 121.7753],
  [13.3252, 121.7661]
]

const CATANDUANES = [
  [13.6681, 123.9739], [13.5725, 124.0059], [13.4929, 124.1401], [13.4786, 124.2014],
  [13.5294, 124.3629], [13.6489, 124.4579], [13.8919, 124.4689], [14.1201, 124.2538],
  [14.145, 124.2087], [14.1209, 124.0966], [13.6681, 123.9739]
]

const POLILLO = [
  [15.0212, 121.7774], [14.9405, 121.7822], [14.594, 121.8804], [14.6045, 121.9613],
  [14.6404, 122.035], [14.7212, 122.0657], [15.0039, 122.099], [15.0886, 122.0082],
  [15.0918, 121.9369], [15.0826, 121.8244], [15.0212, 121.7774]
]

export const LUZON_SERVICE_AREA = [LUZON_MAINLAND, MINDORO, MARINDUQUE, CATANDUANES, POLILLO]

export const SERVICE_AREA_MESSAGE =
  'This location is outside our service area. Please select a location within Luzon.'

// Padded bbox of all polygons, as [[south, west], [north, east]] — used by
// the booking form's map picker (CustomerRequestDelivery.jsx) both to bias
// Places search results toward the service area and to soft-restrict the
// map's pan/zoom, so moving away from the service area naturally pulls the
// user back toward Luzon.
export const SERVICE_AREA_MAX_BOUNDS = [
  [11.9, 118.9],
  [19.0, 125.0]
]

// Ray-casting point-in-polygon: true if (lat, lng) is inside any ring.
// Rings are stored as [lat, lng]. Points within COASTLINE_TOLERANCE
// degrees of any ring edge also count as inside, a safety net so a snapped
// pin or a click landing on the envelope boundary is never rejected. The
// envelope already reaches ~0.05 deg into the ocean, so this only fires
// right at the outer pad edge.
const COASTLINE_TOLERANCE = 0.015

export function isInsideLuzon(lat, lng) {
  if (LUZON_SERVICE_AREA.some(ring => pointInRing(lat, lng, ring))) return true
  return nearestRingDistanceSq(lat, lng) <= COASTLINE_TOLERANCE ** 2
}

function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    if (
      (latI > lat) !== (latJ > lat) &&
      lng < lngI + ((lat - latI) * (lngJ - lngI)) / (latJ - latI)
    ) {
      inside = !inside
    }
  }
  return inside
}

// Squared distance from a point to the nearest polygon edge across all rings
// (shared by the coastline tolerance check and the snap-back lookup).
function nearestRingDistanceSq(lat, lng) {
  let minDistSq = Infinity
  for (const ring of LUZON_SERVICE_AREA) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const distSq = distanceToSegmentSq(lat, lng, ring[j], ring[i])
      if (distSq < minDistSq) minDistSq = distSq
    }
  }
  return minDistSq
}

function distanceToSegmentSq(lat, lng, [aLat, aLng], [bLat, bLng]) {
  const dLat = bLat - aLat
  const dLng = bLng - aLng
  const lenSq = dLat * dLat + dLng * dLng
  const t = lenSq === 0 ? 0 : clamp(((lat - aLat) * dLat + (lng - aLng) * dLng) / lenSq, 0, 1)
  const cLat = aLat + t * dLat
  const cLng = aLng + t * dLng
  return (lat - cLat) ** 2 + (lng - cLng) ** 2
}

// Nearest point on any polygon boundary — used to snap an invalid pin
// placement back to the closest valid spot inside the service area.
export function snapToLuzon(lat, lng) {
  let best = { lat: null, lng: null, distSq: Infinity }

  for (const ring of LUZON_SERVICE_AREA) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [aLat, aLng] = ring[j]
      const [bLat, bLng] = ring[i]
      const dLat = bLat - aLat
      const dLng = bLng - aLng
      const lenSq = dLat * dLat + dLng * dLng
      const t = lenSq === 0 ? 0 : clamp(((lat - aLat) * dLat + (lng - aLng) * dLng) / lenSq, 0, 1)
      const cLat = aLat + t * dLat
      const cLng = aLng + t * dLng
      const distSq = (lat - cLat) ** 2 + (lng - cLng) ** 2
      if (distSq < best.distSq) best = { lat: cLat, lng: cLng, distSq }
    }
  }
  return { lat: best.lat, lng: best.lng }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
