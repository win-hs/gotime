/* GoTime 主程式：狀態、URL、渲染、搜尋、常用地點、調查規劃 */

const App = (function () {
  const FAV_KEY = 'gotime.favs';
  const COUNTER_URL = 'https://abacus.jasoncameron.dev/hit/gotime-awen-9/live-visits';
  const RADAR_OPACITY = 0.5;    // 固定，不提供調整
  const LINKS = {
    'lnk-qpf': 'https://www.cwa.gov.tw/V8/C/P/QPF.html',
    'lnk-radar': 'https://www.cwa.gov.tw/V8/C/W/OBS_Radar.html',
    'lnk-rain': 'https://watchapp.ncdr.nat.gov.tw/appv2',   // 落雨小幫手（NCDR）
    'lnk-ty': 'https://www.cwa.gov.tw/V8/C/P/Typhoon/Typhoon.html',
    'lnk-warn': 'https://www.cwa.gov.tw/V8/C/W/index.html',
  };

  const state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    date: Astro.todayStr(),
  };
  let tidePoint = null, town = null, tideDays = null, tideDay = null;
  let rules = [], lastWindows = [];
  let reqSeq = 0, radarInfo = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hhmm = (d) => Astro.fmtTime.format(d);
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const weekdayOf = (ds) => {
    const [y, m, d] = ds.split('-').map(Number);
    return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };

  function toast(msg, isError) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  let scrollLock = 0;

  function openOverlay(title, html) {
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = html;
    if (!$('overlay').classList.contains('show')) {
      // 鎖住背景捲動，否則在對話框內滾到底會帶動後面的頁面
      scrollLock = window.scrollY;
      document.body.style.top = `-${scrollLock}px`;
      document.body.classList.add('locked');
    }
    $('overlay').classList.add('show');
  }

  function closeOverlay() {
    if (!$('overlay').classList.contains('show')) return;
    $('overlay').classList.remove('show');
    document.body.classList.remove('locked');
    document.body.style.top = '';
    window.scrollTo(0, scrollLock);
  }

  /* ---------- 造訪次數（沿用 Field-Box 家族的 abacus 計數器） ---------- */

  async function countVisit() {
    try {
      const r = await fetch(COUNTER_URL);
      const j = await r.json();
      $('visits').textContent = String(Number(j.value)).padStart(8, '0');
    } catch (_) { $('visits').textContent = '—'; }
  }

  /* ---------- URL（可含完整設定） ---------- */

  const b64e = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (s) => new TextDecoder().decode(Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

  function readURL() {
    const q = new URLSearchParams(location.search);
    const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    const date = q.get('date');
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      state.lat = lat; state.lon = lon;
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) state.date = date;
    const s = q.get('s');
    if (s) {
      try {
        const cfg = JSON.parse(b64d(s));
        if (cfg.display) Settings.restore(cfg.display);
        if (Array.isArray(cfg.rules) && cfg.rules.length) { rules = cfg.rules; Plan.save(rules); }
      } catch (_) { /* 連結裡的設定壞掉就忽略，其餘照常 */ }
    }
  }
  const baseParams = () => new URLSearchParams({
    lat: state.lat.toFixed(5), lon: state.lon.toFixed(5), date: state.date,
  });
  const syncURL = () => history.replaceState(null, '', location.pathname + '?' + baseParams());

  function fullShareURL() {
    const q = baseParams();
    q.set('s', b64e(JSON.stringify({ display: Settings.snapshot(), rules })));
    return location.origin + location.pathname + '?' + q;
  }

  /* ---------- 日出/落 ---------- */

  function renderSun() {
    const s = Astro.sun(state.date, state.lat, state.lon);
    const shown = s.rows.filter((r) => {
      if (r.group === 'rise' || r.group === 'set') return true;
      const tw = Settings.TWILIGHTS.find((t) => t.keys.includes(r.key));
      return !tw || Settings.tw(tw.id);
    });
    const row = (r) => {
      const hl = (r.group === 'rise' || r.group === 'set') ? ` hl ${r.group}` : '';
      return `<div class="tr ${r.group}${hl}">
        <span class="lbl"><span class="em">${r.em}</span>${r.label}</span>
        <span class="val">${r.text}${r.note ? `<em>${r.note}</em>` : ''}</span>
      </div>`;
    };
    const cks = Settings.TWILIGHTS.map((t) =>
      `<label class="ck"><input type="checkbox" class="tw-ck" data-id="${t.id}"${Settings.tw(t.id) ? ' checked' : ''}> ${t.label}</label>`).join('');
    $('sun-body').innerHTML = `
      <div class="tw-row">${cks}</div>
      <div class="table">${shown.map(row).join('')}</div>
      <div class="foot daylen">日長 ${s.dayLength}</div>`;
    $('sun-body').querySelectorAll('.tw-ck').forEach((ck) => ck.addEventListener('change', () => {
      Settings.setTw(ck.dataset.id, ck.checked);
      renderSun();
    }));
  }

  /* ---------- 月相 ---------- */

  function renderMoon() {
    const m = Astro.moon(state.date, state.lat, state.lon);
    let times;
    if (m.alwaysUp) times = '<div class="tr"><span class="lbl">整日在地平線上</span><span class="val">—</span></div>';
    else if (m.alwaysDown) times = '<div class="tr"><span class="lbl">整日在地平線下</span><span class="val">—</span></div>';
    else times = `
      <div class="tr"><span class="lbl"><span class="em">🌘</span>月出</span><span class="val">${m.rise.text}${m.rise.note ? `<em>${m.rise.note}</em>` : ''}</span></div>
      <div class="tr"><span class="lbl"><span class="em">🌒</span>月落</span><span class="val">${m.set.text}${m.set.note ? `<em>${m.set.note}</em>` : ''}</span></div>`;

    $('moon-body').innerHTML = `
      <div class="moon-row">
        ${Astro.moonSVG(m.phase, 76)}
        <div class="moon-info">
          <div class="phase-name">${m.phaseName}</div>
          <div class="phase-sub">照度 ${m.illumination}%・${m.waxing ? '盈（漸圓）' : '虧（漸缺）'}</div>
        </div>
      </div>
      <div class="table">${times}</div>`;
  }

  /** 整月月相：本機計算，年月不受資料範圍限制 */
  function showMoonMonth(ym) {
    const cur = ym || state.date.slice(0, 7);
    const [y, m] = cur.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const head = WD.map((w) => `<div class="mm-head">${w}</div>`).join('');
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="mm-cell blank"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const mo = Astro.moon(date, state.lat, state.lon);
      cells += `<div class="mm-cell${date === state.date ? ' cur' : ''}">
        <div class="mm-d">${d}</div>${Astro.moonSVG(mo.phase, 34)}
        <div class="mm-i">${mo.illumination}%</div>
        <div class="mm-p">${esc(mo.phaseName.replace(/（.*）/, ''))}</div></div>`;
    }
    const thisYear = +Astro.todayStr().slice(0, 4);
    const years = [];
    for (let v = thisYear - 20; v <= thisYear + 20; v++) years.push(v);
    const yOpts = years.map((v) => `<option value="${v}"${v === y ? ' selected' : ''}>${v} 年</option>`).join('');
    const mOpts = Array.from({ length: 12 }, (_, i) => i + 1)
      .map((v) => `<option value="${v}"${v === m ? ' selected' : ''}>${v} 月</option>`).join('');

    openOverlay('月相表', `
      <div class="mon-bar">
        <button class="md-btn-out icon-only" id="mm-prev" title="上個月">◀</button>
        <select id="mm-year">${yOpts}</select>
        <select id="mm-month">${mOpts}</select>
        <button class="md-btn-out icon-only" id="mm-next" title="下個月">▶</button>
        <button class="md-btn-out" id="mm-today">回到本月</button>
        <span class="mon-note">月相為本機天文計算，任意年月皆可查詢</span>
      </div>
      <div class="rule-help">照度為當日正午（臺灣時間）之值；亮面方向依北半球視角，盈相在右、虧相在左。</div>
      <div class="moon-month">${head}${cells}</div>`);

    const go = (delta) => {
      const d = new Date(Date.UTC(y, m - 1 + delta, 1));
      showMoonMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    };
    const pick = () => showMoonMonth(`${$('mm-year').value}-${String($('mm-month').value).padStart(2, '0')}`);
    $('mm-prev').addEventListener('click', () => go(-1));
    $('mm-next').addEventListener('click', () => go(1));
    $('mm-year').addEventListener('change', pick);
    $('mm-month').addEventListener('change', pick);
    $('mm-today').addEventListener('click', () => showMoonMonth(state.date.slice(0, 7)));
  }

  const loadingHTML = '<div class="state">載入中…</div>';
  const errorHTML = (msg, id) =>
    `<div class="state err">${esc(msg)}<br><button class="md-btn-out" id="${id}" style="margin-top:10px">重試</button></div>`;

  /* ---------- 潮汐 ---------- */

  async function renderTide(seq) {
    const body = $('tide-body');
    tidePoint = Geo.nearestTide(state.lat, state.lon);
    if (Settings.on('tide')) body.innerHTML = loadingHTML;
    try {
      tideDays = await CWA.tide(tidePoint.name);
      if (seq !== reqSeq) return;
      tideDay = tideDays.find((d) => d.date === state.date) || null;
      if (!Settings.on('tide')) return;
      const first = tideDays[0].date, last = tideDays[tideDays.length - 1].date;
      const head = `<div class="src">最近潮汐點：<b>${esc(tidePoint.name)}</b>
        <span class="kind">${esc(tidePoint.kind)}</span>
        <span class="dist">距 ${tidePoint.dist.toFixed(1)} km</span></div>`;

      if (!tideDay) {
        body.innerHTML = head
          + `<div class="state">此日期無潮汐預報<br><small>預報範圍 ${first} ～ ${last}</small></div>`;
      } else {
        const rows = tideDay.times.map((t) => `
          <div class="tr ${t.tide === '滿潮' ? 'high' : 'low'}">
            <span class="lbl"><span class="em">${t.tide === '滿潮' ? '🌊' : '🏖️'}</span>${t.tide}</span>
            <span class="val">${t.hhmm}<em>${t.cm} cm</em></span></div>`).join('');
        body.innerHTML = head + `
          <div class="tide-meta">
            <span class="range r${tideDay.range}">${tideDay.range}潮</span>
            <span class="lunar">農曆 ${esc(tideDay.lunarDate.slice(5))}</span></div>
          <div class="table">${rows}</div>`;
      }
    } catch (e) {
      if (seq !== reqSeq) return;
      tideDay = null; tideDays = null;
      if (Settings.on('tide')) {
        body.innerHTML = errorHTML(e.message, 'tide-retry');
        $('tide-retry').addEventListener('click', () => { const s = ++reqSeq; renderTide(s).then(() => afterTide(s)); });
      }
    }
  }

  /** 整月潮汐：氣象署只提供未來約一個月，全部列出即可，不需選月份 */
  function showTideMonth() {
    if (!tideDays || !tideDays.length) { toast('潮汐資料尚未載入', true); return; }
    const first = tideDays[0].date, last = tideDays[tideDays.length - 1].date;
    const rows = tideDays.map((d) => {
      const cells = d.times.map((t) =>
        `<span class="t ${t.tide === '滿潮' ? 'high' : 'low'}">${t.tide[0]} ${t.hhmm}<em>${t.cm}</em></span>`).join('');
      return `<tr class="${d.date === state.date ? 'cur' : ''}">
        <td class="d">${d.date.slice(5)}<small>${esc(d.lunarDate.slice(5))}</small></td>
        <td><span class="range r${d.range}">${d.range}</span></td>
        <td class="times">${cells}</td></tr>`;
    }).join('');
    openOverlay(`潮汐表　${tidePoint.name}`, `
      <div class="mon-bar">
        <span class="mon-note">氣象署潮汐預報涵蓋 ${first} ～ ${last}（共 ${tideDays.length} 天），以下為全部資料</span>
      </div>
      <table class="tide-month">
        <thead><tr><th>日期</th><th>潮差</th><th>滿(高)／乾(低)潮時刻與潮高 cm</th></tr></thead>
        <tbody>${rows}</tbody></table>`);
  }

  /* ---------- 今天天氣（溫度曲線） ---------- */

  async function renderHourly(seq) {
    const body = $('hourly-body');
    body.innerHTML = loadingHTML;
    try {
      const sr = await CWA.series(town, state.date, Settings.days());
      if (seq !== reqSeq) return;
      body.innerHTML = `
        <div class="src">預報鄉鎮：<b>${esc(town.county)}${esc(town.name)}</b>
          <span class="dist">距 ${town.dist.toFixed(1)} km</span>
          <span class="kind">${sr.hourly ? '逐 3 小時' : '逐日高低溫'}</span></div>`
        + Hourly.render(sr);
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'hourly-retry');
      $('hourly-retry').addEventListener('click', () => { const s = ++reqSeq; renderHourly(s); });
    }
  }

  /* ---------- 天氣預報表 ---------- */

  async function renderForecast(seq) {
    const body = $('multi-body');
    body.innerHTML = loadingHTML;
    const days = Settings.days();
    const dates = [];
    for (let i = 0; i < days; i++) dates.push(Astro.shiftDate(state.date, i));
    try {
      const wdays = await CWA.weatherDays(town, state.date, days);
      if (seq !== reqSeq) return;
      const missing = wdays.length < days;
      body.innerHTML = Forecast.render(dates, wdays, {
        lat: state.lat, lon: state.lon, tideDays,
        show: { sun: Settings.on('sun'), moon: Settings.on('moon'), tide: Settings.on('tide') },
        today: Astro.todayStr(), current: state.date,
      }) + (missing ? '<div class="mx-note">天氣預報僅涵蓋約一週，超出範圍的日期留白；日月與潮汐仍可顯示。</div>' : '');
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'multi-retry');
      $('multi-retry').addEventListener('click', () => { const s = ++reqSeq; renderForecast(s); });
    }
  }

  /* ---------- 雷達回波 ---------- */

  async function toggleRadar() {
    const btn = $('radar-btn');
    if (Settings.radar()) {
      Settings.setRadar(false);
      GMap.clearRadar(); Radar.dispose(); radarInfo = null;
      btn.classList.remove('on'); btn.textContent = '雷達回波開啟';
      return;
    }
    btn.disabled = true; btn.textContent = '載入回波圖…';
    try {
      const m = await Radar.meta();
      radarInfo = await Radar.buildOverlay(m);
      GMap.setRadar(radarInfo.url, radarInfo.bounds, RADAR_OPACITY);
      Settings.setRadar(true);
      btn.classList.add('on'); btn.textContent = `雷達回波 ${radarInfo.time.slice(11, 16)}`;
      toast('回波圖 ' + radarInfo.time.slice(11, 16) + ' 已疊上地圖（透明度 50%）');
    } catch (e) {
      toast(e.message || '雷達回波載入失敗', true);
      btn.textContent = '雷達回波開啟';
    } finally { btn.disabled = false; }
  }

  /* ---------- 警特報與颱風 ---------- */

  let shownCyclone = null;

  const fmtDT = (s) => String(s || '').replace('T', ' ').slice(0, 16);

  async function renderAlerts(seq) {
    const card = $('card-alert'), banner = $('alert-banner'), body = $('alert-body');
    let warnings = [], hazards = [], relevant = [];
    try {
      const [w, h, cy] = await Promise.all([
        Alerts.typhoonWarning().catch(() => []),
        town ? Alerts.countyHazards(town.county).catch(() => []) : Promise.resolve([]),
        Alerts.cyclones(state.lat, state.lon).catch(() => []),
      ]);
      if (seq !== reqSeq) return;
      warnings = w; hazards = h;
      relevant = cy.filter((c) => Alerts.isRelevant(c));
    } catch (_) {
      if (seq !== reqSeq) return;
    }

    // 沒有任何值得示警的事就整個收起來，平常畫面不受干擾
    if (!warnings.length && !hazards.length && !relevant.length) {
      card.hidden = true; banner.hidden = true;
      GMap.clearTyphoon(); shownCyclone = null;
      return;
    }

    // ---- 紅色橫幅 ----
    const bits = [];
    for (const w of warnings) bits.push(`<b>${esc(w.headline || w.event)}</b>`);
    for (const h of hazards) bits.push(`${esc(town.county)}${esc(h.phenomena)}${esc(h.significance)}`);
    for (const c of relevant) {
      bits.push(c.hit
        ? `<b>${esc(c.grade)}${esc(c.name)}</b> 暴風圈${c.hit.hour ? ` ${c.hit.hour} 小時後` : '目前'}可能影響此地`
        : `<b>${esc(c.grade)}${esc(c.name)}</b> 預報最近 ${Math.round(c.nearest.dist)} km（${c.nearest.hour} 小時後）`);
    }
    $('alert-banner-text').innerHTML = bits.join('　｜　');
    banner.hidden = false;

    // ---- 卡片 ----
    const parts = [];

    if (warnings.length) {
      parts.push(warnings.map((w) => `
        <div class="al-block warn">
          <div class="al-h">${esc(w.headline || w.event)}
            <span class="al-time">${fmtDT(w.effective)} 發布</span></div>
          ${w.sections.map((s) => `<div class="al-sec"><b>${esc(s.title)}</b>${esc(s.value)}</div>`).join('')}
        </div>`).join(''));
    }

    if (hazards.length) {
      parts.push(`<div class="al-block hazard">
        <div class="al-h">${esc(town.county)} 生效中特報</div>
        ${hazards.map((h) => `<div class="al-haz">
          <span class="al-tag">${esc(h.phenomena)}${esc(h.significance)}</span>
          <span class="al-time">${fmtDT(h.start)} ～ ${fmtDT(h.end)}</span></div>`).join('')}
      </div>`);
    }

    for (const c of relevant) {
      const n = c.now;
      const rows = c.forecast.map((f) => `
        <tr><td class="ty-h">${f.hour}h</td>
          <td>${f.lat}N ${f.lon}E</td>
          <td>${f.wind !== null ? f.wind + ' m/s' : '—'}</td>
          <td>${f.pressure !== null ? f.pressure : '—'}</td>
          <td>${f.r15 !== null ? f.r15 + ' km' : '—'}</td>
          <td class="ty-r70">${f.r70 !== null ? '±' + f.r70 + ' km' : '—'}</td>
          <td class="ty-d">${Math.round(Geo.distance(state.lat, state.lon, f.lat, f.lon))} km</td>
        </tr>`).join('');

      parts.push(`<div class="al-block typhoon">
        <div class="al-h">${esc(c.grade)}　${esc(c.name)}
          <span class="al-sub">${esc(c.intlName)}${c.no ? '・第 ' + esc(c.no) + ' 號' : ''}</span>
          <button class="md-chip ty-focus" data-name="${esc(c.name)}">在地圖上顯示</button></div>
        <div class="ty-now">
          <span>中心 ${n.lat}N ${n.lon}E</span>
          <span>氣壓 ${n.pressure !== null ? n.pressure + ' hPa' : '—'}</span>
          <span>近中心最大風速 ${n.wind !== null ? n.wind + ' m/s' : '—'}</span>
          <span>陣風 ${n.gust !== null ? n.gust + ' m/s' : '—'}</span>
          <span>七級風半徑 ${n.r15 !== null ? n.r15 + ' km' : '—'}</span>
          <span>十級風半徑 ${n.r25 !== null ? n.r25 + ' km' : '—'}</span>
        </div>
        ${n.movePred ? `<div class="ty-move">${esc(n.movePred)}</div>` : ''}
        <div class="ty-impact${c.hit ? ' hit' : ''}">
          ${c.hit
            ? `⚠ 七級風暴風圈${c.hit.hour ? ` 約 ${c.hit.hour} 小時後` : '目前'}可能涵蓋此地點（中心距 ${Math.round(c.hit.dist)} km、半徑 ${c.hit.r15} km）`
            : `目前距此地點 ${Math.round(c.nowDist)} km；預報最近 ${Math.round(c.nearest.dist)} km，發生在 ${c.nearest.hour} 小時後`}
        </div>
        <div class="ty-scroll"><table class="ty-tab">
          <thead><tr><th>時距</th><th>中心位置</th><th>風速</th><th>氣壓 hPa</th>
            <th>七級風半徑</th><th>70% 機率半徑</th><th>距此地</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`);
    }

    parts.push(`<div class="al-note">
      路徑與暴風圈為預報值，時間越遠誤差越大；「70% 機率半徑」表示中心有 70% 機率落在該範圍內，
      中心線只是最可能位置。實際請以中央氣象署發布為準。</div>`);

    body.innerHTML = parts.join('');
    card.hidden = false;

    // 地圖上畫最接近的那個颱風
    const first = relevant[0] || null;
    if (first) { GMap.setTyphoon(first); shownCyclone = first; }
    else { GMap.clearTyphoon(); shownCyclone = null; }

    body.querySelectorAll('.ty-focus').forEach((b) => b.addEventListener('click', () => {
      const c = relevant.find((x) => x.name === b.dataset.name);
      if (!c) return;
      GMap.setTyphoon(c); shownCyclone = c; GMap.fitTyphoon(c);
      document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  /* ---------- 即時觀測 ---------- */

  async function renderObs(seq) {
    if (!Settings.on('obs')) return;
    const body = $('obs-body');
    body.innerHTML = loadingHTML;
    try {
      const st = await Observe.nearest(state.lat, state.lon, 3);
      if (seq !== reqSeq) return;
      if (!st.length) {
        GMap.clearStation();
        body.innerHTML = '<div class="state">查無鄰近測站</div>'; return;
      }

      const v = (x, u) => (x === null ? '—' : x + (u || ''));
      const main = st[0];
      GMap.setStation(main);   // 地圖上以紅點標出最近測站
      const item = (lbl, val) => `<div class="ob-item"><span class="ob-l">${lbl}</span><span class="ob-v">${val}</span></div>`;
      const others = st.slice(1).map((s) => `
        <div class="ob-row">
          <div class="ob-name">${esc(s.name)}<small>${esc(s.town)}・${s.dist.toFixed(1)} km${s.alt !== null ? '・' + Math.round(s.alt) + ' m' : ''}</small></div>
          <div class="ob-mini">
            <span>${esc(s.weather || '—')}</span>
            <span class="ob-t">${v(s.temp, '°')}</span>
            <span>濕 ${v(s.humid, '%')}</span>
            <span>雨 ${v(s.rain, ' mm')}</span>
            <span>${s.dir || '—'} ${v(s.beaufort, ' 級')}</span>
          </div></div>`).join('');

      body.innerHTML = `
        <div class="src">最近測站：<b>${esc(main.name)}</b>
          <span class="kind">${esc(main.county)}${esc(main.town)}</span>
          <span class="dist">距 ${main.dist.toFixed(1)} km</span>
          ${main.alt !== null ? `<span class="dist">海拔 ${Math.round(main.alt)} m</span>` : ''}
          <span class="dist">觀測 ${main.time.slice(11, 16)}</span></div>
        <div class="ob-main">
          <div class="ob-temp">${v(main.temp, '')}<span class="ob-unit">°C</span>
            <div class="ob-wx">${Forecast.icon(main.weather, false)} ${esc(main.weather || '—')}</div></div>
          <div class="ob-grid">
            ${item('相對濕度', v(main.humid, ' %'))}
            ${item('本時段雨量', v(main.rain, ' mm'))}
            ${item('風', `${main.dir || '—'} ${v(main.wind, ' m/s')}${main.beaufort !== null ? `（${main.beaufort} 級）` : ''}`)}
            ${item('最大陣風', v(main.gust, ' m/s'))}
            ${item('今日最高', v(main.tHigh, ' °C'))}
            ${item('今日最低', v(main.tLow, ' °C'))}
          </div>
        </div>
        ${others ? `<div class="ob-others"><div class="ob-others-h">其他鄰近測站</div>${others}</div>` : ''}`;
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'obs-retry');
      $('obs-retry').addEventListener('click', () => { const s = ++reqSeq; renderObs(s); });
    }
  }

  /* ---------- 調查規劃 ---------- */

  function planContext() {
    return {
      date: state.date, lat: state.lat, lon: state.lon,
      sun: Astro.sun(state.date, state.lat, state.lon),
      moon: Astro.moon(state.date, state.lat, state.lon),
      tideDay,
    };
  }

  /** 算出目前日期的所有時段（同時填入 lastWindows 供匯出） */
  function computeWindows() {
    const ctx = planContext();
    lastWindows = [];
    return rules.map((rule) => {
      const { windows, reason } = Plan.apply(rule, ctx);
      const items = windows.map((w) => {
        const idx = lastWindows.length;
        lastWindows.push({ rule, start: w.start, end: w.end });
        return { idx, start: w.start, end: w.end };
      });
      return { rule, items, reason };
    });
  }

  const durText = (a, b) => {
    const mins = Math.round((b - a) / 60000);
    return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
  };

  /** 右上面板的摘要 */
  function renderPlanSummary() {
    const blocks = computeWindows().map(({ rule, items, reason }) => {
      if (!items.length) {
        return `<div class="ps-rule"><span class="ps-name">${esc(rule.name)}</span>
          <span class="ps-def">${esc(Plan.ruleText(rule))}</span>
          <div class="ps-none err">⚠ ${esc(reason || '無可用時段')}</div></div>`;
      }
      const lines = items.map((w) => {
        const cross = Astro.fmtDate.format(w.end) !== Astro.fmtDate.format(w.start);
        return `<div><span class="ps-time">${hhmm(w.start)} – ${hhmm(w.end)}</span>${cross ? '<span class="ps-dur">翌日</span>' : ''}
          <span class="ps-dur">${durText(w.start, w.end)}</span></div>`;
      }).join('');
      return `<div class="ps-rule"><span class="ps-name">${esc(rule.name)}</span>
        <span class="ps-def">${esc(Plan.ruleText(rule))}</span>${lines}
        ${reason ? `<div class="ps-warn">${esc(reason)}</div>` : ''}</div>`;
    }).join('');
    $('plan-summary').innerHTML =
      `<div class="ps-title">${state.date.replace(/-/g, '/')}〈週${weekdayOf(state.date)}〉開工吉時：</div>${blocks}`;
  }

  /* ---------- 規則編輯器 ---------- */

  function resultHTML() {
    const ctx = planContext();
    const place = town ? town.county + town.name : `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
    const sunRow = (k) => (ctx.sun.rows.find((r) => r.key === k) || {}).text || '—';
    const tideTxt = ctx.tideDay
      ? ctx.tideDay.times.map((t) => `${t.tide} ${t.hhmm}(${t.cm}cm)`).join('、') : '無潮汐資料';
    const desc = [
      `日出 ${sunRow('sunrise')}　日落 ${sunRow('sunset')}`,
      `月相 ${ctx.moon.phaseName}（照度 ${ctx.moon.illumination}%）`,
      `潮汐（${tidePoint ? tidePoint.name : '—'}）：${tideTxt}`,
      `座標 ${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}`,
      '— 由 GoTime 開工吉時產生',
    ].join('\n');

    const blocks = computeWindows().map(({ rule, items, reason }) => {
      if (!items.length) {
        return `<div class="plan-rule"><div class="plan-head"><b>${esc(rule.name)}</b>
          <span class="plan-def">${esc(Plan.ruleText(rule))}</span></div>
          <div class="plan-none err">⚠ ${esc(reason || '無可用時段')}</div></div>`;
      }
      const lines = items.map((w) => {
        const cross = Astro.fmtDate.format(w.end) !== Astro.fmtDate.format(w.start);
        const url = Plan.gcalURL(
          { title: `${rule.name}　${place}`, start: w.start, end: w.end, desc },
          { lat: state.lat, lon: state.lon, place });
        return `<div class="plan-win">
          <span class="win-time">${hhmm(w.start)} – ${hhmm(w.end)}${cross ? '<em>翌日</em>' : ''}</span>
          <span class="win-dur">${durText(w.start, w.end)}</span>
          <span style="flex:1"></span>
          <a class="md-btn-out gcal" href="${esc(url)}" target="_blank" rel="noopener">加入 Google 日曆</a>
        </div>`;
      }).join('');
      return `<div class="plan-rule"><div class="plan-head"><b>${esc(rule.name)}</b>
        <span class="plan-def">${esc(Plan.ruleText(rule))}</span></div>${lines}
        ${reason ? `<div class="plan-none err">⚠ ${esc(reason)}</div>` : ''}</div>`;
    }).join('');

    return `<div class="src">${state.date.replace(/-/g, '/')}〈週${weekdayOf(state.date)}〉${esc(place)} 的開工時間</div>
      <div id="plan-result">${blocks}</div>`;
  }

  /** 正負號改用下拉，數字欄只填絕對值 */
  function sideEditor(side, r) {
    const opts = Plan.ANCHORS.map((a) =>
      `<option value="${a.id}"${a.id === r.anchor ? ' selected' : ''}>${a.label}</option>`).join('');
    const timeInput = Plan.isFixed(r.anchor)
      ? `<input type="time" class="r-${side}t" value="${esc(r.time || '06:00')}">` : '';
    const neg = r.offset < 0;
    return `<select class="r-${side}a">${opts}</select>${timeInput}
      <select class="r-${side}s sign-in">
        <option value="1"${neg ? '' : ' selected'}>＋</option>
        <option value="-1"${neg ? ' selected' : ''}>－</option>
      </select>
      <input type="number" min="0" step="5" class="r-${side}o off-in" value="${Math.abs(r.offset)}"><span>分</span>`;
  }

  function showRuleEditor() {
    const rows = rules.map((r, i) => `
      <div class="rule-row" data-i="${i}">
        <input type="text" class="r-name" value="${esc(r.name)}" placeholder="規則名稱">
        <div class="r-line"><span>起</span>${sideEditor('s', r.start)}</div>
        <div class="r-line"><span>訖</span>${sideEditor('e', r.end)}</div>
        <button class="r-del" data-i="${i}" title="刪除">✕</button>
      </div>`).join('');

    openOverlay('調查規劃', `
      <h4 class="ov-h">開工時間</h4>
      <div id="result-area">${resultHTML()}</div>

      <h4 class="ov-h">規則設定</h4>
      <div class="rule-help">
        錨點選「指定時刻」可直接設定幾點到幾點，仍可再 ± 分鐘微調；其餘錨點以分鐘偏移，負數代表提前。
        起訖選同一個潮汐錨點時，會依當日各潮次分別產生時段。
        ${Plan.storageOK() ? '' : '<br><b>目前無法使用瀏覽器儲存（隱私模式？），修改不會保留。</b>'}
      </div>
      <div class="preset-row">
        <button type="button" class="md-btn-out fav-toggle" id="set-toggle">
          <span>規劃方案</span><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </button>
        <button class="md-btn-out" id="set-add">★ 存成方案</button>
      </div>
      <div class="preset-menu" id="set-menu"></div>
      <div id="rule-list">${rows}</div>
      <div class="rule-foot">
        <button class="md-btn-out" id="rule-add">新增規則</button><span style="flex:1"></span>
        <button class="md-btn-out" id="rule-reset">回復預設</button>
        <button class="md-btn-fill" id="rule-save">計算開工時間</button>
      </div>`);
    bindRuleEditor();
  }

  function bindRuleEditor() {
    const box = $('overlay-body');
    box.querySelectorAll('.r-sa, .r-ea').forEach((sel) => {
      sel.addEventListener('change', () => { collectRules(); refreshRuleRows(); });
    });
    box.querySelectorAll('.r-del').forEach((b) => b.addEventListener('click', () => {
      collectRules(); rules.splice(+b.dataset.i, 1); refreshRuleRows();
    }));
    $('rule-add').addEventListener('click', () => {
      collectRules();
      rules.push({ id: 'r' + Date.now(), name: '新規則',
        start: { anchor: 'sunrise', offset: 0 }, end: { anchor: 'sunset', offset: 0 } });
      refreshRuleRows();
    });
    $('rule-reset').addEventListener('click', () => {
      rules = Plan.clone(Plan.DEFAULTS); refreshRuleRows(); recalc();
    });
    $('rule-save').addEventListener('click', () => {
      collectRules();
      if (!rules.length) rules = Plan.clone(Plan.DEFAULTS);
      Plan.save(rules);
      recalc();
      toast('已重新計算開工時間');
    });
    $('set-toggle').addEventListener('click', (e) => {
      e.stopPropagation(); $('set-menu').classList.toggle('show');
    });
    $('set-add').addEventListener('click', saveRuleSet);
    renderRuleSets();
  }

  /** 只重繪規則列與方案（不動結果區），保留覆蓋層開著 */
  function refreshRuleRows() {
    const rows = rules.map((r, i) => `
      <div class="rule-row" data-i="${i}">
        <input type="text" class="r-name" value="${esc(r.name)}" placeholder="規則名稱">
        <div class="r-line"><span>起</span>${sideEditor('s', r.start)}</div>
        <div class="r-line"><span>訖</span>${sideEditor('e', r.end)}</div>
        <button class="r-del" data-i="${i}" title="刪除">✕</button>
      </div>`).join('');
    $('rule-list').innerHTML = rows;
    const box = $('overlay-body');
    box.querySelectorAll('.r-sa, .r-ea').forEach((sel) => {
      sel.addEventListener('change', () => { collectRules(); refreshRuleRows(); });
    });
    box.querySelectorAll('.r-del').forEach((b) => b.addEventListener('click', () => {
      collectRules(); rules.splice(+b.dataset.i, 1); refreshRuleRows();
    }));
  }

  /** 重新計算並就地更新「開工時間」與右上摘要（不關閉畫面） */
  function recalc() {
    const area = $('result-area');
    if (area) area.innerHTML = resultHTML();
    renderPlanSummary();
  }

  function collectRules() {
    const out = [];
    document.querySelectorAll('.rule-row').forEach((row, i) => {
      const q = (c) => row.querySelector(c);
      const side = (a, t, o, sg) => {
        const anchor = q(a).value;
        const mag = Math.abs(parseInt(q(o) ? q(o).value : '0', 10) || 0);
        const sign = q(sg) && q(sg).value === '-1' ? -1 : 1;
        const s = { anchor, offset: mag * sign };
        if (Plan.isFixed(anchor)) s.time = (q(t) && q(t).value) || '06:00';
        return s;
      };
      out.push({
        id: rules[i] ? rules[i].id : 'r' + Date.now() + i,
        name: q('.r-name').value.trim() || '未命名規則',
        start: side('.r-sa', '.r-st', '.r-so', '.r-ss'),
        end: side('.r-ea', '.r-et', '.r-eo', '.r-es'),
      });
    });
    rules = out;
  }

  /* ---------- 規劃方案（整組規則的最愛） ---------- */

  function renderRuleSets() {
    const sets = Plan.loadSets();
    const menu = $('set-menu');
    if (!menu) return;
    menu.innerHTML = sets.length
      ? sets.map((s, i) => `
        <div class="fav-item">
          <button type="button" class="fav-pick" data-i="${i}">${esc(s.name)}<small>${s.rules.length} 條規則</small></button>
          <button type="button" class="fav-x" data-i="${i}" title="刪除">✕</button>
        </div>`).join('')
      : '<div class="fav-empty">尚無方案，按「★ 存成方案」把目前這組規則存起來。</div>';

    menu.querySelectorAll('.fav-pick').forEach((b) => b.addEventListener('click', () => {
      const s = Plan.loadSets()[+b.dataset.i];
      menu.classList.remove('show');
      if (!s) return;
      rules = Plan.clone(s.rules);
      Plan.save(rules);
      refreshRuleRows(); recalc();
      toast(`已套用方案「${s.name}」`);
    }));
    menu.querySelectorAll('.fav-x').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = Plan.loadSets();
      const [rm] = list.splice(+b.dataset.i, 1);
      Plan.saveSets(list); renderRuleSets();
      toast(`已刪除方案「${rm.name}」`);
    }));
  }

  /**
   * 就地輸入名稱的小浮層。
   * 不用 window.prompt——部分瀏覽器（尤其對話框內或已封鎖彈出視窗時）會直接無視它，
   * 導致「★ 存成方案」按了沒反應。
   */
  function askName(hostEl, defVal, onOk) {
    document.querySelectorAll('.name-pop').forEach((e) => e.remove());
    const pop = document.createElement('div');
    pop.className = 'name-pop';
    pop.innerHTML = `<input type="text" class="np-in" value="${esc(defVal)}" maxlength="30">
      <button type="button" class="md-btn-fill np-ok">確定</button>
      <button type="button" class="md-btn-out np-cancel">取消</button>`;
    const host = hostEl.closest('.preset-row') || hostEl.closest('.loc-row') || hostEl.parentNode;
    host.parentNode.insertBefore(pop, host.nextSibling);
    const input = pop.querySelector('.np-in');
    input.focus(); input.select();
    const close = () => pop.remove();
    const ok = () => { const v = input.value.trim(); close(); onOk(v || defVal); };
    pop.querySelector('.np-ok').addEventListener('click', ok);
    pop.querySelector('.np-cancel').addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); ok(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  }

  function saveRuleSet() {
    collectRules();
    askName($('set-add'), '我的調查方案', (name) => {
      const list = Plan.loadSets();
      list.push({ name, rules: Plan.clone(rules) });
      if (!Plan.saveSets(list)) { toast('無法寫入瀏覽器儲存', true); return; }
      renderRuleSets();
      toast(`已存成方案「${name}」`);
    });
  }

  /* ---------- 分享 ---------- */

  /** 給 Share 模組的統一資料包 */
  function shareData() {
    const ctx = planContext();
    const sunRow = (k) => (ctx.sun.rows.find((r) => r.key === k) || {}).text || '—';
    return {
      date: state.date, weekday: weekdayOf(state.date),
      place: town ? town.county + town.name : `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`,
      lat: state.lat, lon: state.lon,
      blocks: computeWindows(),
      sunrise: sunRow('sunrise'), sunset: sunRow('sunset'),
      moonName: ctx.moon.phaseName, moonIllum: ctx.moon.illumination,
      tide: ctx.tideDay, tideName: tidePoint ? tidePoint.name : '—',
      hhmm, dur: durText,
    };
  }

  function exportICS() {
    const d = shareData();
    const events = [];
    for (const b of d.blocks) {
      for (const w of b.items) {
        events.push({
          title: `${b.rule.name}　${d.place}`, start: w.start, end: w.end,
          desc: [`日出 ${d.sunrise}　日落 ${d.sunset}`,
            `月相 ${d.moonName}（照度 ${d.moonIllum}%）`,
            `座標 ${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`,
            '— 由 GoTime 開工吉時產生'].join('\n'),
        });
      }
    }
    if (!events.length) { toast('目前沒有可匯出的時段', true); return; }
    Share.downloadText(Share.buildICS(events, { lat: d.lat, lon: d.lon, place: d.place }),
      `gotime-${state.date}-${d.place}.ics`);
    toast(`已匯出 ${events.length} 個時段，到 Google 日曆「設定 → 匯入」即可一次加入`);
  }

  async function copyText(txt, okMsg) {
    try { await navigator.clipboard.writeText(txt); toast(okMsg); }
    catch (_) {
      openOverlay('複製內容', `<div class="rule-help">瀏覽器不允許自動複製，請手動選取複製：</div>
        <textarea class="share-box" rows="14" readonly>${esc(txt)}</textarea>`);
      const ta = document.querySelector('.share-box');
      if (ta) { ta.focus(); ta.select(); }
    }
  }

  /* ---------- 常用地點 ---------- */

  const loadFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (_) { return []; } };
  const saveFavs = (f) => { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); return true; } catch (_) { return false; } };

  function renderFavs() {
    const favs = loadFavs();
    const menu = $('fav-menu');
    menu.innerHTML = favs.length
      ? favs.map((f, i) => `
        <div class="fav-item">
          <button type="button" class="fav-pick" data-i="${i}">${esc(f.name)}</button>
          <button type="button" class="fav-x" data-i="${i}" title="刪除">✕</button>
        </div>`).join('')
      : '<div class="fav-empty">尚無常用地點，按「★ 加入」把目前位置存起來。</div>';

    menu.querySelectorAll('.fav-pick').forEach((b) => b.addEventListener('click', () => {
      const f = loadFavs()[+b.dataset.i];
      menu.classList.remove('show');
      if (f) { $('fav-current').textContent = f.name; setLocation(f.lat, f.lon, true); }
    }));
    menu.querySelectorAll('.fav-x').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = loadFavs();
      const [removed] = list.splice(+b.dataset.i, 1);
      saveFavs(list); renderFavs();
      if ($('fav-current').textContent === removed.name) $('fav-current').textContent = '常用地點';
      toast(`已刪除「${removed.name}」`);
    }));
  }

  function addFav() {
    const suggested = town ? town.county + town.name : `${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`;
    askName($('fav-add'), suggested, (name) => {
      const favs = loadFavs();
      favs.push({ name, lat: state.lat, lon: state.lon });
      if (!saveFavs(favs)) { toast('無法寫入瀏覽器儲存', true); return; }
      renderFavs();
      $('fav-current').textContent = name;
      toast(`已加入常用「${name}」`);
    });
  }

  /* ---------- 搜尋 ---------- */

  let sugItems = [], sugActive = -1;

  function showSuggest(items, note) {
    sugItems = items; sugActive = -1;
    const box = $('suggest');
    if (!items.length && !note) { hideSuggest(); return; }
    box.innerHTML = (note ? `<div class="sug-note">${esc(note)}</div>` : '')
      + items.map((it, i) => `<div class="sug-item" role="option" data-i="${i}">
          <span class="sug-label">${esc(it.label)}</span>
          <span class="sug-sub">${esc(it.sub || '')}</span></div>`).join('');
    box.classList.add('show');
    $('coord-input').setAttribute('aria-expanded', 'true');
    box.querySelectorAll('.sug-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => { e.preventDefault(); pickSuggest(+el.dataset.i); });
    });
  }

  function hideSuggest() {
    $('suggest').classList.remove('show');
    $('coord-input').setAttribute('aria-expanded', 'false');
    sugItems = []; sugActive = -1;
  }

  function pickSuggest(i) {
    const it = sugItems[i];
    if (!it) return;
    $('coord-input').value = '';
    hideSuggest();
    setLocation(it.lat, it.lon, true);
    toast(`已移至 ${it.label}${it.sub ? '（' + it.sub + '）' : ''}`);
  }

  function moveSuggest(delta) {
    if (!sugItems.length) return;
    sugActive = (sugActive + delta + sugItems.length) % sugItems.length;
    $('suggest').querySelectorAll('.sug-item').forEach((el, i) => el.classList.toggle('on', i === sugActive));
  }

  const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

  async function submitSearch() {
    const q = $('coord-input').value.trim();
    if (!q) return;
    if (sugActive >= 0) { pickSuggest(sugActive); return; }
    const m = q.match(COORD_RE);
    if (m) {
      const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast('座標超出範圍', true); return; }
      hideSuggest(); $('coord-input').value = '';
      setLocation(lat, lon, true);
      return;
    }
    const local = Geo.suggest(q, 5);
    if (local.length && local[0].label === q) { sugItems = local; pickSuggest(0); return; }
    showSuggest([], '搜尋中…');
    try {
      const res = await Geo.search(q, 5);
      if (!res.length) {
        showSuggest(local, local.length ? `找不到「${q}」，以下為相近地名` : '查無此地名，可改用點地圖或輸入座標');
        return;
      }
      showSuggest(res);
    } catch (_) {
      showSuggest(local, '地名搜尋服務連線失敗' + (local.length ? '，以下為本機相近地名' : ''));
    }
  }

  /* ---------- 總渲染 ---------- */

  function applyCardVisibility() {
    for (const c of Settings.CARDS) {
      const el = $('card-' + c.id);
      if (el) el.hidden = !Settings.on(c.id);
    }
    if (!Settings.on('obs')) GMap.clearStation();
    document.querySelectorAll('.card-ck').forEach((ck) => {
      const locked = (Settings.CARDS.find((c) => c.id === ck.dataset.id) || {}).locked;
      ck.checked = Settings.on(ck.dataset.id);
      ck.disabled = !!locked;
      ck.closest('.ck').classList.toggle('locked', !!locked);
    });
  }

  function afterTide(seq) {
    if (seq !== reqSeq) return;
    renderPlanSummary();
    renderForecast(seq);
  }

  function renderAll() {
    town = Geo.nearestTown(state.lat, state.lon);
    $('coord-label').innerHTML = (town ? `<b>${esc(town.county)}${esc(town.name)}</b>　` : '')
      + `<span class="co">${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}</span>`;
    $('date-input').value = state.date;
    if (Settings.on('sun')) renderSun();
    if (Settings.on('moon')) renderMoon();
    renderPlanSummary();
    const seq = ++reqSeq;
    renderTide(seq).then(() => afterTide(seq));
    renderHourly(seq);
    renderObs(seq);
    renderAlerts(seq);
    syncURL();
  }

  function setLocation(lat, lon, panMap) {
    state.lat = lat; state.lon = lon;
    GMap.setMarker(lat, lon, panMap);
    renderAll();
  }
  const setDate = (d) => { state.date = d; renderAll(); };

  /** 面板與天氣預報卡各有一組 3天／1週切換，兩邊同步 */
  function renderRangeSeg() {
    const html = Settings.RANGES.map((r) =>
      `<button class="seg-btn${Settings.days() === r.id ? ' on' : ''}" data-d="${r.id}">${r.label}</button>`).join('');
    for (const id of ['range-seg', 'range-seg2', 'range-seg3']) {
      const box = $(id);
      if (!box) continue;
      box.innerHTML = html;
      box.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
        Settings.setDays(+b.dataset.d);
        renderRangeSeg();
        const s = ++reqSeq; renderForecast(s); renderHourly(s);
      }));
    }
  }

  /* ---------- 事件 ---------- */

  function bind() {
    $('date-input').addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
    $('prev-day').addEventListener('click', () => setDate(Astro.shiftDate(state.date, -1)));
    $('next-day').addEventListener('click', () => setDate(Astro.shiftDate(state.date, 1)));
    $('today-btn').addEventListener('click', () => setDate(Astro.todayStr()));

    const input = $('coord-input');
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q || COORD_RE.test(q)) { hideSuggest(); return; }
      showSuggest(Geo.suggest(q, 5));
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(-1); }
      else if (e.key === 'Escape') hideSuggest();
    });
    input.addEventListener('blur', () => setTimeout(hideSuggest, 120));
    $('coord-form').addEventListener('submit', (e) => { e.preventDefault(); submitSearch(); });

    $('locate-btn').addEventListener('click', () => {
      if (!navigator.geolocation) { toast('此瀏覽器不支援定位', true); return; }
      $('locate-btn').disabled = true;
      navigator.geolocation.getCurrentPosition(
        (p) => {
          $('locate-btn').disabled = false;
          const [[s, w], [n, e]] = CONFIG.BOUNDS;
          if (p.coords.latitude < s || p.coords.latitude > n
            || p.coords.longitude < w || p.coords.longitude > e) {
            toast('目前位置不在臺灣範圍內，請改用點地圖或搜尋', true); return;
          }
          setLocation(p.coords.latitude, p.coords.longitude, true);
          toast('已定位至目前位置');
        },
        () => { $('locate-btn').disabled = false; toast('定位失敗，請改用點地圖或輸入座標', true); },
        { timeout: 10000 }
      );
    });

    $('fav-toggle').addEventListener('click', (e) => { e.stopPropagation(); $('fav-menu').classList.toggle('show'); });
    $('fav-add').addEventListener('click', addFav);
    $('share-btn').addEventListener('click', (e) => { e.stopPropagation(); $('share-menu').classList.toggle('show'); });
    document.addEventListener('click', (e) => {
      if (!$('fav-menu').contains(e.target)) $('fav-menu').classList.remove('show');
      if (!$('share-menu').contains(e.target)) $('share-menu').classList.remove('show');
      const sm = $('set-menu');
      if (sm && !sm.contains(e.target)) sm.classList.remove('show');
    });
    $('share-menu').querySelectorAll('.share-item').forEach((b) => b.addEventListener('click', () => {
      $('share-menu').classList.remove('show');
      const m = b.dataset.m;
      if (m === 'text') copyText(Share.buildText(shareData()), '純文字已複製，可直接貼上');
      else if (m === 'link') copyText(fullShareURL(), '連結已複製（含所有設定）');
      else if (m === 'ics') exportICS();
      else if (m === 'image') {
        const d = shareData();
        Share.copyCanvas(Share.buildImage(d), `gotime-${state.date}-${d.place}.png`)
          .then((r) => toast(r === 'copied'
            ? '分享圖已複製，可直接貼到對話框'
            : '此瀏覽器不支援複製圖片，已改為下載', r !== 'copied'));
      }
    }));

    $('moon-month-btn').addEventListener('click', () => showMoonMonth());
    $('tide-month-btn').addEventListener('click', () => showTideMonth());
    $('obs-refresh').addEventListener('click', () => { const s = ++reqSeq; renderObs(s); });
    $('alert-banner-more').addEventListener('click', () => {
      $('card-alert').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    for (const [id, url] of Object.entries(LINKS)) $(id).href = url;

    document.querySelectorAll('.card-ck').forEach((ck) => ck.addEventListener('change', () => {
      Settings.set(ck.dataset.id, ck.checked);
      applyCardVisibility();
      renderAll();
      const s = reqSeq; renderForecast(s);
    }));

    $('radar-btn').addEventListener('click', toggleRadar);
    $('rules-btn').addEventListener('click', showRuleEditor);

    $('overlay-close').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
  }

  async function start() {
    rules = Plan.load();
    readURL();                 // 連結中的設定可覆寫上面兩者
    Settings.load();
    countVisit();
    GMap.init(state.lat, state.lon, (lat, lon) => setLocation(lat, lon, false));
    bind();
    renderFavs();
    applyCardVisibility();
    renderRangeSeg();
    if (Settings.on('sun')) renderSun();
    if (Settings.on('moon')) renderMoon();
    renderPlanSummary();
    try {
      await Geo.load();
    } catch (_) {
      for (const id of ['tide-body', 'hourly-body', 'multi-body', 'obs-body']) {
        const el = $(id);
        if (el) el.innerHTML = '<div class="state err">地點對照檔載入失敗</div>';
      }
      syncURL();
      return;
    }
    renderAll();
    if (Settings.radar()) { Settings.setRadar(false); toggleRadar(); }
  }

  return { start, toast, state };
})();

document.addEventListener('DOMContentLoaded', App.start);
