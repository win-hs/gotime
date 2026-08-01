/*
 * 多日總覽表：列＝項目、欄＝日期（仿氣象署鄉鎮預報版面）。
 * 天氣取 1 週逐 12 小時（白天／晚上），日月為本機計算，潮汐取當前潮汐點。
 * 桌機一次看完；手機在自己的容器內橫向捲動，頁面本身不橫捲。
 */

const MultiDay = (function () {
  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  function weekday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  /** 由天氣現象文字取一個代表圖示（避開整份 WeatherCode 對照表） */
  function icon(text, night) {
    if (!text) return '';
    if (/雷/.test(text)) return '⛈️';
    if (/雨|雪/.test(text)) return /晴|多雲/.test(text) ? '🌦️' : '🌧️';
    if (/霧/.test(text)) return '🌫️';
    if (/陰/.test(text)) return '☁️';
    if (/多雲/.test(text)) return /晴/.test(text) ? (night ? '☁️' : '⛅') : '☁️';
    if (/晴/.test(text)) return night ? '🌙' : '☀️';
    return '';
  }

  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function cellWeather(p, night) {
    if (!p) return '<td class="mx">—</td>';
    const t = (p.tMin !== null && p.tMax !== null) ? `${p.tMin} - ${p.tMax}°C`
      : (p.temp !== null ? `${p.temp}°C` : '');
    return `<td>
      <div class="mx-ico">${icon(p.weather, night)}</div>
      <div class="mx-wx">${esc(p.weather || '—')}</div>
      <div class="mx-t">${t}</div>
      ${p.pop !== null ? `<div class="mx-pop">${p.pop}%</div>` : ''}
    </td>`;
  }

  /**
   * @param {Array} wdays  CWA.weatherDays() 的結果
   * @param {Array} dates  要顯示的日期（可能多於 wdays，超出預報範圍者留白）
   * @param {Object} opt   {lat, lon, tideDays, show:{sun,moon,tide,weather}, today, current}
   */
  function render(dates, wdays, opt) {
    const byDate = new Map(wdays.map((g) => [g.date, g]));
    const rows = [];

    const head = dates.map((d) => {
      const cls = [d === opt.current ? 'cur' : '', d === opt.today ? 'today' : ''].join(' ');
      return `<th class="${cls}"><div class="mh-d">${d.slice(5).replace('-', '/')}</div>
        <div class="mh-w">星期${weekday(d)}</div></th>`;
    }).join('');

    if (opt.show.weather) {
      rows.push(`<tr><th class="rh">白天</th>${dates.map((d) => {
        const g = byDate.get(d); return cellWeather(g && g.day, false);
      }).join('')}</tr>`);
      rows.push(`<tr><th class="rh">晚上</th>${dates.map((d) => {
        const g = byDate.get(d); return cellWeather(g && g.night, true);
      }).join('')}</tr>`);
      rows.push(`<tr><th class="rh">體感溫度</th>${dates.map((d) => {
        const g = byDate.get(d);
        return `<td class="mx-sm">${g && g.atMin !== null ? `${g.atMin} - ${g.atMax}°C` : '—'}</td>`;
      }).join('')}</tr>`);
      rows.push(`<tr><th class="rh">紫外線</th>${dates.map((d) => {
        const g = byDate.get(d);
        if (!g || !g.uv) return '<td class="mx-sm">—</td>';
        return `<td><span class="uv-badge uv${uvBand(g.uv.v)}">${g.uv.v}</span>
          <div class="mx-sm">${esc(g.uv.level || '')}</div></td>`;
      }).join('')}</tr>`);
    }

    if (opt.show.sun) {
      rows.push(`<tr><th class="rh">日出／日落</th>${dates.map((d) => {
        const s = Astro.sun(d, opt.lat, opt.lon);
        const g = (k) => (s.rows.find((r) => r.key === k) || {}).text || '—';
        return `<td class="mx-sm mono">${g('sunrise')}<br>${g('sunset')}</td>`;
      }).join('')}</tr>`);
    }

    if (opt.show.moon) {
      rows.push(`<tr><th class="rh">月相</th>${dates.map((d) => {
        const m = Astro.moon(d, opt.lat, opt.lon);
        return `<td>${Astro.moonSVG(m.phase, 30)}
          <div class="mx-sm">${m.illumination}%</div></td>`;
      }).join('')}</tr>`);
    }

    if (opt.show.tide && opt.tideDays) {
      const tByDate = new Map(opt.tideDays.map((t) => [t.date, t]));
      rows.push(`<tr><th class="rh">潮汐</th>${dates.map((d) => {
        const t = tByDate.get(d);
        if (!t) return '<td class="mx-sm">—</td>';
        const times = t.times.map((x) =>
          `<div class="mt ${x.tide === '滿潮' ? 'high' : 'low'}">${x.tide[0]} ${x.hhmm}</div>`).join('');
        return `<td><span class="range r${t.range}">${t.range}</span>${times}</td>`;
      }).join('')}</tr>`);
    }

    return `<div class="multi-scroll">
      <table class="multi">
        <thead><tr><th class="rh corner">項目</th>${head}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>`;
  }

  const uvBand = (v) => (v <= 2 ? 'lo' : v <= 5 ? 'mid' : v <= 7 ? 'hi' : v <= 10 ? 'vhi' : 'ext');

  return { render, weekday, icon };
})();
