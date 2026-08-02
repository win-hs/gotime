/* 顯示設定：要顯示哪些資料卡、多日總覽天數、雷達與降水預報開關。
   存 localStorage，每台裝置各自記住。 */

const Settings = (function () {
  const KEY = 'gotime.display';

  // 面板上的四個勾選框；同時也控制多日總覽的對應次要行
  const CARDS = [
    { id: 'weather', label: '天氣' },
    { id: 'moon', label: '月相' },
    { id: 'sun', label: '日出/落' },
    { id: 'tide', label: '潮汐' },
  ];

  const RANGES = [{ id: 3, label: '3 天' }, { id: 7, label: '1 週' }];

  const DEFAULTS = {
    cards: { weather: true, moon: true, sun: true, tide: true },
    days: 7,
    radar: false,   // 需下載約 700 KB 回波圖，預設不開
    qpf: false,
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
        if (s && (s.days === 3 || s.days === 7)) current.days = s.days;
        if (s && typeof s.radar === 'boolean') current.radar = s.radar;
        if (s && typeof s.qpf === 'boolean') current.qpf = s.qpf;
      }
    } catch (_) { /* 壞掉的設定直接用預設 */ }
    return current;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(current)); return true; }
    catch (_) { return false; }
  }

  const on = (id) => load().cards[id] !== false;
  const days = () => load().days;
  const radar = () => load().radar === true;
  const qpf = () => load().qpf === true;

  function set(id, val) { load().cards[id] = !!val; return save(); }
  function setDays(n) { load().days = n === 3 ? 3 : 7; return save(); }
  function setRadar(v) { load().radar = !!v; return save(); }
  function setQpf(v) { load().qpf = !!v; return save(); }

  return { CARDS, RANGES, load, save, on, days, radar, qpf, set, setDays, setRadar, setQpf, available };
})();
