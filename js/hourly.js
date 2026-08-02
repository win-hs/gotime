/*
 * 今天天氣：溫度曲線（仿氣象署逐時預報圖）
 * 3 天 → 逐 3 小時，畫「體感溫度」與「溫度」兩條線；
 * 1 週 → 逐 12 小時，畫「最高溫」與「最低溫」兩條線。
 * 夜間時段（18:00–06:00）加淺色底，天氣圖示排在下方。
 */

const Hourly = (function () {
  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const PAD = { l: 34, r: 12, t: 16, b: 44 };
  const H = 210;
  const STEP = 46;          // 每個時間點的水平間距

  /**
   * @param {{points:Array, hourly:boolean}} sr CWA.series() 結果
   */
  function render(sr) {
    const pts = sr.points;
    if (!pts.length) return '<div class="state">此範圍無逐時預報資料</div>';

    // 兩條線的取值方式依資料粒度而異
    const upper = pts.map((p) => (sr.hourly ? p.at : p.tMax));
    const lower = pts.map((p) => (sr.hourly ? p.temp : p.tMin));
    const all = upper.concat(lower).filter((v) => v !== null && v !== undefined);
    if (!all.length) return '<div class="state">此範圍無溫度資料</div>';

    let min = Math.min(...all), max = Math.max(...all);
    min = Math.floor((min - 1) / 5) * 5;
    max = Math.ceil((max + 1) / 5) * 5;
    if (max - min < 10) max = min + 10;

    const W = PAD.l + PAD.r + STEP * (pts.length - 1) + 30;
    const x = (i) => PAD.l + 15 + i * STEP;
    const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / (max - min));

    // 夜間底色
    let bands = '';
    pts.forEach((p, i) => {
      const h = +p.hhmm.slice(0, 2);
      const night = h >= 18 || h < 6;
      if (!night) return;
      const x0 = i === 0 ? PAD.l : x(i) - STEP / 2;
      const x1 = i === pts.length - 1 ? W - PAD.r : x(i) + STEP / 2;
      bands += `<rect x="${x0}" y="${PAD.t}" width="${x1 - x0}" height="${H - PAD.t - PAD.b}" class="hb-night"/>`;
    });

    // 水平格線與刻度
    let grid = '';
    const stepV = (max - min) / 4;
    for (let v = min; v <= max + 0.01; v += stepV) {
      grid += `<line x1="${PAD.l}" y1="${y(v)}" x2="${W - PAD.r}" y2="${y(v)}" class="hb-grid"/>
        <text x="${PAD.l - 6}" y="${y(v) + 4}" class="hb-axis">${Math.round(v)}</text>`;
    }

    const path = (arr, cls) => {
      const d = arr.map((v, i) => (v === null || v === undefined ? null : `${x(i)},${y(v)}`))
        .filter(Boolean);
      if (d.length < 2) return '';
      return `<polyline points="${d.join(' ')}" class="${cls}"/>`;
    };
    const dots = (arr, cls) => arr.map((v, i) => (v === null || v === undefined ? ''
      : `<circle cx="${x(i)}" cy="${y(v)}" r="3" class="${cls}"/>`)).join('');
    const labels = (arr, cls, dy) => arr.map((v, i) => (v === null || v === undefined ? ''
      : `<text x="${x(i)}" y="${y(v) + dy}" class="${cls}">${v}</text>`)).join('');

    // 底部：天氣圖示、時刻、日期換日標記
    let foot = '';
    pts.forEach((p, i) => {
      const h = p.hhmm.slice(0, 2);
      const showIcon = sr.hourly ? i % 2 === 0 : true;
      if (showIcon) {
        foot += `<text x="${x(i)}" y="${H - PAD.b + 22}" class="hb-ico">${Forecast.icon(p.weather, +h >= 18 || +h < 6)}</text>`;
      }
      foot += `<text x="${x(i)}" y="${H - PAD.b + 38}" class="hb-hr">${h}</text>`;
      if (i === 0 || p.date !== pts[i - 1].date) {
        foot += `<text x="${x(i)}" y="${H - 4}" class="hb-date">${p.date.slice(5).replace('-', '/')}</text>
          <line x1="${x(i) - STEP / 2}" y1="${PAD.t}" x2="${x(i) - STEP / 2}" y2="${H - PAD.b}" class="hb-day"/>`;
      }
    });

    const legend = sr.hourly
      ? '<span class="lg lg-up">體感溫度</span><span class="lg lg-lo">溫度</span>'
      : '<span class="lg lg-up">最高溫</span><span class="lg lg-lo">最低溫</span>';

    return `
      <div class="hb-legend">${legend}<span class="hb-unit">°C</span></div>
      <div class="hb-scroll">
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="hb-svg">
          ${bands}${grid}
          ${path(lower, 'hb-line lo')}${path(upper, 'hb-line up')}
          ${dots(lower, 'hb-dot lo')}${dots(upper, 'hb-dot up')}
          ${labels(upper, 'hb-val up', -9)}${labels(lower, 'hb-val lo', 16)}
          ${foot}
        </svg>
      </div>`;
  }

  return { render };
})();
