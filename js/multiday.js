/*
 * 多日總覽（Google 天氣 App 風格）：每天一列，右側水平溫度長條在共同刻度上對齊，
 * 一眼看出冷熱趨勢；日出日落／月相／潮汐以次要行附在下方。
 * 手機不需橫捲。
 */

const MultiDay = (function () {
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

  function dayLabel(date, today) {
    if (date === today) return '今天';
    const [y, m, d] = today.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d);
    const [y2, m2, d2] = date.split('-').map(Number);
    const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - t) / 86400000);
    if (diff === 1) return '明天';
    if (diff === 2) return '後天';
    return '星期' + weekday(date);
  }

  /**
   * @param {Array} dates 要顯示的日期
   * @param {Array} wdays  CWA.weatherDays() 結果
   * @param {Object} opt {lat, lon, tideDays, show:{sun,moon,tide,weather}, today, current}
   */
  function render(dates, wdays, opt) {
    const byDate = new Map(wdays.map((g) => [g.date, g]));

    // 溫度長條的共同刻度：取所有日期的高低溫極值
    let lo = Infinity, hi = -Infinity;
    for (const g of wdays) {
      for (const p of [g.day, g.night]) {
        if (!p) continue;
        if (p.tMin !== null) lo = Math.min(lo, p.tMin);
        if (p.tMax !== null) hi = Math.max(hi, p.tMax);
      }
    }
    const hasScale = isFinite(lo) && isFinite(hi) && hi > lo;

    const rows = dates.map((date) => {
      const g = byDate.get(date);
      const dayP = g && g.day, nightP = g && g.night;
      const ref = dayP || nightP;

      // 當日高低溫：白天與晚上取聯集
      let dLo = null, dHi = null;
      for (const p of [dayP, nightP]) {
        if (!p) continue;
        if (p.tMin !== null) dLo = dLo === null ? p.tMin : Math.min(dLo, p.tMin);
        if (p.tMax !== null) dHi = dHi === null ? p.tMax : Math.max(dHi, p.tMax);
      }

      let bar = '<div class="gd-track"></div>';
      if (hasScale && dLo !== null && dHi !== null) {
        const l = ((dLo - lo) / (hi - lo)) * 100;
        const w = Math.max(6, ((dHi - dLo) / (hi - lo)) * 100);
        bar = `<div class="gd-track"><div class="gd-fill" style="left:${l}%;width:${w}%"></div></div>`;
      }

      const pop = ref && ref.pop !== null ? ref.pop : null;
      const main = `
        <div class="gd-row${date === opt.current ? ' cur' : ''}">
          <div class="gd-day">
            <div class="d1">${dayLabel(date, opt.today)}</div>
            <div class="d2">${date.slice(5).replace('-', '/')}</div>
          </div>
          <div class="gd-ico">${opt.show.weather ? icon(ref && ref.weather, !dayP) : ''}</div>
          <div class="gd-wx">
            <div class="w1">${opt.show.weather ? esc((ref && ref.weather) || '無預報') : ''}</div>
            ${pop !== null ? `<div class="w2">💧 ${pop}%</div>` : ''}
          </div>
          <div class="gd-bar">
            <span class="gd-lo">${dLo !== null ? dLo + '°' : '—'}</span>
            ${bar}
            <span class="gd-hi">${dHi !== null ? dHi + '°' : '—'}</span>
          </div>
        </div>`;

      // 次要行：日出日落／月相／潮汐
      const extra = [];
      if (opt.show.sun) {
        const s = Astro.sun(date, opt.lat, opt.lon);
        const gv = (k) => (s.rows.find((r) => r.key === k) || {}).text || '—';
        extra.push(`<span>🌅 <b class="mono">${gv('sunrise')}</b>　🌇 <b class="mono">${gv('sunset')}</b></span>`);
      }
      if (opt.show.moon) {
        const m = Astro.moon(date, opt.lat, opt.lon);
        extra.push(`<span>${Astro.moonSVG(m.phase, 14)} ${esc(m.phaseName)} ${m.illumination}%</span>`);
      }
      if (opt.show.tide && opt.tideDays) {
        const t = opt.tideDays.find((x) => x.date === date);
        if (t) {
          const times = t.times.map((x) =>
            `<span class="mono ${x.tide === '滿潮' ? 'hi2' : 'lo2'}">${x.tide[0]}${x.hhmm}</span>`).join(' ');
          extra.push(`<span>🌊 ${t.range}潮 ${times}</span>`);
        }
      }

      return main + (extra.length ? `<div class="gd-extra">${extra.join('')}</div>` : '');
    }).join('');

    return `<div class="gd-list">${rows}</div>`;
  }

  return { render, weekday, icon, dayLabel };
})();
