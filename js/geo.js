/* 地理對應：最近鄉鎮（天氣）、最近潮汐點、地名搜尋 */

const Geo = (function () {
  let towns = null, tidePts = null, loading = null;

  function load() {
    if (towns) return Promise.resolve();
    if (!loading) {
      loading = Promise.all([
        fetch('data/towns.json').then((r) => r.json()),
        fetch('data/tide-points.json').then((r) => r.json()),
      ]).then(([t, p]) => { towns = t; tidePts = p; });
    }
    return loading;
  }

  /** 兩點球面距離（公里） */
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371, D = Math.PI / 180;
    const dLat = (lat2 - lat1) * D, dLon = (lon2 - lon1) * D;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * D) * Math.cos(lat2 * D) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nearest(list, lat, lon) {
    let best = null, bestD = Infinity;
    for (const x of list) {
      const d = distance(lat, lon, x.lat, x.lon);
      if (d < bestD) { bestD = d; best = x; }
    }
    return best ? Object.assign({ dist: bestD }, best) : null;
  }

  const nearestTown = (lat, lon) => nearest(towns, lat, lon);
  const nearestTide = (lat, lon) => nearest(tidePts, lat, lon);

  /** Nominatim 地名搜尋（免金鑰，僅使用者主動搜尋時呼叫一次） */
  async function search(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=tw&q='
      + encodeURIComponent(q);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { 'Accept-Language': 'zh-TW' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return (await r.json()).map((x) => ({
        name: x.display_name, lat: parseFloat(x.lat), lon: parseFloat(x.lon),
      }));
    } finally { clearTimeout(timer); }
  }

  return { load, distance, nearestTown, nearestTide, search };
})();
