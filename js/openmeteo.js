/*
 * Open-Meteo 逐時雨量 —— 全專案唯一碰 Open-Meteo 的模組（比照 cwa.js 的慣例）。
 *
 * 為什麼要多接一家：氣象署鄉鎮預報**只有降雨機率，沒有雨量 mm**
 * （F-D0047-001／-003 的元素清單實測確認），定量降水預報 QPF 只出圖不出點位資料。
 * Open-Meteo 免金鑰、回應帶 Access-Control-Allow-Origin: *，可自 GitHub Pages 直連。
 *
 * ⚠ 全球模式格點約 9–11 km，臺灣山區地形降水會失真，與氣象署的鄉鎮降尺度機率
 *   不一致屬正常現象。兩者在圖上必須分別標示來源，不可混為一談。
 */

const OpenMeteo = (function () {
  const BASE = 'https://api.open-meteo.com/v1/forecast';
  // Open-Meteo 的失敗型態是「間歇性卡死」：健康時約 0.3 秒回應，卡住時連 40 秒都不回
  // （實測連續 3 次卡死後第 4 次 1 秒內成功）。與其單次等 15 秒，
  // 不如單次短等並重試——每次重試都是全新連線，成功率遠高於乾等同一條。
  const TIMEOUT = 6000;
  const ATTEMPTS = 3;
  const cache = new Map();

  /**
   * 取逐時雨量與降雨機率。start_date／end_date 皆含當日整日（00:00–23:00）。
   * @returns {Promise<{times:string[], rain:Array<number|null>, pop:Array<number|null>}>}
   *   times 為 'YYYY-MM-DDTHH:mm' 當地時間字串
   */
  async function hourly(lat, lon, startDate, endDate) {
    const key = [lat.toFixed(3), lon.toFixed(3), startDate, endDate].join('|');
    if (cache.has(key)) return cache.get(key);

    const q = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      hourly: 'precipitation,precipitation_probability',
      timezone: CONFIG.TZ,
      start_date: startDate,
      end_date: endDate,
    });
    let lastErr;
    for (let n = 1; n <= ATTEMPTS; n++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT);
      try {
        const r = await fetch(BASE + '?' + q, { signal: ctl.signal });
        // 4xx 是請求本身有問題（重試也一樣），直接放棄；5xx 與逾時才值得重試
        if (r.status >= 400 && r.status < 500) throw fatal('Open-Meteo 請求被拒 ' + r.status);
        if (!r.ok) throw new Error('Open-Meteo 伺服器錯誤 ' + r.status);
        const j = await r.json();
        const h = j.hourly;
        if (!h || !h.time || !h.time.length) throw fatal('Open-Meteo 無此範圍資料');

        const num = (v) => (v === null || v === undefined ? null : Number(v));
        const out = {
          times: h.time,
          rain: (h.precipitation || []).map(num),
          pop: (h.precipitation_probability || []).map(num),
        };
        cache.set(key, out);
        return out;
      } catch (e) {
        if (e.fatal) throw e;
        lastErr = e.name === 'AbortError' ? new Error('Open-Meteo 連線逾時') : e;
      } finally { clearTimeout(timer); }
    }
    throw new Error(lastErr.message + `（已重試 ${ATTEMPTS} 次）`);
  }

  function fatal(msg) { const e = new Error(msg); e.fatal = true; return e; }

  return { hourly };
})();
