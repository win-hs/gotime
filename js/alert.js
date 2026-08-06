/*
 * 災害警特報：颱風警報、縣市天氣特報、熱帶氣旋路徑
 *
 * 三個資料集：
 *   W-C0034-001 颱風警報（CAP 格式，含 headline 與分節說明）
 *   W-C0033-001 縣市天氣特報（每縣市一個 hazards 陣列，空陣列＝無特報）
 *   W-C0034-005 熱帶氣旋路徑（西北太平洋所有活動中氣旋的過去與預報路徑）
 *
 * ⚠ 路徑預報誤差大，Radius70PercentProbability 才是「70% 機率落在此範圍」的圈，
 *   中心線只是最可能值，介面上必須一起呈現，避免被當成確定路徑。
 */

const Alerts = (function () {
  const TTL = 10 * 60 * 1000;
  const cache = {};

  async function get(id) {
    const c = cache[id];
    if (c && Date.now() - c.at < TTL) return c.data;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(`${CONFIG.CWA_BASE}${id}?Authorization=${CONFIG.CWA_API_KEY}`,
        { signal: ctl.signal });
      if (!r.ok) throw new Error(`${id} 取得失敗 ${r.status}`);
      const j = await r.json();
      cache[id] = { at: Date.now(), data: j };
      return j;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('警特報連線逾時');
      throw err;
    } finally { clearTimeout(timer); }
  }

  const num = (v) => { const x = parseFloat(v); return isFinite(x) ? x : null; };

  /* ---------------- 颱風警報（CAP） ---------------- */

  /** 只回生效中的警報；urgency 為 Past 或已過期者視為解除 */
  async function typhoonWarning() {
    const j = await get('W-C0034-001');
    const list = (j.records && j.records.info) || [];
    const now = Date.now();
    return list.filter((i) => {
      if (i.urgency === 'Past') return false;
      const exp = Date.parse(i.expires);
      return !isFinite(exp) || exp > now;
    }).map((i) => ({
      event: i.event,
      headline: i.headline,
      severity: i.severity,
      effective: i.effective,
      expires: i.expires,
      sections: ((i.description && i.description.section) || [])
        .map((s) => ({ title: s.title, value: s.value })),
      web: i.web || null,
    }));
  }

  /* ---------------- 縣市天氣特報 ---------------- */

  /** 取指定縣市目前生效中的特報（豪雨、強風、濃霧等） */
  async function countyHazards(countyName) {
    const j = await get('W-C0033-001');
    const list = (j.records && j.records.location) || [];
    const loc = list.find((l) => l.locationName === countyName);
    if (!loc) return [];
    const now = Date.now();
    return ((loc.hazardConditions && loc.hazardConditions.hazards) || []).map((h) => ({
      phenomena: h.info.phenomena,
      significance: h.info.significance,
      start: h.validTime.startTime,
      end: h.validTime.endTime,
    })).filter((h) => {
      const e = Date.parse(h.end.replace(' ', 'T') + '+08:00');
      return !isFinite(e) || e > now;
    });
  }

  /* ---------------- 熱帶氣旋路徑 ---------------- */

  /** 依近中心最大風速分級（中央氣象署標準，單位 m/s） */
  function grade(ms) {
    if (ms === null) return '';
    if (ms < 17.2) return '熱帶性低氣壓';
    if (ms < 32.7) return '輕度颱風';
    if (ms < 51.0) return '中度颱風';
    return '強烈颱風';
  }

  function parseFix(f, isForecast) {
    const q = f.Circle15ms && f.Circle15ms.QuadrantRadii && f.Circle15ms.QuadrantRadii.Radius;
    const quad = {};
    if (Array.isArray(q)) for (const x of q) quad[x.dir] = num(x.value);
    return {
      time: isForecast ? null : f.DateTime,
      hour: isForecast ? num(f.ForecastHour) : null,
      initial: isForecast ? f.InitialTime : null,
      lat: num(f.CoordinateLatitude),
      lon: num(f.CoordinateLongitude),
      wind: num(f.MaxWindSpeed),
      gust: num(f.MaxGustSpeed),
      pressure: num(f.Pressure),
      moveSpeed: num(f.MovingSpeed),
      moveDir: f.MovingDirection || null,
      movePred: (f.MovingPrediction || []).filter((m) => m.lang === 'zh-hant').map((m) => m.value)[0] || null,
      r15: f.Circle15ms ? num(f.Circle15ms.Radius) : null,
      r25: f.Circle25ms ? num(f.Circle25ms.Radius) : null,
      quad15: Object.keys(quad).length ? quad : null,
      r70: num(f.Radius70PercentProbability),
    };
  }

  /**
   * 取所有活動中氣旋，附上對指定座標的最近距離。
   * @returns {Array} 依「預報最近距離」由近到遠排序
   */
  async function cyclones(lat, lon) {
    const j = await get('W-C0034-005');
    const raw = (j.records && j.records.TropicalCyclones
      && j.records.TropicalCyclones.TropicalCyclone) || [];
    return raw.map((c) => {
      const past = ((c.AnalysisData && c.AnalysisData.Fix) || []).map((f) => parseFix(f, false));
      const fore = ((c.ForecastData && c.ForecastData.Fix) || []).map((f) => parseFix(f, true));
      const now = past.length ? past[past.length - 1] : null;

      let nearest = null;
      for (const f of fore) {
        if (f.lat === null || f.lon === null) continue;
        const d = Geo.distance(lat, lon, f.lat, f.lon);
        if (!nearest || d < nearest.dist) nearest = { dist: d, hour: f.hour, fix: f };
      }
      const nowDist = now ? Geo.distance(lat, lon, now.lat, now.lon) : null;

      // 暴風圈（七級風）是否會掃到選取位置
      let hit = null;
      for (const f of [now, ...fore]) {
        if (!f || f.lat === null || !f.r15) continue;
        const d = Geo.distance(lat, lon, f.lat, f.lon);
        if (d <= f.r15) { hit = { hour: f.hour, dist: d, r15: f.r15 }; break; }
      }

      return {
        name: c.CwaTyphoonName || c.TyphoonName,
        intlName: c.TyphoonName,
        no: c.CwaTyNo || c.CwaTdNo,
        year: c.Year,
        grade: now ? grade(now.wind) : '',
        now, past, forecast: fore,
        nowDist, nearest, hit,
      };
    }).sort((a, b) => (a.nearest ? a.nearest.dist : Infinity) - (b.nearest ? b.nearest.dist : Infinity));
  }

  /** 是否值得對使用者示警：暴風圈會掃到，或預報路徑進入 500 km 內 */
  function isRelevant(c, km) {
    if (c.hit) return true;
    const th = km || 500;
    if (c.nearest && c.nearest.dist <= th) return true;
    return c.nowDist !== null && c.nowDist <= th;
  }

  return { typhoonWarning, countyHazards, cyclones, isRelevant, grade };
})();
