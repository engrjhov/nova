/* ============================================================
   DATA.JS — Dummy dataset for Space Planning Map prototype
   All data is fabricated for demo purposes only.
   ============================================================ */

// Lat/Lon -> normalized scene XZ. PH roughly spans
// lat 5..21, lon 117..127. We map lon->x, lat->z (inverted, north = -z).
const GEO_BOUNDS = { lonMin: 116.5, lonMax: 127.0, latMin: 4.5, latMax: 21.2 };
const WORLD_SCALE = 46; // world units across the longer axis

function geoToWorld(lat, lon) {
  const lonSpan = GEO_BOUNDS.lonMax - GEO_BOUNDS.lonMin;
  const latSpan = GEO_BOUNDS.latMax - GEO_BOUNDS.latMin;
  const x = ((lon - GEO_BOUNDS.lonMin) / lonSpan - 0.5) * WORLD_SCALE;
  const z = -((lat - GEO_BOUNDS.latMin) / latSpan - 0.5) * (WORLD_SCALE * (latSpan / lonSpan) * 1.55);
  return { x, z };
}

// ---- Regions -------------------------------------------------
const REGIONS = {
  luzon: {
    id: "luzon",
    name: "Luzon",
    subtitle: "Northern & Central Philippines",
    center: { lat: 16.0, lon: 121.0 },
    color: 0x29c5ff,
    description: "The largest island group, home to Metro Manila and the nation's economic core.",
  },
  ncr: {
    id: "ncr",
    name: "NCR — Metro Manila",
    subtitle: "National Capital Region",
    center: { lat: 14.5995, lon: 120.9842 },
    color: 0x39e5b0,
    description: "The dense urban capital region — highest store density in the network.",
    parent: "luzon",
  },
  visayas: {
    id: "visayas",
    name: "Visayas",
    subtitle: "Central Island Group",
    center: { lat: 10.7, lon: 123.5 },
    color: 0xffb02e,
    description: "Central archipelago anchored by Cebu, the region's commercial hub.",
  },
  mindanao: {
    id: "mindanao",
    name: "Mindanao",
    subtitle: "Southern Philippines",
    center: { lat: 7.5, lon: 125.2 },
    color: 0xff5d8f,
    description: "Southern island group with fast-growing regional retail markets.",
  },
};

