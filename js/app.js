/* GoTime 主程式：狀態、URL、渲染、搜尋、常用地點 */

const App = (function () {
  const FAV_KEY = 'gotime.favs';
  const COUNTER_URL = 'https://abacus.jasoncameron.dev/hit/gotime-awen-9/live-visits';
  const RADAR_OPACITY = 0.5;    // 固定，不提供調整

  const state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    date: Astro.todayStr(),
  };
  let tidePoint = null, town = null, tideDays = null, tideDay = null;
  let rules = [], lastWindows = [];
  let reqSeq = 0;
  let radarInfo = null, qpfData = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hhmm = (d) => Astro.fmtTime.format(d);

  function toast(msg, isError) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  function openOverlay(title, html) {
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = html;
    $('overlay').classList.add('show');
  }
  const closeOverlay = () => $('overlay').classList.remove('show');

  /* ---------- 造訪次數（沿用 Field-Box 家族的 abacus 計數器） ---------- */

  async function countVisit() {
    try {
      const r = await fetch(COUNTER_URL);
      const j = await r.json();
      $('visits').textContent = String(Number(j.value)).padStart(8, '0');
    } catch (_) { $('visits').textContent = '—'; }
  }

  /* ---------- URL ---------- */

  function readURL() {
    const q = new URLSearchParams(location.search);
    const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    const date = q.get('date');
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      state.lat = lat; state.lon = lon;
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) state.date = date;
  }
  const urlParams = () => new URLSearchParams({
    lat: state.lat.toFixed(5), lon: state.lon.toFixed(5), date: state.date,
  });
  const shareURL = () => location.origin + location.pathname + '?' + urlParams();
  const syncURL = () => history.replaceState(null, '', location.pathname + '?' + urlParams());

  /* ---------- 日出日落 ---------- */

  function renderSun() {
    const s = Astro.sun(state.date, state.lat, state.lon);
    const row = (r) => {
      const hl = (r.group === 'rise' || r.group === 'set') ? ` hl ${r.group}` : '';
      return `<div class="tr ${r.group}${hl}">
        <span class="lbl"><span class="em">${r.em}</span>${r.label}</span>
        <span class="val">${r.text}${r.note ? `<em>${r.note}</em>` : ''}</span>
      </div>`;
    };
    $('sun-body').innerHTML = `
      <div class="table">${s.rows.map(row).join('')}</div>
      <div class="foot daylen">日長 ${s.dayLength}</div>`;
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
      <div class="table">${times}</div>
      <div class="foot"><button class="md-btn-out" id="moon-month-btn">整月月相表</button></div>`;
    $('moon-month-btn').addEventListener('click', showMoonMonth);
  }

  function showMoonMonth() {
    const [y, m] = state.date.split('-').map(Number);
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

    const head = ['日', '一', '二', '三', '四', '五', '六']
      .map((w) => `<div class="mm-head">${w}</div>`).join('');
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="mm-cell blank"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const mo = Astro.moon(date, state.lat, state.lon);
      cells += `<div class="mm-cell${date === state.date ? ' cur' : ''}">
        <div class="mm-d">${d}</div>
        ${Astro.moonSVG(mo.phase, 34)}
        <div class="mm-i">${mo.illumination}%</div>
        <div class="mm-p">${esc(mo.phaseName.replace(/（.*）/, ''))}</div>
      </div>`;
    }
    openOverlay(`整月月相　${y} 年 ${m} 月`,
      `<div class="rule-help">照度為當日正午（臺灣時間）之值；亮面方向依北半球視角，盈相在右、虧相在左。</div>
       <div class="moon-month">${head}${cells}</div>`);
  }

  const loadingHTML = '<div class="state">載入中…</div>';
  const errorHTML = (msg, id) =>
    `<div class="state err">${esc(msg)}<br><button class="md-btn-out retry" id="${id}" style="margin-top:10px">重試</button></div>`;

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
      const head = `
        <div class="src">最近潮汐點：<b>${esc(tidePoint.name)}</b>
          <span class="kind">${esc(tidePoint.kind)}</span>
          <span class="dist">距 ${tidePoint.dist.toFixed(1)} km</span></div>`;

      if (!tideDay) {
        body.innerHTML = head
          + `<div class="state">此日期無潮汐預報<br><small>預報範圍 ${first} ～ ${last}</small></div>`
          + `<div class="foot"><button class="md-btn-out" id="tide-month-btn">整月潮汐表</button></div>`;
      } else {
        const rows = tideDay.times.map((t) => `
          <div class="tr ${t.tide === '滿潮' ? 'high' : 'low'}">
            <span class="lbl"><span class="em">${t.tide === '滿潮' ? '🌊' : '🏖️'}</span>${t.tide}</span>
            <span class="val">${t.hhmm}<em>${t.cm} cm</em></span>
          </div>`).join('');
        body.innerHTML = head + `
          <div class="tide-meta">
            <span class="range r${tideDay.range}">${tideDay.range}潮</span>
            <span class="lunar">農曆 ${esc(tideDay.lunarDate.slice(5))}</span>
          </div>
          <div class="table">${rows}</div>
          <div class="foot"><button class="md-btn-out" id="tide-month-btn">整月潮汐表</button></div>`;
      }
      $('tide-month-btn').addEventListener('click', showTideMonth);
    } catch (e) {
      if (seq !== reqSeq) return;
      tideDay = null; tideDays = null;
      if (Settings.on('tide')) {
        body.innerHTML = errorHTML(e.message, 'tide-retry');
        $('tide-retry').addEventListener('click', () => { const s = ++reqSeq; renderTide(s).then(() => afterTide(s)); });
      }
    }
  }

  function showTideMonth() {
    if (!tideDays) return;
    const rows = tideDays.map((d) => {
      const cells = d.times.map((t) =>
        `<span class="t ${t.tide === '滿潮' ? 'high' : 'low'}">${t.tide[0]} ${t.hhmm}<em>${t.cm}</em></span>`).join('');
      return `<tr class="${d.date === state.date ? 'cur' : ''}">
        <td class="d">${d.date.slice(5)}<small>${esc(d.lunarDate.slice(5))}</small></td>
        <td><span class="range r${d.range}">${d.range}</span></td>
        <td class="times">${cells}</td></tr>`;
    }).join('');
    openOverlay(`整月潮汐　${tidePoint.name}`, `
      <table class="tide-month">
        <thead><tr><th>日期</th><th>潮差</th><th>滿(高)／乾(低)潮時刻與潮高 cm</th></tr></thead>
        <tbody>${rows}</tbody></table>`);
  }

  /* ---------- 天氣 ---------- */

  async function renderWeather(seq) {
    if (!Settings.on('weather')) return;
    const body = $('weather-body');
    body.innerHTML = loadingHTML;
    try {
      const w = await CWA.weather(town, state.date);
      if (seq !== reqSeq) return;
      const head = `
        <div class="src">預報鄉鎮：<b>${esc(town.county)}${esc(town.name)}</b>
          <span class="dist">距 ${town.dist.toFixed(1)} km</span>
          ${w.periods.length ? `<span class="kind">逐${w.granularity === '3h' ? '3' : '12'}小時</span>` : ''}</div>`;

      if (!w.periods.length) {
        const range = w.all.length ? `${w.all[0].date} ～ ${w.all[w.all.length - 1].date}` : '無';
        body.innerHTML = head + `<div class="state">此日期超出預報範圍<br><small>可預報 ${range}</small></div>`;
        return;
      }
      const rows = w.periods.map((p) => {
        const temp = p.tMax !== null && p.tMin !== null ? `${p.tMin}–${p.tMax}°`
          : p.temp !== null ? `${p.temp}°` : '—';
        return `
          <div class="wx-row">
            <div class="wx-time">${p.hhmm}<small>${p.endHhmm}</small></div>
            <div class="wx-main">
              <div class="wx-text">${MultiDay.icon(p.weather, p.hhmm === '18:00')} ${esc(p.weather || '—')}</div>
              <div class="wx-sub">
                <span class="temp">${temp}</span>
                <span class="pop">降雨 ${p.pop !== null ? p.pop + '%' : '—'}</span>
                ${p.wind !== null ? `<span>風 ${p.wind} 級</span>` : ''}
                ${p.atMin !== null && p.atMax !== null ? `<span>體感 ${p.atMin}–${p.atMax}°</span>` : ''}
              </div></div></div>`;
      }).join('');
      body.innerHTML = head + `<div>${rows}</div>`;
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'wx-retry');
      $('wx-retry').addEventListener('click', () => { const s = ++reqSeq; renderWeather(s); });
    }
  }

  /* ---------- 多日總覽 ---------- */

  async function renderMulti(seq) {
    const body = $('multi-body');
    body.innerHTML = loadingHTML;
    const days = Settings.days();
    const dates = [];
    for (let i = 0; i < days; i++) dates.push(Astro.shiftDate(state.date, i));
    try {
      const wdays = Settings.on('weather') ? await CWA.weatherDays(town, state.date, days) : [];
      if (seq !== reqSeq) return;
      const missing = Settings.on('weather') && wdays.length < days;
      body.innerHTML = `
        <div class="src"><b>${esc(town.county)}${esc(town.name)}</b>
          ${Settings.on('tide') && tidePoint ? `<span class="kind">潮汐：${esc(tidePoint.name)}</span>` : ''}
          <span class="dist">${dates[0].slice(5).replace('-', '/')} 起 ${days} 天</span></div>`
        + MultiDay.render(dates, wdays, {
          lat: state.lat, lon: state.lon, tideDays,
          show: {
            sun: Settings.on('sun'), moon: Settings.on('moon'),
            tide: Settings.on('tide'), weather: Settings.on('weather'),
          },
          today: Astro.todayStr(), current: state.date,
        })
        + (missing ? '<div class="mx-note">天氣預報僅涵蓋約一週，超出範圍的日期留白；日月與潮汐仍可顯示。</div>' : '');
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'multi-retry');
      $('multi-retry').addEventListener('click', () => { const s = ++reqSeq; renderMulti(s); });
    }
  }

  /* ---------- 降雨與雷達 ---------- */

  async function renderRadar(seq) {
    const body = $('radar-body');
    body.innerHTML = loadingHTML;
    try {
      const st = await Radar.rainfall(town.county, state.lat, state.lon, 5);
      if (seq !== reqSeq) return;
      GMap.setRainStations(st);
      const obs = st.length ? st[0].time.slice(11, 16) : '—';
      const rows = st.map((s, i) => {
        const v = (x) => (x === null ? '—' : x.toFixed(1));
        const wet = s.h1 !== null && s.h1 > 0;
        return `<div class="rain-row${wet ? ' wet' : ''}">
          <div class="rain-name">
            <span class="rain-dot${i === 0 ? ' near' : ''}"></span>
            <span>${esc(s.name)}<small>${esc(s.town)}・${s.dist.toFixed(1)} km${isFinite(s.alt) ? '・' + Math.round(s.alt) + ' m' : ''}</small></span>
          </div>
          <div class="rain-vals">
            <span>${v(s.now)}</span><span class="h1">${v(s.h1)}</span>
            <span>${v(s.h3)}</span><span>${v(s.h24)}</span>
          </div></div>`;
      }).join('');

      body.innerHTML = `
        <div class="src">鄰近雨量站（${esc(town.county)}）
          <span class="kind">觀測 ${obs}</span><span class="dist">單位 mm</span>
          <span class="dist">🔴 最近站</span></div>
        <div class="rain-head"><span></span><div class="rain-vals">
          <span>本時段</span><span class="h1">1 小時</span><span>3 小時</span><span>24 小時</span>
        </div></div>
        ${rows || '<div class="state">此縣市無雨量站資料</div>'}
        <div class="foot"><span class="radar-time" id="radar-time"></span></div>
        <div id="qpf-area"></div>`;
      updateRadarTime();
      if (Settings.qpf()) renderQpf();
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'radar-retry');
      $('radar-retry').addEventListener('click', () => { const s = ++reqSeq; renderRadar(s); });
    }
  }

  function updateRadarTime() {
    const el = $('radar-time');
    if (!el) return;
    el.textContent = Settings.radar() && radarInfo
      ? `雷達回波 ${radarInfo.time.slice(11, 16)} 觀測，已疊在地圖上（透明度 50%）`
      : '';
  }

  async function toggleRadar() {
    const btn = $('radar-btn');
    if (Settings.radar()) {
      Settings.setRadar(false);
      GMap.clearRadar(); Radar.dispose(); radarInfo = null;
      btn.classList.remove('on'); btn.textContent = '雷達回波開啟';
      updateRadarTime();
      return;
    }
    btn.disabled = true; btn.textContent = '載入回波圖…';
    try {
      const m = await Radar.meta();
      radarInfo = await Radar.buildOverlay(m);
      GMap.setRadar(radarInfo.url, radarInfo.bounds, RADAR_OPACITY);
      Settings.setRadar(true);
      btn.classList.add('on'); btn.textContent = '雷達回波關閉';
      toast('回波圖 ' + radarInfo.time.slice(11, 16) + ' 已疊上地圖');
    } catch (e) {
      toast(e.message || '雷達回波載入失敗', true);
      btn.textContent = '雷達回波開啟';
    } finally { btn.disabled = false; updateRadarTime(); }
  }

  async function renderQpf() {
    const area = $('qpf-area');
    if (!area) return;
    if (!Settings.qpf()) { area.innerHTML = ''; return; }
    area.innerHTML = '<div class="state">載入降水預報…</div>';
    try {
      if (!qpfData) qpfData = await Radar.qpf();
      if (!qpfData.length) { area.innerHTML = '<div class="state">目前無降水預報圖</div>'; return; }
      area.innerHTML = `
        <div class="src" style="margin-top:14px">中央氣象署定量降水預報
          <span class="kind">最長 12 小時</span>
          <span class="dist">成品圖，無法疊圖</span></div>
        <div class="qpf-grid">${qpfData.map((q) => `
          <div class="qpf-item">
            <h4>${esc(q.desc)}</h4>
            <a href="${esc(q.image)}" target="_blank" rel="noopener">
              <img src="${esc(q.image)}?t=${Date.now()}" alt="${esc(q.desc)}" loading="lazy">
            </a>
          </div>`).join('')}</div>`;
    } catch (e) {
      area.innerHTML = `<div class="state err">降水預報載入失敗：${esc(e.message)}</div>`;
    }
  }

  function toggleQpf() {
    const btn = $('qpf-btn');
    const next = !Settings.qpf();
    Settings.setQpf(next);
    btn.classList.toggle('on', next);
    btn.textContent = next ? '降水預報關閉' : '降水預報開啟';
    renderQpf();
  }

  /* ---------- 調查時段 ---------- */

  function planContext() {
    return {
      date: state.date, lat: state.lat, lon: state.lon,
      sun: Astro.sun(state.date, state.lat, state.lon),
      moon: Astro.moon(state.date, state.lat, state.lon),
      tideDay,
    };
  }

  const fmtOffset = (m) => (m === 0 ? '' : (m > 0 ? ' +' : ' −') + Math.abs(m) + ' 分');
  const ruleDesc = (r) => {
    const side = (a) => Plan.isFixed(a.anchor)
      ? Plan.toHHMM(a.offset)
      : Plan.anchorLabel(a.anchor) + fmtOffset(a.offset);
    return `${side(r.start)} ～ ${side(r.end)}`;
  };

  /** 頂部面板的「開工吉時」摘要 */
  function renderPlanSummary() {
    const ctx = planContext();
    lastWindows = [];
    const wd = ['日', '一', '二', '三', '四', '五', '六'][
      new Date(Date.UTC(...state.date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)))).getUTCDay()];
    const isToday = state.date === Astro.todayStr();

    const blocks = rules.map((rule) => {
      const { windows, reason } = Plan.apply(rule, ctx);
      if (!windows.length) {
        return `<div class="ps-rule"><span class="ps-name">${esc(rule.name)}</span>
          <span class="ps-def">${esc(ruleDesc(rule))}</span>
          <div class="ps-none">${esc(reason || '無可用時段')}</div></div>`;
      }
      const items = windows.map((w) => {
        lastWindows.push({ rule, start: w.start, end: w.end });
        const mins = Math.round((w.end - w.start) / 60000);
        const cross = Astro.fmtDate.format(w.end) !== Astro.fmtDate.format(w.start);
        return `<div><span class="ps-time">${hhmm(w.start)} – ${hhmm(w.end)}</span>${cross ? '<span class="ps-dur">翌日</span>' : ''}
          <span class="ps-dur">${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}</span></div>`;
      }).join('');
      return `<div class="ps-rule"><span class="ps-name">${esc(rule.name)}</span>
        <span class="ps-def">${esc(ruleDesc(rule))}</span>${items}</div>`;
    }).join('');

    $('plan-summary').innerHTML =
      `<div class="ps-title">${isToday ? '今天' : ''}〈${state.date.replace(/-/g, '/')}〉〈週${wd}〉開工吉時：</div>${blocks}`;
  }

  /* ---------- 規則編輯器（含結果預覽與 .ics 匯出） ---------- */

  function showRuleEditor() {
    const opts = (sel) => Plan.ANCHORS.map((a) =>
      `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${a.label}</option>`).join('');
    const sideInput = (side, r) => Plan.isFixed(r.anchor)
      ? `<input type="time" class="r-${side}t" value="${Plan.toHHMM(r.offset)}">`
      : `<input type="number" class="r-${side}o" value="${r.offset}" step="5"><span>分</span>`;

    const rows = rules.map((r, i) => `
      <div class="rule-row" data-i="${i}">
        <input type="text" class="r-name" value="${esc(r.name)}" placeholder="規則名稱">
        <div class="r-line"><span>起</span>
          <select class="r-sa">${opts(r.start.anchor)}</select>${sideInput('s', r.start)}</div>
        <div class="r-line"><span>訖</span>
          <select class="r-ea">${opts(r.end.anchor)}</select>${sideInput('e', r.end)}</div>
        <button class="r-del" data-i="${i}" title="刪除">✕</button>
      </div>`).join('');

    // 目前日期的計算結果，供勾選匯出
    const ctx = planContext();
    lastWindows = [];
    const preview = rules.map((rule) => {
      const { windows, reason } = Plan.apply(rule, ctx);
      if (!windows.length) {
        return `<div class="plan-rule"><div class="plan-head"><b>${esc(rule.name)}</b>
          <span class="plan-def">${esc(ruleDesc(rule))}</span></div>
          <div class="plan-none">${esc(reason || '無可用時段')}</div></div>`;
      }
      const items = windows.map((w) => {
        const idx = lastWindows.length;
        lastWindows.push({ rule, start: w.start, end: w.end });
        const mins = Math.round((w.end - w.start) / 60000);
        const cross = Astro.fmtDate.format(w.end) !== Astro.fmtDate.format(w.start);
        return `<label class="plan-win">
          <input type="checkbox" class="win-ck" data-i="${idx}" checked>
          <span class="win-time">${hhmm(w.start)} – ${hhmm(w.end)}${cross ? '<em>翌日</em>' : ''}</span>
          <span class="win-dur">${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}</span></label>`;
      }).join('');
      return `<div class="plan-rule"><div class="plan-head"><b>${esc(rule.name)}</b>
        <span class="plan-def">${esc(ruleDesc(rule))}</span></div>${items}</div>`;
    }).join('');

    openOverlay('調查規劃', `
      <div class="rule-help">
        錨點選「指定時刻」即可直接設定幾點到幾點（訖點早於起點視為跨夜）；其餘錨點以分鐘偏移，負數代表提前。
        起訖選同一個潮汐錨點時，會依當日各潮次分別產生時段。
        ${Plan.storageOK() ? '' : '<br><b>目前無法使用瀏覽器儲存（隱私模式？），修改不會保留。</b>'}
      </div>
      <div id="rule-list">${rows}</div>
      <div class="rule-foot">
        <button class="md-btn-out" id="rule-add">新增規則</button><span style="flex:1"></span>
        <button class="md-btn-out" id="rule-reset">回復預設</button>
        <button class="md-btn-fill" id="rule-save">儲存</button>
      </div>
      <div class="src" style="margin-top:16px">${state.date.replace(/-/g, '/')} 的計算結果</div>
      ${preview}
      <div class="rule-foot"><span style="flex:1"></span>
        <button class="md-btn-fill" id="ics-btn"${lastWindows.length ? '' : ' disabled'}>匯出 .ics</button>
      </div>`);

    // 錨點切換為「指定時刻」時，把偏移欄換成時間輸入
    $('overlay-body').querySelectorAll('.r-sa, .r-ea').forEach((sel) => {
      sel.addEventListener('change', () => { collectRules(); showRuleEditor(); });
    });
    $('rule-add').addEventListener('click', () => {
      collectRules();
      rules.push({ id: 'r' + Date.now(), name: '新規則',
        start: { anchor: 'sunrise', offset: 0 }, end: { anchor: 'sunset', offset: 0 } });
      showRuleEditor();
    });
    $('rule-reset').addEventListener('click', () => {
      rules = JSON.parse(JSON.stringify(Plan.DEFAULTS)); showRuleEditor();
    });
    $('rule-save').addEventListener('click', () => {
      collectRules();
      if (!rules.length) rules = JSON.parse(JSON.stringify(Plan.DEFAULTS));
      Plan.save(rules) ? toast('規則已儲存') : toast('已套用，但無法寫入瀏覽器儲存', true);
      closeOverlay(); renderPlanSummary();
    });
    $('ics-btn').addEventListener('click', exportICS);
    $('overlay-body').querySelectorAll('.r-del').forEach((b) => b.addEventListener('click', () => {
      collectRules(); rules.splice(+b.dataset.i, 1); showRuleEditor();
    }));
  }

  function collectRules() {
    const out = [];
    document.querySelectorAll('.rule-row').forEach((row, i) => {
      const q = (c) => row.querySelector(c);
      const side = (a, o, t) => {
        const anchor = q(a).value;
        if (Plan.isFixed(anchor)) return { anchor, offset: Plan.fromHHMM(q(t) ? q(t).value : '00:00') };
        return { anchor, offset: parseInt(q(o) ? q(o).value : '0', 10) || 0 };
      };
      out.push({
        id: rules[i] ? rules[i].id : 'r' + Date.now() + i,
        name: q('.r-name').value.trim() || '未命名規則',
        start: side('.r-sa', '.r-so', '.r-st'),
        end: side('.r-ea', '.r-eo', '.r-et'),
      });
    });
    rules = out;
  }

  function exportICS() {
    const picked = [...document.querySelectorAll('.win-ck')]
      .filter((c) => c.checked).map((c) => lastWindows[+c.dataset.i]);
    if (!picked.length) { toast('請至少勾選一個時段', true); return; }
    const ctx = planContext();
    const place = town ? town.county + town.name : `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
    const sunRow = (k) => (ctx.sun.rows.find((r) => r.key === k) || {}).text || '—';
    const tideTxt = ctx.tideDay
      ? ctx.tideDay.times.map((t) => `${t.tide} ${t.hhmm}(${t.cm}cm)`).join('、') : '無潮汐資料';
    const summary = [
      `日出 ${sunRow('sunrise')}　日落 ${sunRow('sunset')}`,
      `民用曙光 ${sunRow('civilDawn')}　民用暮光 ${sunRow('civilDusk')}`,
      `月相 ${ctx.moon.phaseName}（照度 ${ctx.moon.illumination}%）`,
      `潮汐（${tidePoint ? tidePoint.name : '—'}）：${tideTxt}`,
      `座標 ${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}`,
      '— 由 GoTime 開工吉時產生',
    ].join('\n');
    const events = picked.map((w) => ({
      title: `${w.rule.name}　${place}`, start: w.start, end: w.end, desc: summary,
    }));
    Plan.download(Plan.buildICS(events, { lat: state.lat, lon: state.lon, place }),
      `gotime-${state.date}-${place}.ics`);
    toast(`已匯出 ${events.length} 個時段`);
  }

  /* ---------- 常用地點（下拉清單內以 ✕ 刪除） ---------- */

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
    const name = prompt('常用地點名稱：', suggested);
    if (name === null) return;
    const favs = loadFavs();
    const finalName = name.trim() || suggested;
    favs.push({ name: finalName, lat: state.lat, lon: state.lon });
    if (!saveFavs(favs)) { toast('無法寫入瀏覽器儲存', true); return; }
    renderFavs();
    $('fav-current').textContent = finalName;
    toast('已加入常用');
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
      showSuggest(res, '選擇正確的地點（顯示所在鄉鎮以便分辨同名地點）');
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
    document.querySelectorAll('.card-ck').forEach((ck) => { ck.checked = Settings.on(ck.dataset.id); });
  }

  function afterTide(seq) {
    if (seq !== reqSeq) return;
    renderPlanSummary();
    renderMulti(seq);
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
    renderWeather(seq);
    renderRadar(seq);
    syncURL();
  }

  function setLocation(lat, lon, panMap) {
    state.lat = lat; state.lon = lon;
    GMap.setMarker(lat, lon, panMap);
    renderAll();
  }
  const setDate = (d) => { state.date = d; renderAll(); };

  function renderRangeSeg() {
    $('range-seg').innerHTML = Settings.RANGES.map((r) =>
      `<button class="seg-btn${Settings.days() === r.id ? ' on' : ''}" data-d="${r.id}">${r.label}</button>`).join('');
    $('range-seg').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      Settings.setDays(+b.dataset.d); renderRangeSeg();
      const s = ++reqSeq; renderMulti(s);
    }));
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

    $('fav-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      $('fav-menu').classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!$('fav-menu').contains(e.target)) $('fav-menu').classList.remove('show');
    });
    $('fav-add').addEventListener('click', addFav);

    document.querySelectorAll('.card-ck').forEach((ck) => ck.addEventListener('change', () => {
      Settings.set(ck.dataset.id, ck.checked);
      applyCardVisibility();
      renderAll();
    }));

    $('radar-btn').addEventListener('click', toggleRadar);
    $('qpf-btn').addEventListener('click', toggleQpf);
    $('rules-btn').addEventListener('click', showRuleEditor);
    $('share-btn').addEventListener('click', async () => {
      const url = shareURL();
      try { await navigator.clipboard.writeText(url); toast('連結已複製'); }
      catch (_) { prompt('複製此連結：', url); }
    });

    $('overlay-close').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
  }

  async function start() {
    readURL();
    Settings.load();
    rules = Plan.load();
    countVisit();
    GMap.init(state.lat, state.lon, (lat, lon) => setLocation(lat, lon, false));
    bind();
    renderFavs();
    applyCardVisibility();
    renderRangeSeg();
    $('qpf-btn').classList.toggle('on', Settings.qpf());
    $('qpf-btn').textContent = Settings.qpf() ? '降水預報關閉' : '降水預報開啟';
    if (Settings.on('sun')) renderSun();
    if (Settings.on('moon')) renderMoon();
    renderPlanSummary();
    try {
      await Geo.load();
    } catch (_) {
      for (const id of ['tide-body', 'weather-body', 'radar-body', 'multi-body']) {
        const el = $(id);
        if (el) el.innerHTML = '<div class="state err">地點對照檔載入失敗</div>';
      }
      syncURL();
      return;
    }
    renderAll();
    // 上次開著雷達的話自動重新疊圖
    if (Settings.radar()) { Settings.setRadar(false); toggleRadar(); }
  }

  return { start, toast, state };
})();

document.addEventListener('DOMContentLoaded', App.start);
