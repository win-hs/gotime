/* GoTime 主程式：狀態、URL 參數、卡片渲染、常用地點、分享 */

const App = (function () {
  const FAV_KEY = 'gotime.favs';

  const state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    date: Astro.todayStr(),
  };
  let tidePoint = null, town = null, tideDays = null, tideDay = null;
  let rules = [];
  let reqSeq = 0;   // 避免快速切換位置/日期時舊回應覆蓋新結果

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

  /* ---------- 覆蓋層（通用） ---------- */

  function openOverlay(title, html) {
    $('overlay-title').textContent = title;
    $('overlay-body').innerHTML = html;
    $('overlay').classList.add('show');
  }
  const closeOverlay = () => $('overlay').classList.remove('show');

  /* ---------- URL 參數 ---------- */

  function readURL() {
    const q = new URLSearchParams(location.search);
    const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    const date = q.get('date');
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      state.lat = lat; state.lon = lon;
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) state.date = date;
  }

  function shareURL() {
    const q = new URLSearchParams({
      lat: state.lat.toFixed(5), lon: state.lon.toFixed(5), date: state.date,
    });
    return location.origin + location.pathname + '?' + q;
  }

  function syncURL() {
    history.replaceState(null, '', location.pathname + '?' + new URLSearchParams({
      lat: state.lat.toFixed(5), lon: state.lon.toFixed(5), date: state.date,
    }));
  }

  /* ---------- 天文卡 ---------- */

  function renderSun() {
    const s = Astro.sun(state.date, state.lat, state.lon);
    const row = (r) => `
      <div class="tr ${r.group}${r.key === 'sunrise' || r.key === 'sunset' ? ' hl' : ''}">
        <span class="lbl">${r.label}</span>
        <span class="val">${r.text}${r.note ? `<em>${r.note}</em>` : ''}</span>
      </div>`;
    $('sun-body').innerHTML = `
      <div class="table">${s.rows.map(row).join('')}</div>
      <div class="foot">日長 ${s.dayLength}</div>`;
    return s;
  }

  function renderMoon() {
    const m = Astro.moon(state.date, state.lat, state.lon);
    let times;
    if (m.alwaysUp) times = '<div class="tr"><span class="lbl">整日在地平線上</span><span class="val">—</span></div>';
    else if (m.alwaysDown) times = '<div class="tr"><span class="lbl">整日在地平線下</span><span class="val">—</span></div>';
    else times = `
      <div class="tr"><span class="lbl">月出</span><span class="val">${m.rise.text}${m.rise.note ? `<em>${m.rise.note}</em>` : ''}</span></div>
      <div class="tr"><span class="lbl">月落</span><span class="val">${m.set.text}${m.set.note ? `<em>${m.set.note}</em>` : ''}</span></div>`;

    $('moon-body').innerHTML = `
      <div class="moon-row">
        ${Astro.moonSVG(m.phase, 84)}
        <div class="moon-info">
          <div class="phase-name">${m.phaseName}</div>
          <div class="phase-sub">照度 ${m.illumination}%・${m.waxing ? '盈（漸圓）' : '虧（漸缺）'}</div>
        </div>
      </div>
      <div class="table">${times}</div>`;
    return m;
  }

  /* ---------- 卡片狀態 ---------- */

  const loadingHTML = '<div class="state">載入中…</div>';
  const errorHTML = (msg, id) =>
    `<div class="state err">${esc(msg)}<br><button class="retry" id="${id}">重試</button></div>`;

  /* ---------- 潮汐卡 ---------- */

  async function renderTide(seq) {
    const body = $('tide-body');
    body.innerHTML = loadingHTML;
    tidePoint = Geo.nearestTide(state.lat, state.lon);
    try {
      tideDays = await CWA.tide(tidePoint.name);
      if (seq !== reqSeq) return;
      tideDay = tideDays.find((d) => d.date === state.date) || null;
      const first = tideDays[0].date, last = tideDays[tideDays.length - 1].date;

      const head = `
        <div class="src">
          最近潮汐點：<b>${esc(tidePoint.name)}</b>
          <span class="kind">${esc(tidePoint.kind)}</span>
          <span class="dist">距 ${tidePoint.dist.toFixed(1)} km</span>
        </div>`;

      if (!tideDay) {
        body.innerHTML = head +
          `<div class="state">此日期無潮汐預報<br><small>預報範圍 ${first} ～ ${last}</small></div>` +
          `<div class="foot"><button id="tide-month-btn">整月潮汐表</button></div>`;
      } else {
        const rows = tideDay.times.map((t) => `
          <div class="tr ${t.tide === '滿潮' ? 'high' : 'low'}">
            <span class="lbl">${t.tide}</span>
            <span class="val">${t.hhmm}<em>${t.cm} cm</em></span>
          </div>`).join('');
        body.innerHTML = head + `
          <div class="tide-meta">
            <span class="range r${tideDay.range}">${tideDay.range}潮</span>
            <span class="lunar">農曆 ${esc(tideDay.lunarDate.slice(5))}</span>
          </div>
          <div class="table">${rows}</div>
          <div class="foot"><button id="tide-month-btn">整月潮汐表</button></div>`;
      }
      $('tide-month-btn').addEventListener('click', showTideMonth);
    } catch (e) {
      if (seq !== reqSeq) return;
      tideDay = null;
      body.innerHTML = errorHTML(e.message, 'tide-retry');
      $('tide-retry').addEventListener('click', () => { const s = ++reqSeq; renderTide(s); });
    }
    if (seq === reqSeq) renderPlan();
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
        <tbody>${rows}</tbody>
      </table>`);
  }

  /* ---------- 天氣卡 ---------- */

  async function renderWeather(seq) {
    const body = $('weather-body');
    body.innerHTML = loadingHTML;
    town = Geo.nearestTown(state.lat, state.lon);
    try {
      const w = await CWA.weather(town, state.date);
      if (seq !== reqSeq) return;

      const head = `
        <div class="src">
          預報鄉鎮：<b>${esc(town.name)}</b>
          <span class="dist">距 ${town.dist.toFixed(1)} km</span>
          ${w.periods.length ? `<span class="kind">逐${w.granularity === '3h' ? '3' : '12'}小時</span>` : ''}
        </div>`;

      if (!w.periods.length) {
        const range = w.all.length ? `${w.all[0].date} ～ ${w.all[w.all.length - 1].date}` : '無';
        body.innerHTML = head + `<div class="state">此日期超出預報範圍<br><small>可預報 ${range}</small></div>`;
        return;
      }

      const rows = w.periods.map((p) => {
        const temp = p.tMax !== null && p.tMin !== null ? `${p.tMin}–${p.tMax}°`
          : p.temp !== null ? `${p.temp}°` : '—';
        const uv = p.uv !== null ? `<span class="uv">UV ${p.uv} ${esc(p.uvLevel || '')}</span>` : '';
        return `
          <div class="wx-row">
            <div class="wx-time">${p.hhmm}<small>${p.endHhmm}</small></div>
            <div class="wx-main">
              <div class="wx-text">${esc(p.weather || '—')}</div>
              <div class="wx-sub">
                <span class="temp">${temp}</span>
                <span class="pop">降雨 ${p.pop !== null ? p.pop + '%' : '—'}</span>
                ${p.wind !== null ? `<span class="wind">風 ${p.wind} 級</span>` : ''}
                ${uv}
              </div>
            </div>
          </div>`;
      }).join('');
      body.innerHTML = head + `<div class="wx-list">${rows}</div>`;
    } catch (e) {
      if (seq !== reqSeq) return;
      body.innerHTML = errorHTML(e.message, 'wx-retry');
      $('wx-retry').addEventListener('click', () => { const s = ++reqSeq; renderWeather(s); });
    }
  }

  /* ---------- 調查時段卡 ---------- */

  function planContext() {
    return {
      date: state.date, lat: state.lat, lon: state.lon,
      sun: Astro.sun(state.date, state.lat, state.lon),
      moon: Astro.moon(state.date, state.lat, state.lon),
      tideDay,
    };
  }

  let lastWindows = [];   // [{rule, start, end}]

  function renderPlan() {
    const ctx = planContext();
    lastWindows = [];
    const blocks = rules.map((rule) => {
      const { windows, reason } = Plan.apply(rule, ctx);
      const desc = `${Plan.anchorLabel(rule.start.anchor)}${fmtOffset(rule.start.offset)}`
        + ` ～ ${Plan.anchorLabel(rule.end.anchor)}${fmtOffset(rule.end.offset)}`;
      if (!windows.length) {
        return `<div class="plan-rule">
          <div class="plan-head"><b>${esc(rule.name)}</b><span class="plan-def">${esc(desc)}</span></div>
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
          <span class="win-dur">${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}</span>
        </label>`;
      }).join('');
      return `<div class="plan-rule">
        <div class="plan-head"><b>${esc(rule.name)}</b><span class="plan-def">${esc(desc)}</span></div>
        ${items}</div>`;
    }).join('');

    $('plan-body').innerHTML = blocks + `
      <div class="foot plan-foot">
        <button id="rules-btn">管理規則</button>
        <button id="ics-btn" class="primary"${lastWindows.length ? '' : ' disabled'}>匯出 .ics</button>
      </div>`;
    $('rules-btn').addEventListener('click', showRuleEditor);
    $('ics-btn').addEventListener('click', exportICS);
  }

  const fmtOffset = (m) => (m === 0 ? '' : (m > 0 ? ' +' : ' −') + Math.abs(m) + ' 分');

  /* ---------- .ics 匯出 ---------- */

  function exportICS() {
    const picked = [...document.querySelectorAll('.win-ck')]
      .filter((c) => c.checked).map((c) => lastWindows[+c.dataset.i]);
    if (!picked.length) { toast('請至少勾選一個時段', true); return; }

    const ctx = planContext();
    const place = town ? town.name : `${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
    const sunRow = (k) => (ctx.sun.rows.find((r) => r.key === k) || {}).text || '—';
    const tideTxt = ctx.tideDay
      ? ctx.tideDay.times.map((t) => `${t.tide} ${t.hhmm}(${t.cm}cm)`).join('、')
      : '無潮汐資料';
    const summary = [
      `日出 ${sunRow('sunrise')}　日落 ${sunRow('sunset')}`,
      `民用曙光 ${sunRow('civilDawn')}　民用暮光 ${sunRow('civilDusk')}`,
      `月相 ${ctx.moon.phaseName}（照度 ${ctx.moon.illumination}%）`,
      `潮汐（${tidePoint ? tidePoint.name : '—'}）：${tideTxt}`,
      `座標 ${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}`,
      `— 由 GoTime 開工吉時產生`,
    ].join('\n');

    const events = picked.map((w) => ({
      title: `${w.rule.name}　${place}`,
      start: w.start, end: w.end, desc: summary,
    }));
    Plan.download(Plan.buildICS(events, { lat: state.lat, lon: state.lon, place }),
      `gotime-${state.date}-${place}.ics`);
    toast(`已匯出 ${events.length} 個時段`);
  }

  /* ---------- 規則編輯器 ---------- */

  function showRuleEditor() {
    const opts = (sel) => Plan.ANCHORS.map((a) =>
      `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${a.label}</option>`).join('');
    const rows = rules.map((r, i) => `
      <div class="rule-row" data-i="${i}">
        <input type="text" class="r-name" value="${esc(r.name)}" placeholder="規則名稱">
        <div class="r-line">
          <span>起</span>
          <select class="r-sa">${opts(r.start.anchor)}</select>
          <input type="number" class="r-so" value="${r.start.offset}" step="5"><span>分</span>
        </div>
        <div class="r-line">
          <span>訖</span>
          <select class="r-ea">${opts(r.end.anchor)}</select>
          <input type="number" class="r-eo" value="${r.end.offset}" step="5"><span>分</span>
        </div>
        <button class="r-del" data-i="${i}" title="刪除">✕</button>
      </div>`).join('');

    openOverlay('管理調查規則', `
      <div class="rule-help">
        偏移為分鐘，負數代表提前。起訖選同一個潮汐錨點時，會依當日各潮次分別產生時段。
        ${Plan.storageOK() ? '' : '<br><b>目前無法使用瀏覽器儲存（隱私模式？），修改不會保留。</b>'}
      </div>
      <div id="rule-list">${rows}</div>
      <div class="rule-foot">
        <button id="rule-add">新增規則</button>
        <span style="flex:1"></span>
        <button id="rule-reset">回復預設</button>
        <button id="rule-save" class="primary">儲存</button>
      </div>`);

    $('rule-add').addEventListener('click', () => {
      collectRules();
      rules.push({ id: 'r' + Date.now(), name: '新規則', start: { anchor: 'sunrise', offset: 0 }, end: { anchor: 'sunset', offset: 0 } });
      showRuleEditor();
    });
    $('rule-reset').addEventListener('click', () => {
      rules = JSON.parse(JSON.stringify(Plan.DEFAULTS));
      showRuleEditor();
    });
    $('rule-save').addEventListener('click', () => {
      collectRules();
      if (!rules.length) { rules = JSON.parse(JSON.stringify(Plan.DEFAULTS)); }
      Plan.save(rules) ? toast('規則已儲存') : toast('已套用，但無法寫入瀏覽器儲存', true);
      closeOverlay();
      renderPlan();
    });
    document.querySelectorAll('.r-del').forEach((b) => b.addEventListener('click', () => {
      collectRules();
      rules.splice(+b.dataset.i, 1);
      showRuleEditor();
    }));
  }

  function collectRules() {
    const out = [];
    document.querySelectorAll('.rule-row').forEach((row, i) => {
      const q = (c) => row.querySelector(c);
      out.push({
        id: rules[i] ? rules[i].id : 'r' + Date.now() + i,
        name: q('.r-name').value.trim() || '未命名規則',
        start: { anchor: q('.r-sa').value, offset: parseInt(q('.r-so').value, 10) || 0 },
        end: { anchor: q('.r-ea').value, offset: parseInt(q('.r-eo').value, 10) || 0 },
      });
    });
    rules = out;
  }

  /* ---------- 常用地點 ---------- */

  function loadFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (_) { return []; }
  }
  function saveFavs(f) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); return true; } catch (_) { return false; }
  }

  function renderFavs() {
    const favs = loadFavs();
    const sel = $('fav-select');
    sel.innerHTML = '<option value="">常用地點…</option>'
      + favs.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join('');
    sel.disabled = !favs.length;
    $('fav-del').disabled = !favs.length;
  }

  function addFav() {
    const suggested = town ? town.name : `${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`;
    const name = prompt('常用地點名稱：', suggested);
    if (name === null) return;
    const favs = loadFavs();
    favs.push({ name: name.trim() || suggested, lat: state.lat, lon: state.lon });
    if (!saveFavs(favs)) { toast('無法寫入瀏覽器儲存', true); return; }
    renderFavs();
    $('fav-select').value = String(favs.length - 1);
    toast('已加入常用');
  }

  /* ---------- 總渲染 ---------- */

  function renderAll() {
    $('coord-label').textContent = `${state.lat.toFixed(5)}, ${state.lon.toFixed(5)}`;
    $('date-input').value = state.date;
    $('today-badge').style.display = state.date === Astro.todayStr() ? '' : 'none';
    renderSun();
    renderMoon();
    renderPlan();
    const seq = ++reqSeq;
    renderTide(seq);
    renderWeather(seq);
    syncURL();
  }

  /* ---------- 事件 ---------- */

  function setLocation(lat, lon, panMap) {
    state.lat = lat; state.lon = lon;
    GMap.setMarker(lat, lon, panMap);
    renderAll();
  }
  const setDate = (d) => { state.date = d; renderAll(); };

  async function doSearch(q) {
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { toast('座標超出範圍', true); return; }
      setLocation(lat, lon, true);
      return;
    }
    try {
      const res = await Geo.search(q);
      if (!res.length) { toast('查無此地名，可改用點地圖或輸入座標', true); return; }
      setLocation(res[0].lat, res[0].lon, true);
      toast('已移至 ' + res[0].name.split(',')[0]);
    } catch (_) {
      toast('地名搜尋失敗，可改用點地圖或輸入座標', true);
    }
  }

  function bind() {
    $('date-input').addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
    $('prev-day').addEventListener('click', () => setDate(Astro.shiftDate(state.date, -1)));
    $('next-day').addEventListener('click', () => setDate(Astro.shiftDate(state.date, 1)));
    $('today-btn').addEventListener('click', () => setDate(Astro.todayStr()));

    $('coord-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = $('coord-input').value.trim();
      if (!raw) return;
      doSearch(raw);
      $('coord-input').value = '';
    });

    $('locate-btn').addEventListener('click', () => {
      if (!navigator.geolocation) { toast('此瀏覽器不支援定位', true); return; }
      $('locate-btn').disabled = true;
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLocation(p.coords.latitude, p.coords.longitude, true);
          $('locate-btn').disabled = false;
          toast('已定位至目前位置');
        },
        () => { $('locate-btn').disabled = false; toast('定位失敗，請改用點地圖或輸入座標', true); },
        { timeout: 10000 }
      );
    });

    $('fav-select').addEventListener('change', (e) => {
      const i = e.target.value;
      if (i === '') return;
      const f = loadFavs()[+i];
      if (f) setLocation(f.lat, f.lon, true);
    });
    $('fav-add').addEventListener('click', addFav);
    $('fav-del').addEventListener('click', () => {
      const i = $('fav-select').value;
      if (i === '') { toast('請先選擇要刪除的常用地點', true); return; }
      const favs = loadFavs();
      const [removed] = favs.splice(+i, 1);
      saveFavs(favs); renderFavs();
      toast(`已刪除「${removed.name}」`);
    });

    $('share-btn').addEventListener('click', async () => {
      const url = shareURL();
      try {
        await navigator.clipboard.writeText(url);
        toast('連結已複製');
      } catch (_) {
        prompt('複製此連結：', url);
      }
    });

    $('overlay-close').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
  }

  async function start() {
    readURL();
    rules = Plan.load();
    GMap.init(state.lat, state.lon, (lat, lon) => setLocation(lat, lon, false));
    bind();
    renderFavs();
    renderSun();
    renderMoon();
    renderPlan();
    try {
      await Geo.load();
    } catch (_) {
      $('tide-body').innerHTML = '<div class="state err">地點對照檔載入失敗</div>';
      $('weather-body').innerHTML = '<div class="state err">地點對照檔載入失敗</div>';
      syncURL();
      return;
    }
    renderAll();
  }

  return { start, toast, state };
})();

document.addEventListener('DOMContentLoaded', App.start);
