/* 地理對應：最近鄉鎮／潮汐點、本機地名建議、Nominatim 搜尋 */

const Geo = (function () {
  let towns = null, tidePts = null, loading = null, index = null, counties = null;

  // 各縣市 1 週預報資料集代碼 → 縣市名（towns.json 只存 ds7，縣市由此回推）
  const DS7_COUNTY = {
    'F-D0047-003': '宜蘭縣', 'F-D0047-007': '桃園市', 'F-D0047-011': '新竹縣',
    'F-D0047-015': '苗栗縣', 'F-D0047-019': '彰化縣', 'F-D0047-023': '南投縣',
    'F-D0047-027': '雲林縣', 'F-D0047-031': '嘉義縣', 'F-D0047-035': '屏東縣',
    'F-D0047-039': '臺東縣', 'F-D0047-043': '花蓮縣', 'F-D0047-047': '澎湖縣',
    'F-D0047-051': '基隆市', 'F-D0047-055': '新竹市', 'F-D0047-059': '嘉義市',
    'F-D0047-063': '臺北市', 'F-D0047-067': '高雄市', 'F-D0047-071': '新北市',
    'F-D0047-075': '臺中市', 'F-D0047-079': '臺南市', 'F-D0047-083': '連江縣',
    'F-D0047-087': '金門縣',
  };

  function load() {
    if (towns) return Promise.resolve();
    if (!loading) {
      loading = Promise.all([
        fetch('data/towns.json').then((r) => r.json()),
        fetch('data/tide-points.json').then((r) => r.json()),
      ]).then(([t, p]) => {
        towns = t.map((x) => Object.assign({ county: DS7_COUNTY[x.ds7] || '' }, x));
        tidePts = p;
        buildIndex();
      });
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

  /* ---------------- 本機地名建議 ---------------- */

  // 台／臺 混用極常見（使用者打「台東」，官方寫「臺東」）
  const norm = (s) => String(s).trim().replace(/台/g, '臺').toLowerCase();

  function buildIndex() {
    // 縣市中心＝其轄下鄉鎮座標平均
    const byCounty = new Map();
    for (const t of towns) {
      if (!byCounty.has(t.county)) byCounty.set(t.county, []);
      byCounty.get(t.county).push(t);
    }
    counties = [...byCounty.entries()].map(([name, list]) => ({
      name,
      lat: list.reduce((s, x) => s + x.lat, 0) / list.length,
      lon: list.reduce((s, x) => s + x.lon, 0) / list.length,
    }));

    index = [
      ...counties.map((c) => ({ label: c.name, sub: '縣市', lat: c.lat, lon: c.lon, rank: 0 })),
      ...towns.map((t) => ({ label: t.name, sub: t.county, lat: t.lat, lon: t.lon, rank: 1 })),
      // 潮汐點只收漁港／潛點等獨有地名；「鄉鎮」類與上面的鄉鎮清單重複，會白佔建議名額
      ...tidePts.filter((p) => p.kind !== '鄉鎮')
        .map((p) => ({ label: p.name, sub: '潮汐點・' + p.kind, lat: p.lat, lon: p.lon, rank: 2 })),
    ];
    for (const it of index) it._n = norm(it.label);
  }

  /**
   * 即時輸入建議：只查本機清單（縣市／鄉鎮／潮汐點），零延遲、不打外部 API。
   * Nominatim 的使用規範禁止逐鍵自動完成，故完整地名／地址另走 search()。
   */
  function suggest(q, limit) {
    if (!index || !q.trim()) return [];
    const n = norm(q);
    const hits = [];
    for (const it of index) {
      let score;
      if (it._n === n) score = 0;
      else if (it._n.startsWith(n)) score = 1;
      else if (it._n.includes(n)) score = 2;
      else continue;
      hits.push({ it, score });
    }
    hits.sort((a, b) => (a.score - b.score) || (a.it.rank - b.it.rank)
      || a.it.label.length - b.it.label.length);
    return hits.slice(0, limit || 5).map((h) => h.it);
  }

  /* ---------------- Nominatim ---------------- */

  /**
   * 完整地名／地址搜尋（山名、路名門牌等）。僅在使用者送出時呼叫一次。
   * 每筆附上以本機清單算出的鄉鎮歸屬，方便分辨同名地點。
   */
  async function search(q, limit) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit='
      + (limit || 5) + '&countrycodes=tw&accept-language=zh-TW&q=' + encodeURIComponent(q);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return (await r.json()).map((x) => {
        const lat = parseFloat(x.lat), lon = parseFloat(x.lon);
        const t = towns ? nearestTown(lat, lon) : null;
        return {
          label: x.name || x.display_name.split(',')[0],
          sub: t ? `${t.county}${t.name}` : '',
          detail: x.display_name,
          type: x.type || '',
          lat, lon,
        };
      });
    } finally { clearTimeout(timer); }
  }

  return { load, distance, nearestTown, nearestTide, suggest, search, DS7_COUNTY };
})();
