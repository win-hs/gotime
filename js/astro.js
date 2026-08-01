/* 天文計算：全部本地運算，不需網路。時刻一律以臺灣時間（+08:00）呈現。 */

const Astro = (function () {
  const TZ = CONFIG.TZ;

  const fmtTime = new Intl.DateTimeFormat('zh-TW', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  // en-CA 恰好輸出 YYYY-MM-DD
  const fmtDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const isValid = (d) => d instanceof Date && !isNaN(d.getTime());

  /** 該日臺灣時間正午的瞬時（用於太陽計算與月相取樣） */
  function noonOf(dateStr) {
    return new Date(dateStr + 'T12:00:00+08:00');
  }

  /**
   * 格式化為 HH:mm，並在跨日時標註。
   * @param {Date} d 瞬時
   * @param {string} baseDate 查詢日 YYYY-MM-DD
   */
  function fmt(d, baseDate) {
    if (!isValid(d)) return { text: '—', note: '' };
    const dayStr = fmtDate.format(d);
    let note = '';
    if (dayStr > baseDate) note = '翌日';
    else if (dayStr < baseDate) note = '前日';
    return { text: fmtTime.format(d), note };
  }

  /** 太陽：日出日落、三段曙暮光、日長 */
  function sun(dateStr, lat, lon) {
    const t = SunCalc.getTimes(noonOf(dateStr), lat, lon);
    const rows = [
      { key: 'astroDawn', label: '天文曙光始', d: t.nightEnd, group: 'dawn' },
      { key: 'nauticalDawn', label: '航海曙光始', d: t.nauticalDawn, group: 'dawn' },
      { key: 'civilDawn', label: '民用曙光始', d: t.dawn, group: 'dawn' },
      { key: 'sunrise', label: '日出', d: t.sunrise, group: 'sun' },
      { key: 'solarNoon', label: '日中（中天）', d: t.solarNoon, group: 'sun' },
      { key: 'sunset', label: '日落', d: t.sunset, group: 'sun' },
      { key: 'civilDusk', label: '民用暮光終', d: t.dusk, group: 'dusk' },
      { key: 'nauticalDusk', label: '航海暮光終', d: t.nauticalDusk, group: 'dusk' },
      { key: 'astroDusk', label: '天文暮光終', d: t.night, group: 'dusk' },
    ].map((r) => Object.assign(r, fmt(r.d, dateStr)));

    let dayLength = '—';
    if (isValid(t.sunrise) && isValid(t.sunset)) {
      const mins = Math.round((t.sunset - t.sunrise) / 60000);
      dayLength = `${Math.floor(mins / 60)} 小時 ${mins % 60} 分`;
    }
    return { rows, dayLength, raw: t };
  }

  /**
   * 月出月落：掃描月球上緣過地平線的時刻（見 MoonPos 說明）。
   * 不使用 SunCalc.getMoonTimes——其一以「瀏覽器本地時區的午夜」為起點，
   * 瀏覽器不在臺灣時區時會取到錯誤的一天；其二月球位置精度不足。
   * 此處固定掃 +08:00 的當日 00:00–24:00。
   */
  function moonTimes(dateStr, lat, lon) {
    const start = new Date(dateStr + 'T00:00:00+08:00').getTime();
    const STEP = 2 * 60 * 1000;
    const steps = (24 * 60) / 2;
    // 相對地平判準的高度差：>0 在地平線上
    const altAt = (ms) => {
      const p = MoonPos.position(new Date(ms), lat, lon);
      return p.altTopo - MoonPos.horizonAlt(p.parallax);
    };

    const cross = (t0, a0, t1, a1) => new Date(t0 + (t1 - t0) * (-a0 / (a1 - a0)));
    let rise = null, set = null;
    let prevT = start, prevA = altAt(start);
    const startAlt = prevA;

    for (let i = 1; i <= steps; i++) {
      const t = start + i * STEP;
      const a = altAt(t);
      if (rise === null && prevA < 0 && a >= 0) rise = cross(prevT, prevA, t, a);
      if (set === null && prevA >= 0 && a < 0) set = cross(prevT, prevA, t, a);
      prevT = t; prevA = a;
    }
    // 整日無過零點：全日在地平線上或下
    const never = rise === null && set === null;
    return {
      rise, set,
      alwaysUp: never && startAlt > 0,
      alwaysDown: never && startAlt <= 0,
    };
  }

  const PHASES = [
    { max: 0.02, name: '新月（朔）' },
    { max: 0.23, name: '眉月' },
    { max: 0.27, name: '上弦月' },
    { max: 0.48, name: '盈凸月' },
    { max: 0.52, name: '滿月（望）' },
    { max: 0.73, name: '虧凸月' },
    { max: 0.77, name: '下弦月' },
    { max: 0.98, name: '殘月' },
    { max: 1.01, name: '新月（朔）' },
  ];

  function phaseName(p) {
    return PHASES.find((x) => p < x.max).name;
  }

  /** 月亮：月相、照度、月出月落 */
  function moon(dateStr, lat, lon) {
    const ill = SunCalc.getMoonIllumination(noonOf(dateStr));
    const t = moonTimes(dateStr, lat, lon);
    return {
      phase: ill.phase,
      phaseName: phaseName(ill.phase),
      illumination: Math.round(ill.fraction * 100),
      waxing: ill.phase < 0.5,
      rise: Object.assign({ d: t.rise }, fmt(t.rise, dateStr)),
      set: Object.assign({ d: t.set }, fmt(t.set, dateStr)),
      alwaysUp: t.alwaysUp,
      alwaysDown: t.alwaysDown,
    };
  }

  /**
   * 月相 SVG 圖示。
   * 明亮側：盈相在右、虧相在左（北半球視角）。
   * 明暗界線為半長軸 r、半短軸 |r·cos(2πk)| 的橢圓弧。
   */
  function moonSVG(phase, size) {
    const r = 46, waning = phase >= 0.5;
    const k = waning ? 1 - phase : phase;      // 折算為 0（朔）→0.5（望）
    const a = Math.cos(2 * Math.PI * k) * r;    // 界線橢圓的 x 半徑（帶正負）
    const sweep = a > 0 ? 0 : 1;                // a>0 界線向右凸，a<0 向左凸
    const lit = `M 0,${-r} A ${r},${r} 0 0 1 0,${r} A ${Math.abs(a).toFixed(2)},${r} 0 0 ${sweep} 0,${-r} Z`;
    return `<svg class="moon-svg" viewBox="-50 -50 100 100" width="${size}" height="${size}" aria-hidden="true">
  <circle cx="0" cy="0" r="${r}" class="moon-dark"/>
  <g transform="${waning ? 'scale(-1,1)' : ''}"><path d="${lit}" class="moon-lit"/></g>
  <circle cx="0" cy="0" r="${r}" class="moon-rim"/>
</svg>`;
  }

  /** 今天（臺灣時間）的 YYYY-MM-DD */
  function todayStr() {
    return fmtDate.format(new Date());
  }

  /** 日期加減天數 */
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00+08:00');
    d.setUTCDate(d.getUTCDate() + days);
    return fmtDate.format(d);
  }

  return { sun, moon, moonSVG, todayStr, shiftDate, fmt, fmtDate, fmtTime, noonOf };
})();
