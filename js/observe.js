/*
 * 即時觀測：自動氣象站現況（O-A0001-001，全臺約 876 站）
 * 預報是區域平均值，實況才知道現在樣區到底什麼狀況。
 * ⚠ CountyName 參數對此資料集無效（實測回傳全臺），故抓一次全部再自行找最近站並快取。
 * ⚠ 測站同時提供 TWD67 與 WGS84 座標，必須取 WGS84。
 */

const Observe = (function () {
  const DS = 'O-A0001-001';
  let cache = null, cacheAt = 0;
  const TTL = 10 * 60 * 1000;   // 觀測每 10 分鐘更新一次

  const DIRS = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東',
    '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西'];

  /** 風向角度 → 十六方位中文 */
  function windDir(deg) {
    const d = parseFloat(deg);
    if (!isFinite(d) || d < 0) return null;
    return DIRS[Math.round(((d % 360) / 22.5)) % 16];
  }

  /** 蒲福風級（由風速 m/s 換算，觀測資料未附風級） */
  function beaufort(ms) {
    if (ms === null) return null;
    const lim = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
    for (let i = 0; i < lim.length; i++) if (ms < lim[i]) return i;
    return 12;
  }

  const num = (v) => {
    const x = parseFloat(v);
    return isFinite(x) && x > -90 ? x : null;   // -99／-990 為無效值
  };

  async function fetchAll() {
    if (cache && Date.now() - cacheAt < TTL) return cache;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(`${CONFIG.CWA_BASE}${DS}?Authorization=${CONFIG.CWA_API_KEY}`,
        { signal: ctl.signal });
      if (!r.ok) throw new Error('即時觀測取得失敗 ' + r.status);
      const j = await r.json();
      const list = (j.records && j.records.Station) || [];
      cache = list.map((st) => {
        const wgs = st.GeoInfo.Coordinates.find((c) => c.CoordinateName === 'WGS84');
        const el = st.WeatherElement || {};
        const ext = el.DailyExtreme || {};
        const hi = ext.DailyHigh && ext.DailyHigh.TemperatureInfo;
        const lo = ext.DailyLow && ext.DailyLow.TemperatureInfo;
        const ws = num(el.WindSpeed);
        return {
          name: st.StationName,
          county: st.GeoInfo.CountyName, town: st.GeoInfo.TownName,
          lat: parseFloat(wgs.StationLatitude), lon: parseFloat(wgs.StationLongitude),
          alt: num(st.GeoInfo.StationAltitude),
          time: st.ObsTime.DateTime,
          weather: el.Weather && el.Weather !== '-99' ? el.Weather : null,
          temp: num(el.AirTemperature),
          humid: num(el.RelativeHumidity),
          rain: num(el.Now && el.Now.Precipitation),
          wind: ws, beaufort: beaufort(ws), dir: windDir(el.WindDirection),
          gust: num(el.GustInfo && el.GustInfo.PeakGustSpeed),
          tHigh: hi ? num(hi.AirTemperature) : null,
          tLow: lo ? num(lo.AirTemperature) : null,
        };
      }).filter((s) => isFinite(s.lat) && isFinite(s.lon));
      cacheAt = Date.now();
      return cache;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('即時觀測連線逾時');
      throw err;
    } finally { clearTimeout(timer); }
  }

  /** 取離指定座標最近的數個測站 */
  async function nearest(lat, lon, limit) {
    const list = await fetchAll();
    return list
      .map((s) => Object.assign({ dist: Geo.distance(lat, lon, s.lat, s.lon) }, s))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit || 3);
  }

  return { nearest, windDir, beaufort };
})();
