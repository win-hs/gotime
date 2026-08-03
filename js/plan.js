/*
 * 調查規劃：規則引擎、具名方案、Google 日曆連結
 * 規則＝名稱＋起訖兩側；每側為「錨點＋偏移分鐘」，錨點為「指定時刻」時另有 time（HH:MM）。
 */

const Plan = (function () {
  const KEY = 'gotime.rules';
  const SET_KEY = 'gotime.rulesets';

  const ANCHORS = [
    { id: 'fixed',        label: '指定時刻' },
    { id: 'sunrise',      label: '日出' },
    { id: 'sunset',       label: '日落' },
    { id: 'civilDawn',    label: '民用曙光始' },
    { id: 'civilDusk',    label: '民用暮光終' },
    { id: 'nauticalDawn', label: '航海曙光始' },
    { id: 'nauticalDusk', label: '航海暮光終' },
    { id: 'astroDawn',    label: '天文曙光始' },
    { id: 'astroDusk',    label: '天文暮光終' },
    { id: 'moonrise',     label: '月出' },
    { id: 'moonset',      label: '月落' },
    { id: 'highTide',     label: '滿潮' },
    { id: 'highTideAM',   label: '滿潮（上午）' },
    { id: 'highTidePM',   label: '滿潮（下午）' },
    { id: 'lowTide',      label: '乾潮' },
    { id: 'lowTideAM',    label: '乾潮（上午）' },
    { id: 'lowTidePM',    label: '乾潮（下午）' },
  ];
  const anchorLabel = (id) => (ANCHORS.find((a) => a.id === id) || {}).label || id;
  const isTide = (id) => /^(high|low)Tide/.test(id);
  const isFixed = (id) => id === 'fixed';

  const DEFAULTS = [
    { id: 'r-bird', name: '鳥類調查',
      start: { anchor: 'sunrise', offset: 0 }, end: { anchor: 'sunrise', offset: 180 } },
    { id: 'r-inter', name: '潮間帶調查',
      start: { anchor: 'lowTide', offset: -30 }, end: { anchor: 'lowTide', offset: 30 } },
    { id: 'r-bat', name: '蝙蝠調查',
      start: { anchor: 'sunset', offset: -30 }, end: { anchor: 'sunset', offset: 120 } },
  ];

  /* ---------- 儲存 ---------- */

  function storageOK() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (_) { return false; }
  }

  function load() {
    if (!storageOK()) return clone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const r = JSON.parse(raw);
      return Array.isArray(r) && r.length ? r.map(migrate) : clone(DEFAULTS);
    } catch (_) { return clone(DEFAULTS); }
  }

  /** 舊版「指定時刻」把 offset 當成當日 00:00 起算的分鐘數，改為 time＋獨立偏移 */
  function migrate(rule) {
    for (const side of [rule.start, rule.end]) {
      if (side && side.anchor === 'fixed' && side.time === undefined) {
        const m = ((side.offset % 1440) + 1440) % 1440;
        side.time = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        side.offset = 0;
      }
    }
    return rule;
  }

  function save(rules) {
    if (!storageOK()) return false;
    localStorage.setItem(KEY, JSON.stringify(rules));
    return true;
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- 具名方案（整組規則） ---------- */

  function loadSets() {
    try { return JSON.parse(localStorage.getItem(SET_KEY)) || []; } catch (_) { return []; }
  }
  function saveSets(list) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(list)); return true; } catch (_) { return false; }
  }

  /* ---------- 錨點時刻 ---------- */

  /**
   * 取某側錨點在當日的所有候選時刻（未加偏移）。
   * @returns {Date[]} 可能為空（該錨點當日不存在，如內陸無潮汐）
   */
  function anchorTimes(side, ctx) {
    const t = ctx.sun.raw, m = ctx.moon;
    const one = (d) => (d instanceof Date && !isNaN(d) ? [d] : []);
    switch (side.anchor) {
      case 'astroDawn': return one(t.nightEnd);
      case 'nauticalDawn': return one(t.nauticalDawn);
      case 'civilDawn': return one(t.dawn);
      case 'sunrise': return one(t.sunrise);
      case 'sunset': return one(t.sunset);
      case 'civilDusk': return one(t.dusk);
      case 'nauticalDusk': return one(t.nauticalDusk);
      case 'astroDusk': return one(t.night);
      case 'moonrise': return one(m.rise.d);
      case 'moonset': return one(m.set.d);
      case 'highTide': case 'highTideAM': case 'highTidePM':
      case 'lowTide': case 'lowTideAM': case 'lowTidePM': {
        if (!ctx.tideDay) return [];
        const want = side.anchor.startsWith('high') ? '滿潮' : '乾潮';
        // 一天常有兩次滿／乾潮，AM／PM 變體可指定只取上午或下午那一次
        const half = side.anchor.endsWith('AM') ? 'AM' : (side.anchor.endsWith('PM') ? 'PM' : null);
        return ctx.tideDay.times
          .filter((x) => x.tide === want)
          .filter((x) => !half || (half === 'AM' ? +x.hhmm.slice(0, 2) < 12 : +x.hhmm.slice(0, 2) >= 12))
          .map((x) => x.dt);
      }
      case 'fixed':
        return [new Date(`${ctx.date}T${side.time || '00:00'}:00+08:00`)];
      default: return [];
    }
  }

  const shift = (d, mins) => new Date(d.getTime() + mins * 60000);

  /**
   * 套用規則算出實際時段。
   * 起訖同為潮汐錨點時依潮次一一配對；否則每個起點取其後最近的終點。
   */
  function apply(rule, ctx) {
    const starts = anchorTimes(rule.start, ctx);
    const ends = anchorTimes(rule.end, ctx);

    if (!starts.length || !ends.length) {
      const missing = !starts.length ? rule.start.anchor : rule.end.anchor;
      let reason;
      if (!isTide(missing)) reason = `當日無「${anchorLabel(missing)}」`;
      else if (!ctx.tideDay) reason = '此地點／日期無潮汐資料';
      else reason = `當日無「${anchorLabel(missing)}」`;   // 例如當天下午沒有乾潮
      return { windows: [], reason };
    }

    // 兩端都是指定時刻＝直接設定幾點到幾點；訖早於起視為跨夜
    if (isFixed(rule.start.anchor) && isFixed(rule.end.anchor)) {
      const s = shift(starts[0], rule.start.offset);
      let e = shift(ends[0], rule.end.offset);
      if (e <= s) e = new Date(e.getTime() + 86400000);
      return { windows: [{ start: s, end: e }], reason: null };
    }

    const windows = [];
    if (rule.start.anchor === rule.end.anchor) {
      starts.forEach((s, i) => {
        windows.push({ start: shift(s, rule.start.offset), end: shift(ends[i], rule.end.offset) });
      });
    } else {
      for (const s of starts) {
        const e = ends.find((x) => x >= s) || ends[ends.length - 1];
        windows.push({ start: shift(s, rule.start.offset), end: shift(e, rule.end.offset) });
      }
    }
    windows.sort((a, b) => a.start - b.start);
    return { windows, reason: null };
  }

  /** 偏移顯示：正數帶 + 號 */
  const fmtOffset = (m) => (m === 0 ? '' : (m > 0 ? ' +' : ' −') + Math.abs(m) + ' 分');

  /** 單側的文字描述 */
  function sideText(side) {
    return isFixed(side.anchor)
      ? (side.time || '00:00') + fmtOffset(side.offset)
      : anchorLabel(side.anchor) + fmtOffset(side.offset);
  }
  const ruleText = (r) => `${sideText(r.start)} ～ ${sideText(r.end)}`;

  /* ---------- Google 日曆 ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  /** Google 日曆的 dates 參數用 UTC；秒數捨去至整分與畫面一致 */
  function gcalStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T'
      + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
  }

  /**
   * 產生 Google 日曆「新增活動」預填連結（開新分頁即可儲存，不需授權）。
   * 一個連結對應一個活動。
   */
  function gcalURL(ev, ctx) {
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.title,
      dates: `${gcalStamp(ev.start)}/${gcalStamp(ev.end)}`,
      details: ev.desc,
      location: ctx.place + ` (${ctx.lat.toFixed(5)}, ${ctx.lon.toFixed(5)})`,
    });
    return 'https://calendar.google.com/calendar/render?' + q;
  }

  return {
    ANCHORS, anchorLabel, isTide, isFixed, DEFAULTS,
    load, save, storageOK, loadSets, saveSets, clone,
    apply, fmtOffset, sideText, ruleText, gcalURL,
  };
})();
