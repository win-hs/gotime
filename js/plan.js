/*
 * 調查時段規劃：規則引擎與 .ics 匯出
 * 規則＝名稱＋起訖兩個「錨點＋偏移分鐘」。潮汐錨點會依當日各潮次逐一展開。
 */

const Plan = (function () {
  const KEY = 'gotime.rules';

  const ANCHORS = [
    { id: 'astroDawn',    label: '天文曙光始' },
    { id: 'nauticalDawn', label: '航海曙光始' },
    { id: 'civilDawn',    label: '民用曙光始' },
    { id: 'sunrise',      label: '日出' },
    { id: 'sunset',       label: '日落' },
    { id: 'civilDusk',    label: '民用暮光終' },
    { id: 'nauticalDusk', label: '航海暮光終' },
    { id: 'astroDusk',    label: '天文暮光終' },
    { id: 'moonrise',     label: '月出' },
    { id: 'moonset',      label: '月落' },
    { id: 'highTide',     label: '滿潮' },
    { id: 'lowTide',      label: '乾潮' },
    { id: 'fixed',        label: '指定時刻' },
  ];
  /** 指定時刻的錨點不吃「偏移分鐘」，改用 HH:MM 時間輸入 */
  const isFixed = (id) => id === 'fixed';
  const anchorLabel = (id) => (ANCHORS.find((a) => a.id === id) || {}).label || id;
  const isTide = (id) => id === 'highTide' || id === 'lowTide';

  const DEFAULTS = [
    { id: 'r-bird',  name: '鳥類調查', start: { anchor: 'civilDawn', offset: -30 }, end: { anchor: 'sunrise', offset: 180 } },
    { id: 'r-inter', name: '潮間帶調查', start: { anchor: 'lowTide', offset: -120 }, end: { anchor: 'lowTide', offset: 120 } },
    { id: 'r-bat',   name: '蝙蝠／夜間調查', start: { anchor: 'sunset', offset: -15 }, end: { anchor: 'astroDusk', offset: 60 } },
  ];

  /* ---------- 儲存 ---------- */

  function storageOK() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (_) { return false; }
  }

  function load() {
    if (!storageOK()) return DEFAULTS.slice();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS.slice();
      const r = JSON.parse(raw);
      return Array.isArray(r) && r.length ? r : DEFAULTS.slice();
    } catch (_) { return DEFAULTS.slice(); }
  }

  function save(rules) {
    if (!storageOK()) return false;
    localStorage.setItem(KEY, JSON.stringify(rules));
    return true;
  }

  /* ---------- 錨點時刻 ---------- */

  /**
   * 取某錨點在當日的所有候選時刻。
   * @returns {Date[]} 可能為空陣列（該錨點當日不存在，如極區無日出、內陸無潮汐）
   */
  function anchorTimes(id, ctx) {
    const t = ctx.sun.raw, m = ctx.moon;
    const one = (d) => (d instanceof Date && !isNaN(d) ? [d] : []);
    switch (id) {
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
      case 'highTide':
      case 'lowTide': {
        if (!ctx.tideDay) return [];
        const want = id === 'highTide' ? '滿潮' : '乾潮';
        return ctx.tideDay.times.filter((x) => x.tide === want).map((x) => x.dt);
      }
      case 'fixed':
        // 偏移欄位存的是「當日 00:00 起算的分鐘數」，UI 以 HH:MM 呈現
        return [new Date(ctx.date + 'T00:00:00+08:00')];
      default: return [];
    }
  }

  const shift = (d, mins) => new Date(d.getTime() + mins * 60000);

  /**
   * 套用規則算出實際時段。
   * 起訖同為潮汐錨點時依潮次一一配對；否則每個起點取其後最近的終點。
   * @returns {{windows:Array<{start:Date,end:Date}>, reason:string|null}}
   */
  function apply(rule, ctx) {
    const starts = anchorTimes(rule.start.anchor, ctx);
    const ends = anchorTimes(rule.end.anchor, ctx);

    if (!starts.length || !ends.length) {
      const missing = !starts.length ? rule.start.anchor : rule.end.anchor;
      return {
        windows: [],
        reason: isTide(missing)
          ? '此地點／日期無潮汐資料'
          : `當日無「${anchorLabel(missing)}」`,
      };
    }

    const windows = [];
    // 兩端都是指定時刻＝直接設定幾點到幾點；訖點若早於起點視為跨夜到隔日
    if (isFixed(rule.start.anchor) && isFixed(rule.end.anchor)) {
      const s = shift(starts[0], rule.start.offset);
      let e = shift(ends[0], rule.end.offset);
      if (e <= s) e = new Date(e.getTime() + 86400000);
      return { windows: [{ start: s, end: e }], reason: null };
    }
    if (rule.start.anchor === rule.end.anchor) {
      // 同錨點：逐次配對（如乾潮前後各 2 小時 → 每次乾潮一個時段）
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

  /* ---------- .ics ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  /**
   * 一律輸出 UTC（台灣無日光節約時間，換算無歧義，免掛 VTIMEZONE）。
   * 秒數捨去至整分，與畫面顯示的 HH:mm 完全一致（錨點時刻本身帶秒）。
   */
  function icsTime(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T'
      + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
  }

  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\n/g, '\\n');

  /** RFC 5545 折行：每行至多 75 octets，續行以單一空白起頭 */
  function fold(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const out = [];
    let cur = '', curLen = 0, limit = 75;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (curLen + n > limit) { out.push(cur); cur = ' '; curLen = 1; limit = 75; }
      cur += ch; curLen += n;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /**
   * @param {Array<{title, start, end, desc}>} events
   * @param {{lat, lon, place}} ctx
   */
  function buildICS(events, ctx) {
    const stamp = icsTime(new Date());
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GoTime//開工吉時//ZH-TW',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ];
    events.forEach((ev, i) => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:gotime-${stamp}-${i}@win-hs.github.io`);
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART:' + icsTime(ev.start));
      lines.push('DTEND:' + icsTime(ev.end));
      lines.push(fold('SUMMARY:' + icsEsc(ev.title)));
      lines.push(fold('LOCATION:' + icsEsc(ctx.place)));
      lines.push(`GEO:${ctx.lat.toFixed(5)};${ctx.lon.toFixed(5)}`);
      lines.push(fold('DESCRIPTION:' + icsEsc(ev.desc)));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function download(text, filename) {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** 偏移分鐘 → HH:MM（指定時刻用） */
  const toHHMM = (m) => pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ':' + pad(((m % 60) + 60) % 60);
  /** HH:MM → 偏移分鐘 */
  const fromHHMM = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    return m ? (+m[1]) * 60 + (+m[2]) : 0;
  };

  return { ANCHORS, anchorLabel, isTide, isFixed, DEFAULTS, load, save, storageOK,
    apply, buildICS, download, icsTime, toHHMM, fromHHMM };
})();
