/*
 * 中央氣象署 API —— 全專案唯一碰氣象署的模組。
 * 上層只看正規化後的結構，不接觸原始 JSON；日後若需改走代理只換本檔。
 */

const CWA = (function () {
  const cache = new Map();
  const TIMEOUT = 15000;

  async function get(dataid, params) {
    const key = dataid + '|' + JSON.stringify(params);
    if (cache.has(key)) return cache.get(key);

    const q = new URLSearchParams(Object.assign({ Authorization: CONFIG.CWA_API_KEY }, params));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const r = await fetch(CONFIG.CWA_BASE + dataid + '?' + q, { signal: ctl.signal });
      if (!r.ok) throw new Error(r.status === 401 ? '授權碼無效或已失效' : '氣象署伺服器錯誤 ' + r.status);
      const j = await r.json();
      if (j.success !== 'true') throw new Error('氣象署回應異常');
      cache.set(key, j);
      return j;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('連線逾時，請重試');
      throw e;
    } finally { clearTimeout(timer); }
  }

  /* ---------------- 潮汐 F-A0021-001 ---------------- */

  /**
   * @param {string} pointName 潮汐預報點完整名稱
   * @returns {Promise<Array>} 依日期排序的每日潮汐
   *   [{date, lunarDate, range:'大|中|小', times:[{dt:Date, hhmm, tide:'滿潮|乾潮', cm}]}]
   */
  async function tide(pointName) {
    const j = await get('F-A0021-001', { LocationName: pointName });
    const fc = j.records.TideForecasts;
    if (!fc || !fc.length) throw new Error('查無此潮汐預報點');
    const daily = fc[0].Location.TimePeriods.Daily;

    // ⚠ 氣象署回傳的 Daily 未依日期排序，務必自行排序
    return daily.map((d) => ({
      date: d.Date,
      lunarDate: d.LunarDate,
      range: d.TideRange,
      times: (d.Time || []).map((t) => ({
        dt: new Date(t.DateTime),
        hhmm: t.DateTime.slice(11, 16),
        tide: t.Tide,
        cm: parseInt(t.TideHeights.AboveChartDatum, 10),
      })).sort((a, b) => a.dt - b.dt),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------------- 鄉鎮天氣 ---------------- */

  const EL7 = ['天氣現象', '12小時降雨機率', '最高溫度', '最低溫度', '風速',
    '紫外線指數', '最高體感溫度', '最低體感溫度', '天氣預報綜合描述'];
  const EL3 = ['天氣現象', '3小時降雨機率', '溫度', '風速', '天氣預報綜合描述'];

  /** 把 WeatherElement[] 依 StartTime 併成時段列（各要素段數不同，例如紫外線只有白天） */
  function mergePeriods(elements) {
    const map = new Map();
    for (const el of elements) {
      for (const t of el.Time) {
        const start = t.StartTime || t.DataTime;
        if (!map.has(start)) map.set(start, { start, end: t.EndTime || start, v: {} });
        Object.assign(map.get(start).v, t.ElementValue[0]);
      }
    }
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
  }

  function normalize(p) {
    const v = p.v;
    const num = (x) => (x === undefined || x === '' || x === '-' ? null : Number(x));
    return {
      start: p.start,
      end: p.end,
      date: p.start.slice(0, 10),
      hhmm: p.start.slice(11, 16),
      endHhmm: p.end.slice(11, 16),
      weather: v.Weather || null,
      code: v.WeatherCode || null,
      pop: num(v.ProbabilityOfPrecipitation),
      tMax: num(v.MaxTemperature),
      tMin: num(v.MinTemperature),
      temp: num(v.Temperature),
      atMax: num(v.MaxApparentTemperature),
      atMin: num(v.MinApparentTemperature),
      wind: num(v.WindSpeed),
      beaufort: v.BeaufortScale || null,
      uv: num(v.UVIndex),
      uvLevel: v.UVExposureLevel || null,
      desc: v.WeatherDescription || null,
    };
  }

  async function fetchWeather(dataid, townName, els) {
    const j = await get(dataid, { LocationName: townName, ElementName: els.join(',') });
    const locs = j.records.Locations[0].Location;
    if (!locs || !locs.length) throw new Error('查無此鄉鎮天氣資料');
    return mergePeriods(locs[0].WeatherElement).map(normalize);
  }

  /**
   * 取某鄉鎮某日的天氣時段。
   * 先用 1 週逐 12 小時；該日無資料時退回 3 天逐 3 小時（近日較細，且涵蓋當天剩餘時段）。
   * @returns {Promise<{periods, granularity:'12h'|'3h', all}>}
   */
  async function weather(town, dateStr) {
    let all = await fetchWeather(town.ds7, town.name, EL7);
    let periods = all.filter((p) => p.date === dateStr);
    let granularity = '12h';
    // 只有「早於 1 週預報起始日」才退回 3 天版（當天剩餘時段常只在 3 天版裡）；
    // 晚於結束日代表兩者都沒有，不必多打一次。
    if (!periods.length && all.length && dateStr < all[0].date) {
      all = await fetchWeather(town.ds3, town.name, EL3);
      periods = all.filter((p) => p.date === dateStr);
      granularity = '3h';
    }
    return { periods, granularity, all };
  }

  /**
   * 把 1 週逐 12 小時的時段依日期歸整成「白天／晚上」，供多日總覽表使用。
   * 白天＝06:00 起、晚上＝18:00 起（晚上時段跨到隔日 06:00，仍歸在起始日）。
   * 首日常因當下時間已過而缺白天時段，故兩者皆可能為 null。
   * @returns {Array<{date, day, night, uv, atMin, atMax}>}
   */
  function groupByDay(periods) {
    const map = new Map();
    for (const p of periods) {
      if (!map.has(p.date)) map.set(p.date, { date: p.date, day: null, night: null, uv: null, atMin: null, atMax: null });
      const g = map.get(p.date);
      if (p.hhmm === '06:00') g.day = p; else if (p.hhmm === '18:00') g.night = p;
      else if (!g.day) g.day = p;                       // 首日可能非整點起算
      if (p.uv !== null && g.uv === null) g.uv = { v: p.uv, level: p.uvLevel };
      for (const [k, v] of [['atMin', p.atMin], ['atMax', p.atMax]]) {
        if (v === null) continue;
        if (g[k] === null) g[k] = v;
        else g[k] = k === 'atMin' ? Math.min(g[k], v) : Math.max(g[k], v);
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 取某鄉鎮自 startDate 起 n 天的逐日總覽（僅打一次 1 週資料集） */
  async function weatherDays(town, startDate, n) {
    const all = await fetchWeather(town.ds7, town.name, EL7);
    return groupByDay(all).filter((g) => g.date >= startDate).slice(0, n);
  }

  return { tide, weather, weatherDays, groupByDay };
})();