// ---- Stores ----------------------------------------------------
// status: "approved" | "pending" | "issue"
const STORES = [
  // NCR
  { id: "sm-manila", name: "SM Manila", region: "ncr", city: "Manila, NCR", lat: 14.5906, lon: 120.9799, status: "approved", category: "Apple Products", lastUpdate: "Jun 2026", footTraffic: 8200, manager: "R. Santos" },
  { id: "sm-megamall", name: "SM Megamall", region: "ncr", city: "Mandaluyong, NCR", lat: 14.5847, lon: 121.0566, status: "approved", category: "Consumer Electronics", lastUpdate: "Jun 2026", footTraffic: 14500, manager: "J. Cruz" },
  { id: "sm-northedsa", name: "SM North EDSA", region: "ncr", city: "Quezon City, NCR", lat: 14.6566, lon: 121.0309, status: "pending", category: "Mobile & Accessories", lastUpdate: "May 2026", footTraffic: 13100, manager: "A. Reyes" },
  { id: "glorietta", name: "Glorietta", region: "ncr", city: "Makati, NCR", lat: 14.5512, lon: 121.0244, status: "approved", category: "Apple Products", lastUpdate: "Jun 2026", footTraffic: 9700, manager: "M. Tan" },
  { id: "sm-mallofasia", name: "SM Mall of Asia", region: "ncr", city: "Pasay, NCR", lat: 14.5352, lon: 120.9819, status: "issue", category: "Consumer Electronics", lastUpdate: "Apr 2026", footTraffic: 16800, manager: "K. Bautista" },

  // Luzon
  { id: "sm-clark", name: "SM Clark", region: "luzon", city: "Pampanga, Luzon", lat: 15.1860, lon: 120.5414, status: "approved", category: "Mobile & Accessories", lastUpdate: "Jun 2026", footTraffic: 6100, manager: "P. Lim" },
  { id: "sm-baguio", name: "SM Baguio", region: "luzon", city: "Baguio, Luzon", lat: 16.4084, lon: 120.5980, status: "pending", category: "Apple Products", lastUpdate: "May 2026", footTraffic: 5400, manager: "C. Mendoza" },
  { id: "sm-batangas", name: "SM Batangas", region: "luzon", city: "Batangas City, Luzon", lat: 13.7565, lon: 121.0583, status: "approved", category: "Consumer Electronics", lastUpdate: "Jun 2026", footTraffic: 4800, manager: "L. Garcia" },
  { id: "sm-lucena", name: "SM Lucena", region: "luzon", city: "Lucena, Luzon", lat: 13.9314, lon: 121.6170, status: "approved", category: "Mobile & Accessories", lastUpdate: "Jun 2026", footTraffic: 3900, manager: "D. Ramos" },

  // Visayas
  { id: "sm-cebu", name: "SM Cebu", region: "visayas", city: "Cebu City, Visayas", lat: 10.3157, lon: 123.8854, status: "approved", category: "Apple Products", lastUpdate: "Jun 2026", footTraffic: 11200, manager: "F. Villanueva" },
  { id: "sm-iloilo", name: "SM Iloilo", region: "visayas", city: "Iloilo City, Visayas", lat: 10.7202, lon: 122.5621, status: "approved", category: "Consumer Electronics", lastUpdate: "Jun 2026", footTraffic: 7300, manager: "S. Aquino" },
  { id: "sm-bacolod", name: "SM Bacolod", region: "visayas", city: "Bacolod, Visayas", lat: 10.6713, lon: 122.9511, status: "pending", category: "Mobile & Accessories", lastUpdate: "May 2026", footTraffic: 6700, manager: "N. Torres" },

  // Mindanao
  { id: "sm-davao", name: "SM Davao", region: "mindanao", city: "Davao City, Mindanao", lat: 7.0722, lon: 125.6131, status: "approved", category: "Apple Products", lastUpdate: "Jun 2026", footTraffic: 9100, manager: "E. Flores" },
  { id: "sm-cagayan", name: "SM Cagayan de Oro", region: "mindanao", city: "Cagayan de Oro, Mindanao", lat: 8.4542, lon: 124.6319, status: "issue", category: "Consumer Electronics", lastUpdate: "Mar 2026", footTraffic: 5900, manager: "G. Pascual" },
  { id: "sm-gensan", name: "SM General Santos", region: "mindanao", city: "General Santos, Mindanao", lat: 6.1128, lon: 125.1716, status: "pending", category: "Mobile & Accessories", lastUpdate: "May 2026", footTraffic: 4200, manager: "V. Castro" },
];

// Attach computed world coords + placeholder photo sets
STORES.forEach((s, i) => {
  const w = geoToWorld(s.lat, s.lon);
  s.x = w.x;
  s.z = w.z;
  s.photos = [
    { label: "Store Front", seed: s.id + "-front" },
    { label: "Display Area", seed: s.id + "-display" },
    { label: "Category Shelf", seed: s.id + "-shelf" },
    { label: "Planogram", seed: s.id + "-plano" },
  ];
  // fake monthly status history Jan-Jun 2026 for timeline scrubber
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const statuses = ["approved", "pending", "issue"];
  s.history = months.map((m, idx) => {
    if (idx === months.length - 1) return { month: m, status: s.status };
    // deterministic pseudo-random based on index
    const seedNum = (i * 7 + idx * 13) % statuses.length;
    return { month: m, status: idx < 2 ? "pending" : statuses[seedNum] };
  });
});

function regionCenterWorld(regionId) {
  const r = REGIONS[regionId];
  return geoToWorld(r.center.lat, r.center.lon);
}

function storesByRegion(regionId) {
  if (regionId === "luzon") {
    // Luzon top-level view excludes NCR's dedicated substores visually grouped, but include all luzon+ncr
    return STORES.filter((s) => s.region === "luzon" || s.region === "ncr");
  }
  return STORES.filter((s) => s.region === regionId);
}

function regionStats(regionId) {
  const list = storesByRegion(regionId);
  const approved = list.filter((s) => s.status === "approved").length;
  const pending = list.filter((s) => s.status === "pending").length;
  const issue = list.filter((s) => s.status === "issue").length;
  return { total: list.length, approved, pending, issue };
}

const STATUS_META = {
  approved: { label: "Approved Planogram", color: "#22c55e", glow: "#4ade80", icon: "✓" },
  pending: { label: "Pending Review", color: "#f59e0b", glow: "#fbbf24", icon: "…" },
  issue: { label: "Needs Attention", color: "#ef4444", glow: "#f87171", icon: "!" },
};

window.PH_DATA = { REGIONS, STORES, geoToWorld, regionCenterWorld, storesByRegion, regionStats, STATUS_META, WORLD_SCALE };
