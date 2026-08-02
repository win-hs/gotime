/*
 * 今天天氣：溫度曲線
 * 3 天 → 逐 3 小時，畫「體感溫度」與「溫度」兩條線；
 * 1 週 → **每日一點**（逐 12 小時的高低溫聚合成當日最高／最低），
 *        否則 14 個點的鋸齒與標籤會互相重疊。
 * 夜間時段加淺色底，天氣圖示排在下方。
 */

const Hourly = (function () {
  const PAD = { l: 36, r: 14, t: 20, b: 46 };
  const H = 220;
  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  const weekday = (ds) => {
    const [y, m, d] = ds.split('-').map(Number);
    return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };

  /** 逐 12 小時 → 每日一點，取當日最高與最低 */
  function toDaily(points) {
    const map = new Map();
    for (const p of points) {
      if (!map.has(p.date)) map.set(p.date, { date: p.date, hi: null, lo: null, weather: null, night: false });
      const g = map.get(p.date);
      if (p.tMax !== null) g.hi = g.hi === null ? p.tMax : Math.max(g.hi, p.tMax);
      if (p.tMin !== null) g.lo = g.lo === null ? p.tMin : Math.min(g.lo, p.tMin);
      if (p.hhmm === '06:00' || !g.weather) g.weather = p.weather;   // 以白天天氣為代表
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function render(sr) {
    const hourly = sr.hourly;
    const src = hourly ? sr.points : toDaily(sr.points);
    if (!src.length) return '<div class="state">此範圍無逐時預報資料</div>';

    const upper = src.map((p) => (hourly ? p.at : p.hi));
    const lower = src.map((p) => (hourly ? p.temp : p.lo));
    const all = upper.concat(lower).filter((v) => v !== null && v !== undefined);
    if (!all.length) return '<div class="state">此範圍無溫度資料</div>';

    let min = Math.min(...all), max = Math.max(...all);
    min = Math.floor((min - 1) / 5) * 5;
    max = Math.ceil((max + 1) / 5) * 5;
    if (max - min < 10) max = min + 10;

    const STEP = hourly ? 52 : 84;      // 每日模式點少、間距放大，標籤才不會擠
    const W = PAD.l + PAD.r + STEP * (src.length - 1) + 40;
    const x = (i) => PAD.l + 20 + i * STEP;
    const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / (max - min));

    // 夜間底色（僅逐時模式有意義）
    let bands = '';
    if (hourly) {
      src.forEach((p, i) => {
        const h = +p.hhmm.slice(0, 2);
        if (!(h >= 18 || h < 6)) return;
        const x0 = i === 0 ? PAD.l : x(i) - STEP / 2;
        const x1 = i === src.length - 1 ? W - PAD.r : x(i) + STEP / 2;
        bands += `<rect x="${x0}" y="${PAD.t}" width="${x1 - x0}" height="${H - PAD.t - PAD.b}" class="hb-night"/>`;
      });
    }

    let grid = '';
    const stepV = (max - min) / 4;
    for (let v = min; v <= max + 0.01; v += stepV) {
      grid += `<line x1="${PAD.l}" y1="${y(v)}" x2="${W - PAD.r}" y2="${y(v)}" class="hb-grid"/>
        <text x="${PAD.l - 6}" y="${y(v) + 4}" class="hb-axis">${Math.round(v)}</text>`;
    }

    const path = (arr, cls) => {
      const d = arr.map((v, i) => (v === null || v === undefined ? null : `${x(i)},${y(v)}`)).filter(Boolean);
      return d.length < 2 ? '' : `<polyline points="${d.join(' ')}" class="${cls}"/>`;
    };
    const dots = (arr, cls) => arr.map((v, i) => (v === null || v === undefined ? ''
      : `<circle cx="${x(i)}" cy="${y(v)}" r="3" class="${cls}"/>`)).join('');
    // 逐時模式點密，僅每隔一點標數字，避免互相重疊
    const labels = (arr, cls, dy) => arr.map((v, i) => {
      if (v === null || v === undefined) return '';
      if (hourly && i % 2 === 1) return '';
      return `<text x="${x(i)}" y="${y(v) + dy}" class="${cls}">${v}</text>`;
    }).join('');

    let foot = '';
    src.forEach((p, i) => {
      if (hourly) {
        const h = p.hhmm.slice(0, 2);
        const night = +h >= 18 || +h < 6;
        if (i % 2 === 0) foot += `<text x="${x(i)}" y="${H - PAD.b + 24}" class="hb-ico">${Forecast.icon(p.weather, night)}</text>`;
        foot += `<text x="${x(i)}" y="${H - PAD.b + 40}" class="hb-hr">${h}</text>`;
        if (i === 0 || p.date !== src[i - 1].date) {
          foot += `<text x="${x(i)}" y="${H - 4}" class="hb-date">${p.date.slice(5).replace('-', '/')}</text>
            <line x1="${x(i) - STEP / 2}" y1="${PAD.t}" x2="${x(i) - STEP / 2}" y2="${H - PAD.b}" class="hb-day"/>`;
        }
      } else {
        foot += `<text x="${x(i)}" y="${H - PAD.b + 24}" class="hb-ico">${Forecast.icon(p.weather, false)}</text>
          <text x="${x(i)}" y="${H - PAD.b + 40}" class="hb-date">${p.date.slice(5).replace('-', '/')}</text>
          <text x="${x(i)}" y="${H - 6}" class="hb-hr">週${weekday(p.date)}</text>`;
      }
    });

    const legend = hourly
      ? '<span class="lg lg-up">體感溫度</span><span class="lg lg-lo">溫度</span>'
      : '<span class="lg lg-up">最高溫</span><span class="lg lg-lo">最低溫</span>';

    return `
      <div class="hb-legend">${legend}<span class="hb-unit">°C</span></div>
      <div class="hb-scroll">
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="hb-svg">
          ${bands}${grid}
          ${path(lower, 'hb-line lo')}${path(upper, 'hb-line up')}
          ${dots(lower, 'hb-dot lo')}${dots(upper, 'hb-dot up')}
          ${labels(upper, 'hb-val up', -10)}${labels(lower, 'hb-val lo', 17)}
          ${foot}
        </svg>
      </div>`;
  }

  return { render };
})();
