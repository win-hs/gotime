/*
 * 天氣預報表：欄＝日期（各再分白天／晚上），列＝項目。
 * 要出現哪些列由「顯示項目」勾選決定；風向風級固定顯示。
 */

const Forecast = (function () {
  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  function weekday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  /** 由天氣現象文字取代表圖示（避開整份 WeatherCode 對照表） */
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
  const val = (v, unit) => (v === null || v === undefined ? '—' : v + (unit || ''));

  /**
   * @param {Array} dates 顯示的日期
   * @param {Array} wdays CWA.weatherDays() 結果
   * @param {Object} opt {lat, lon, tideDays, show:{sun,moon,tide}, today, current}
   */
  function render(dates, wdays, opt) {
    const byDate = new Map(wdays.map((g) => [g.date, g]));
    const cols = [];   // [{date, part:'day'|'night', p}]
    for (const d of dates) {
      const g = byDate.get(d);
      cols.push({ date: d, part: 'day', p: g && g.day });
      cols.push({ date: d, part: 'night', p: g && g.night });
    }

    const head1 = dates.map((d) => `
      <th colspan="2" class="fc-date${d === opt.current ? ' cur' : ''}${d === opt.today ? ' today' : ''}">
        <div class="fc-d">${d.slice(5).replace('-', '/')}</div>
        <div class="fc-w">星期${weekday(d)}</div>
      </th>`).join('');
    const head2 = cols.map((c) =>
      `<th class="fc-part">${c.part === 'day' ? '白天' : '晚上'}</th>`).join('');

    const row = (label, cellFn, cls) =>
      `<tr><th class="fc-rh">${label}</th>${cols.map((c) =>
        `<td class="${cls || ''}">${cellFn(c)}</td>`).join('')}</tr>`;

    /** 每日一格（跨白天晚上），只在白天欄輸出並 colspan=2 */
    const dayRow = (label, cellFn) =>
      `<tr><th class="fc-rh">${label}</th>${dates.map((d) =>
        `<td colspan="2" class="fc-span">${cellFn(d)}</td>`).join('')}</tr>`;

    const rows = [];

    rows.push(row('天氣狀況', (c) => c.p
      ? `<div class="fc-ico">${icon(c.p.weather, c.part === 'night')}</div>
         <div class="fc-wx">${esc(c.p.weather || '—')}</div>`
      : '—'));

    rows.push(row('最高溫', (c) => c.p ? val(c.p.tMax, '°C') : '—', 'fc-hi'));
    rows.push(row('最低溫', (c) => c.p ? val(c.p.tMin, '°C') : '—', 'fc-lo'));
    rows.push(row('降雨機率', (c) => c.p && c.p.pop !== null
      ? `<span class="fc-pop">${c.p.pop}%</span>` : '—'));
    rows.push(row('體感溫度', (c) => (c.p && c.p.atMin !== null && c.p.atMax !== null)
      ? `${c.p.atMin} - ${c.p.atMax}°C` : '—', 'fc-sm'));
    rows.push(row('風向風級', (c) => c.p
      ? `<div class="fc-sm">${esc(c.p.windDir || '—')}</div>
         <div class="fc-sm">${c.p.beaufort ? c.p.beaufort + ' 級' : (c.p.wind !== null ? c.p.wind + ' 級' : '')}</div>`
      : '—'));

    if (opt.show.sun) {
      rows.push(dayRow('日出／日落', (d) => {
        const s = Astro.sun(d, opt.lat, opt.lon);
        const g = (k) => (s.rows.find((r) => r.key === k) || {}).text || '—';
        return `<span class="fc-sun">☀️ ${g('sunrise')}</span>　<span class="fc-set">🌆 ${g('sunset')}</span>`;
      }));
    }
    if (opt.show.moon) {
      rows.push(dayRow('月相', (d) => {
        const m = Astro.moon(d, opt.lat, opt.lon);
        return `${Astro.moonSVG(m.phase, 26)}<span class="fc-sm"> ${esc(m.phaseName.replace(/（.*）/, ''))} ${m.illumination}%</span>`;
      }));
    }
    if (opt.show.tide && opt.tideDays) {
      const byTide = new Map(opt.tideDays.map((t) => [t.date, t]));
      rows.push(dayRow('潮汐', (d) => {
        const t = byTide.get(d);
        if (!t) return '—';
        const times = t.times.map((x) =>
          `<span class="fc-t ${x.tide === '滿潮' ? 'high' : 'low'}">${x.tide[0]} ${x.hhmm}</span>`).join(' ');
        return `<span class="range r${t.range}">${t.range}</span> ${times}`;
      }));
    }

    return `<div class="fc-scroll"><table class="fc">
      <thead>
        <tr><th class="fc-rh fc-corner" rowspan="2">項目</th>${head1}</tr>
        <tr>${head2}</tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
  }

  return { render, weekday, icon };
})();
