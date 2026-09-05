/*
 * 雨量圖：Open-Meteo 逐時雨量（左軸 mm）＋ 中央氣象署降雨機率（右軸 %）。
 *
 * 兩層刻意用不同畫法，因為它們的資料密度本來就不同，不該畫成一樣：
 *   雨量 —— 逐時，長條＋單調三次插值曲線；
 *   機率 —— 區間值（3 小時，超過 3 天的部分為 12 小時），**階梯**線。
 *            一格內部沒有變化資訊，畫成平滑曲線等於編造不存在的數值；
 *            階梯的寬度同時讓你看見資料粒度在第 4 天變粗。
 * 曲線用 monotone（Fritsch–Carlson）而非一般三次插值：雨量是區間累積量，
 * 一般插值會在尖峰兩側過衝，在實際為 0 的時段畫出雨來，甚至壓到零線以下。
 */

const RainChart = (function () {
  const H = 240;
  const PAD = { t: 18, b: 54 };                 // 圖面本身只需上下留白
  const AX = { l: 76, r: 72 };                  // 左右固定軸的寬度（軸標題＋帶單位刻度）

  /** b - a 的天數差（僅比較日期，不涉時區） */
  function dayDiff(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  /** 'YYYY-MM-DDTHH:...' → 自 startDate 00:00 起算的第幾個小時 */
  const slotOf = (startDate, iso) =>
    dayDiff(startDate, iso.slice(0, 10)) * 24 + parseInt(iso.slice(11, 13), 10);

  const DIV = 5;                                // 格線等分數；兩軸共用

  /**
   * 左軸上界。**下限固定 10 mm**：軸頂若跟著資料縮到 4 mm，
   * 0.3 mm 的零星小雨會被畫得像大事，日與日之間也無法直接比高度。
   * 候選值皆可被 DIV 整除，刻度才不會出現小數。
   */
  function niceMax(v) {
    for (const c of [10, 20, 40, 60, 100, 200]) if (v <= c) return c;
    return Math.ceil(v / 50) * 50;
  }

  /**
   * 單調三次插值路徑（Fritsch–Carlson）。相鄰資料點之間只會單調變化，
   * 不會過衝到區間外，因此不會無中生有畫出雨量。
   */
  function monotonePath(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
    }
    t[0] = m[0];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) { t[i] = 0; continue; }
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
    t[n - 1] = m[n - 2];

    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + t[i] * h).toFixed(1)}`
        + ` ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - t[i + 1] * h).toFixed(1)}`
        + ` ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
    }
    return d;
  }

  /**
   * @param {?{times,rain}} om      Open-Meteo 逐時值；取不到時傳 null，本圖只畫機率階梯
   * @param {Array} popPoints       CWA.popSeries() 的結果（含 start／hours／pop）
   * @param {string} startDate      'YYYY-MM-DD'
   * @param {number} days           顯示天數
   */
  function render(om, popPoints, startDate, days) {
    const N = days * 24;
    const STEP = days <= 3 ? 13 : 7;          // 一週要塞 168 小時，格寬得縮小
    const HR_EVERY = days <= 3 ? 3 : 6;       // 時刻標籤密度，否則會擠成一團

    const rain = new Array(N).fill(null);
    if (om) {
      om.times.forEach((t, i) => {
        const s = slotOf(startDate, t);
        if (s >= 0 && s < N) rain[s] = om.rain[i];
      });
    }

    // 機率直接用區間畫，3 小時與 12 小時混用時階梯寬度自然不同
    const spans = [];
    for (const p of (popPoints || [])) {
      const s = slotOf(startDate, p.start), e = s + p.hours;
      if (e <= 0 || s >= N) continue;
      spans.push({ s: Math.max(0, s), e: Math.min(N, e), pop: p.pop, hours: p.hours });
    }

    const hasRain = rain.some((v) => v !== null);
    const hasPop = spans.length > 0;
    if (!hasRain && !hasPop) return '<div class="state">此範圍無雨量與降雨機率資料</div>';

    const maxMM = niceMax(Math.max(...rain.filter((v) => v !== null), 0));
    const W = STEP * N;                       // 圖面本身，不含左右軸
    const plotH = H - PAD.t - PAD.b;
    const x = (i) => i * STEP + STEP / 2;
    const yR = (v) => PAD.t + plotH * (1 - v / maxMM);
    const yP = (v) => PAD.t + plotH * (1 - v / 100);

    // 夜間底色（18:00–06:00），與其他圖一致
    let bands = '';
    for (let i = 0; i < N; i++) {
      const h = i % 24;
      if (!(h >= 18 || h < 6)) continue;
      bands += `<rect x="${i * STEP}" y="${PAD.t}" width="${STEP}" height="${plotH}" class="hb-night"/>`;
    }

    let grid = '';
    for (let k = 0; k <= DIV; k++) {
      const y = PAD.t + plotH * (1 - k / DIV);
      grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="hb-grid"/>`;
    }

    /* 左右軸各自畫成獨立的固定 SVG，只有中間圖面橫向捲動。
       原本三者在同一張 SVG 裡，1 週模式下右軸會被推出畫面 ——
       看不到的軸標題等於沒做。刻度**帶單位**，兩軸的數字才不會被讀成同一組。 */
    const axis = (side) => {
      const w = side === 'l' ? AX.l : AX.r;
      let s = '';
      for (let k = 0; k <= DIV; k++) {
        const y = PAD.t + plotH * (1 - k / DIV);
        s += side === 'l'
          ? `<text x="${w - 6}" y="${y + 4}" class="hb-axis">${maxMM * k / DIV} mm</text>`
          : `<text x="6" y="${y + 4}" class="rc-axis-r">${100 * k / DIV}%</text>`;
      }
      const midY = PAD.t + plotH / 2;
      const tx = side === 'l' ? 14 : w - 14;
      const rot = side === 'l' ? -90 : 90;
      const title = side === 'l' ? '雨量（mm）' : '降雨機率（%）';
      s += `<text x="${tx}" y="${midY}" class="rc-axis-t" transform="rotate(${rot} ${tx} ${midY})">${title}</text>`;
      return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" class="rc-axis-svg">${s}</svg>`;
    };

    // 雨量：長條打底＋曲線描邊。長條保住「哪一小時下多少」，曲線給趨勢
    let bars = '', area = '', line = '';
    if (hasRain) {
      for (let i = 0; i < N; i++) {
        const v = rain[i];
        if (v === null || v <= 0) continue;
        const y = yR(Math.min(v, maxMM));
        bars += `<rect x="${i * STEP}" y="${y.toFixed(1)}" width="${STEP}"`
          + ` height="${(PAD.t + plotH - y).toFixed(1)}" class="rc-bar"/>`;
      }
      const pts = [];
      for (let i = 0; i < N; i++) {
        if (rain[i] === null) continue;
        pts.push({ x: x(i), y: yR(Math.min(rain[i], maxMM)) });
      }
      const d = monotonePath(pts);
      if (d) {
        const base = PAD.t + plotH;
        area = `<path d="${d} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z" class="rc-area"/>`;
        line = `<path d="${d}" class="rc-line"/>`;
      }
    }

    // 機率階梯：相鄰區間垂直跳接，有缺口則斷開
    let step = '';
    if (hasPop) {
      let d = '', prevEnd = null;
      for (const sp of spans) {
        const x0 = sp.s * STEP, x1 = sp.e * STEP, y = yP(sp.pop).toFixed(1);
        d += (prevEnd === sp.s ? ` L${x0},${y}` : ` M${x0},${y}`) + ` L${x1},${y}`;
        prevEnd = sp.e;
      }
      // 氣象署機率只發布到約第 4 天，線就自然斷在那裡
      step = `<path d="${d.trim()}" class="rc-pop"/>`;
    }

    // 底部：時刻標籤，跨日處加分隔線與日期
    let foot = '';
    const yHr = H - PAD.b + 18, yDate = H - PAD.b + 36;
    for (let i = 0; i < N; i++) {
      const h = i % 24;
      if (h % HR_EVERY === 0) foot += `<text x="${x(i)}" y="${yHr}" class="hb-hr">${h < 10 ? '0' + h : h}</text>`;
      if (h === 0) {
        const ds = Astro.shiftDate(startDate, Math.floor(i / 24));
        foot += `<text x="${x(i)}" y="${yDate}" class="hb-date">${ds.slice(5).replace('-', '/')}</text>`;
        if (i > 0) foot += `<line x1="${i * STEP}" y1="${PAD.t}" x2="${i * STEP}" y2="${PAD.t + plotH}" class="hb-day"/>`;
      }
    }

    const legend = (hasRain ? '<span class="lg rc-lg-rain">雨量（左軸 mm）</span>' : '')
      + (hasPop ? '<span class="lg rc-lg-pop">降雨機率（右軸 %，滿刻度 100%）</span>' : '');

    return `
      <div class="hb-legend">${legend}</div>
      <div class="rc-row">
        ${hasRain ? axis('l') : ''}
        <div class="hb-scroll">
          <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="hb-svg">
            ${bands}${grid}${bars}${area}${line}${step}${foot}
          </svg>
        </div>
        ${hasPop ? axis('r') : ''}
      </div>`;
  }

  return { render };
})();
