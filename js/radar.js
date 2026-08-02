/*
 * 雷達回波疊圖
 *
 * 兩個實測結論決定了本模組的作法：
 * 1. 雷達 PNG 的 <img crossOrigin> 會被拒，但 fetch() 可讀（回應 type: cors）。
 *    故走 fetch → blob → objectURL，canvas 才不會被污染。
 * 2. 圖是等經緯度投影且**完全不透明**（約 78% 為白底，另有灰色海岸線）。
 *    直接用 L.imageOverlay 貼到 Web Mercator 上，緯度中段會偏移約 3.8 公里，
 *    且白底會蓋住地圖。因此需要「重投影 + 去背」後才能疊圖。
 */

const Radar = (function () {
  const META = 'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/O-A0058-003';
  const OUT = 1800;          // 輸出邊長（原圖 3600 對顯示而言過剩）
  const SAT_MIN = 25;        // 飽和度門檻：低於此視為地圖裝飾（白底/灰海岸線）→ 去背

  let objUrl = null;

  const merc = (deg) => Math.log(Math.tan(Math.PI / 4 + (deg * Math.PI / 180) / 2));
  const mercInv = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

  /** 取得回波圖資訊（圖檔網址、觀測時間、經緯度範圍） */
  async function meta() {
    const url = `${META}?Authorization=${CONFIG.CWA_API_KEY}&downloadType=WEB&format=JSON`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('雷達資料取得失敗 ' + r.status);
      const j = JSON.parse(await r.text());
      const ds = j.cwaopendata.dataset;
      const ps = ds.datasetInfo.parameterSet;
      const [w, e] = ps.LongitudeRange.split('-').map(Number);
      const [s, n] = ps.LatitudeRange.split('-').map(Number);
      return { image: ds.resource.ProductURL, time: ds.DateTime, bounds: [[s, w], [n, e]] };
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('雷達資料連線逾時');
      throw err;
    } finally { clearTimeout(timer); }
  }

  /**
   * 下載回波圖 →（縱向）重投影為 Mercator 線性 → 依飽和度去背 → 產生可疊圖的 objectURL。
   * 重投影後 Leaflet 的線性拉伸才會對齊，殘餘誤差小於一個輸出像素。
   */
  async function buildOverlay(m) {
    const blob = await (await fetch(m.image + '?t=' + Date.now())).blob();
    if (objUrl) URL.revokeObjectURL(objUrl);
    const srcUrl = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => rej(new Error('雷達圖載入失敗'));
      i.src = srcUrl;
    });

    const [[s, w], [n, e]] = m.bounds;
    const yS = merc(s), yN = merc(n);
    const cv = document.createElement('canvas');
    cv.width = OUT; cv.height = OUT;
    const cx = cv.getContext('2d');

    // 逐列重取樣：輸出列在 Mercator y 上等距，回推來源列（等經緯度）
    const srcH = img.naturalHeight, srcW = img.naturalWidth;
    for (let j = 0; j < OUT; j++) {
      const lat0 = mercInv(yN + (j / OUT) * (yS - yN));
      const lat1 = mercInv(yN + ((j + 1) / OUT) * (yS - yN));
      const r0 = (n - lat0) / (n - s) * srcH;
      const r1 = (n - lat1) / (n - s) * srcH;
      cx.drawImage(img, 0, r0, srcW, Math.max(1, r1 - r0), 0, j, OUT, 1);
    }
    URL.revokeObjectURL(srcUrl);

    // 去背：雷達回波為高飽和色，白底與灰色海岸線飽和度接近 0
    const id = cx.getImageData(0, 0, OUT, OUT);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      if (mx - mn < SAT_MIN) d[i + 3] = 0;
    }
    cx.putImageData(id, 0, 0);

    objUrl = await new Promise((res) => cv.toBlob((bl) => res(URL.createObjectURL(bl)), 'image/png'));
    return { url: objUrl, bounds: m.bounds, time: m.time };
  }

  function dispose() {
    if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
  }

  return { meta, buildOverlay, dispose };
})();
