/* 顯示設定：資料卡開關、曙暮光列、天數、雷達。存 localStorage，每台裝置各自記住。 */

const Settings = (function () {
  const KEY = 'gotime.display';

  // 面板上的勾選框；同時決定天氣預報表要出現哪些列
  const CARDS = [
    { id: 'weather', label: '天氣', locked: true },   // 主資料，不可取消
    { id: 'moon', label: '月相' },
    { id: 'sun', label: '日出/落' },
    { id: 'tide', label: '潮汐' },
  ];

  // 日出/落卡裡可勾選的曙暮光（各含晨昏兩個時刻）
  const TWILIGHTS = [
    { id: 'twAstro', label: '天文曙暮光', keys: ['astroDawn', 'astroDusk'] },
    { id: 'twNautical', label: '航海曙暮光', keys: ['nauticalDawn', 'nauticalDusk'] },
    { id: 'twCivil', label: '民用曙暮光', keys: ['civilDawn', 'civilDusk'] },
  ];

  const RANGES = [{ id: 3, label: '3 天' }, { id: 7, label: '1 週' }];

  const DEFAULTS = {
    cards: { weather: true, moon: true, sun: true, tide: true },
    tw: { twAstro: true, twNautical: true, twCivil: true },
    days: 7,
    radar: false,   // 需下載約 700 KB 回波圖，預設不開
  };

  let current = null;

  function available() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (_) { return false; }
  }

  function load() {
    if (current) return current;
    current = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.cards) Object.assign(current.cards, s.cards);
        if (s && s.tw) Object.assign(current.tw, s.tw);
        if (s && (s.days === 3 || s.days === 7)) current.days = s.days;
        if (s && typeof s.radar === 'boolean') current.radar = s.radar;
      }
    } catch (_) { /* 壞掉的設定直接用預設 */ }
    current.cards.weather = true;   // 天氣為主資料，強制開啟
    return current;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(current)); return true; }
    catch (_) { return false; }
  }

  const on = (id) => load().cards[id] !== false;
  const tw = (id) => load().tw[id] !== false;
  const days = () => load().days;
  const radar = () => load().radar === true;

  function set(id, val) {
    if (id === 'weather') return false;            // 不可關閉
    load().cards[id] = !!val; return save();
  }
  function setTw(id, val) { load().tw[id] = !!val; return save(); }
  function setDays(n) { load().days = n === 3 ? 3 : 7; return save(); }
  function setRadar(v) { load().radar = !!v; return save(); }

  /** 供「分享本頁面（含所有設定）」序列化／還原 */
  function snapshot() { return JSON.parse(JSON.stringify(load())); }
  function restore(s) {
    if (!s) return;
    current = JSON.parse(JSON.stringify(DEFAULTS));
    if (s.cards) Object.assign(current.cards, s.cards);
    if (s.tw) Object.assign(current.tw, s.tw);
    if (s.days === 3 || s.days === 7) current.days = s.days;
    if (typeof s.radar === 'boolean') current.radar = s.radar;
    current.cards.weather = true;
    save();
  }

  return { CARDS, TWILIGHTS, RANGES, load, save, on, tw, days, radar,
    set, setTw, setDays, setRadar, available, snapshot, restore };
})();
