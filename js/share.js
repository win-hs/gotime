/*
 * 分享：純文字、極簡截圖（canvas 重畫）、.ics 批次匯出
 * Google 日曆的預填網址一次只能建一個活動，要一次加入多筆只能靠 .ics 匯入。
 */

const Share = (function () {
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- 純文字 ---------------- */

  function buildText(d) {
    const lines = [
      `【開工吉時】${d.date.replace(/-/g, '/')}（週${d.weekday}）`,
      `地點：${d.place}（${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}）`,
      '',
    ];
    for (const b of d.blocks) {
      if (!b.items.length) { lines.push(`${b.rule.name}：${b.reason || '無可用時段'}`); continue; }
      lines.push(`${b.rule.name}（${Plan.ruleText(b.rule)}）`);
      for (const w of b.items) lines.push(`  ${d.hhmm(w.start)} - ${d.hhmm(w.end)}　${d.dur(w.start, w.end)}`);
    }
    lines.push('');
    lines.push(`日出 ${d.sunrise}／日落 ${d.sunset}`);
    lines.push(`月相 ${d.moonName} 照度 ${d.moonIllum}%`);
    if (d.tide) {
      lines.push(`潮汐（${d.tideName}）${d.tide.range}潮：`
        + d.tide.times.map((t) => `${t.tide}${t.hhmm}`).join('、'));
    }
    return lines.join('\n');
  }

  /* ---------------- 極簡截圖 ---------------- */

  /**
   * 用 canvas 重畫一張「只有時段」的分享圖（靜態網頁無法真的截螢幕）。
   * 以 2 倍解析度繪製，貼到訊息或簡報都不會糊。
   */
  function buildImage(d) {
    const S = 2;                       // 解析度倍率
    const W = 640;
    const M = 28;                      // 邊距
    const rows = d.blocks.filter((b) => b.items.length || b.reason);

    // 先估算高度
    let h = M + 34 + 24 + 16;
    for (const b of rows) h += 26 + (b.items.length ? b.items.length * 30 : 26) + 10;
    h += M + 18;

    const cv = document.createElement('canvas');
    cv.width = W * S; cv.height = h * S;
    const c = cv.getContext('2d');
    c.scale(S, S);

    const FS = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
    const MONO = '"Roboto Mono", Consolas, monospace';

    c.fillStyle = '#fff'; c.fillRect(0, 0, W, h);
    c.fillStyle = '#1a73e8'; c.fillRect(0, 0, W, 6);

    let y = M + 12;
    c.fillStyle = '#202124'; c.font = `700 22px ${FS}`; c.textBaseline = 'alphabetic';
    c.fillText(`開工吉時　${d.date.replace(/-/g, '/')}（週${d.weekday}）`, M, y);
    y += 26;
    c.fillStyle = '#5f6368'; c.font = `14px ${FS}`;
    c.fillText(d.place, M, y);
    y += 22;

    c.strokeStyle = '#dadce0'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(M, y); c.lineTo(W - M, y); c.stroke();
    y += 20;

    for (const b of rows) {
      c.fillStyle = '#202124'; c.font = `500 16px ${FS}`;
      c.fillText(b.rule.name, M, y);
      c.fillStyle = '#80868b'; c.font = `12px ${FS}`;
      c.fillText(Plan.ruleText(b.rule), M + c.measureText(b.rule.name).width + 100, y);
      y += 24;

      if (!b.items.length) {
        c.fillStyle = '#5f6368'; c.font = `13px ${FS}`;
        c.fillText(b.reason || '無可用時段', M + 14, y);
        y += 24;
      } else {
        for (const w of b.items) {
          c.fillStyle = '#e8f0fe';
          c.fillRect(M + 10, y - 15, W - M * 2 - 10, 24);
          c.fillStyle = '#1765cc'; c.font = `500 17px ${MONO}`;
          c.fillText(`${d.hhmm(w.start)} – ${d.hhmm(w.end)}`, M + 20, y);
          c.fillStyle = '#5f6368'; c.font = `12px ${FS}`;
          c.fillText(d.dur(w.start, w.end), M + 170, y);
          y += 30;
        }
      }
      y += 8;
    }

    y = h - M + 4;
    c.fillStyle = '#80868b'; c.font = `11px ${FS}`;
    c.fillText(`日出 ${d.sunrise}　日落 ${d.sunset}　${d.moonName} ${d.moonIllum}%　— GoTime 開工吉時`, M, y);

    return cv;
  }

  const toBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

  function downloadCanvas(cv, filename) {
    cv.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  /**
   * 把圖直接複製到剪貼簿，可貼進 LINE／訊息／簡報。
   * 需要 ClipboardItem（Chrome／Edge／Safari 有，Firefox 預設關閉），
   * 不支援時退回下載檔案。
   * @returns {Promise<'copied'|'downloaded'>}
   */
  async function copyCanvas(cv, filename) {
    try {
      if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) {
        throw new Error('no clipboard image support');
      }
      // ⚠ 必須把 Promise<Blob> 直接交給 ClipboardItem，不可先 await 再寫入——
      // 先 await 會耗掉使用者手勢的有效期，Safari 會直接拒絕寫入剪貼簿。
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(cv) })]);
      return 'copied';
    } catch (_) {
      downloadCanvas(cv, filename);
      return 'downloaded';
    }
  }

  /* ---------------- .ics（批次匯入 Google 日曆用） ---------------- */

  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\n/g, '\\n');

  function icsTime(dt) {
    return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + 'T'
      + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00Z';
  }

  /** RFC 5545 折行：每行至多 75 octets，續行以單一空白起頭 */
  function fold(line) {
    if (new TextEncoder().encode(line).length <= 75) return line;
    const out = [];
    let cur = '', len = 0;
    for (const ch of line) {
      const n = new TextEncoder().encode(ch).length;
      if (len + n > 75) { out.push(cur); cur = ' '; len = 1; }
      cur += ch; len += n;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /** 一律輸出 UTC（台灣無日光節約時間，換算無歧義，免掛 VTIMEZONE） */
  function buildICS(events, ctx) {
    const stamp = icsTime(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GoTime//開工吉時//ZH-TW',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    events.forEach((ev, i) => {
      lines.push('BEGIN:VEVENT',
        `UID:gotime-${stamp}-${i}@win-hs.github.io`,
        'DTSTAMP:' + stamp,
        'DTSTART:' + icsTime(ev.start),
        'DTEND:' + icsTime(ev.end),
        fold('SUMMARY:' + icsEsc(ev.title)),
        fold('LOCATION:' + icsEsc(ctx.place)),
        `GEO:${ctx.lat.toFixed(5)};${ctx.lon.toFixed(5)}`,
        fold('DESCRIPTION:' + icsEsc(ev.desc)),
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { buildText, buildImage, downloadCanvas, copyCanvas, buildICS, downloadText };
})();
