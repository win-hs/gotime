/* 顯示設定：要顯示哪些卡片、多日總覽天數。存 localStorage，每台裝置各自記住。 */

const Settings = (function () {
  const KEY = 'gotime.display';

  const CARDS = [
    { id: 'sun',     label: '日出日落', hint: '含三段曙暮光' },
    { id: 'moon',    label: '月相',     hint: '月出月落與照度' },
    { id: 'tide',    label: '潮汐',     hint: '滿乾潮與整月潮汐表' },
    { id: 'weather', label: '天氣',     hint: '氣象署鄉鎮預報' },
    { id: 'radar',   label: '降雨與雷達回波', hint: '鄰近雨量站與回波疊圖' },
    { id: 'multi',   label: '多日總覽', hint: '一次看多天的各項資訊' },
    { id: 'plan',    label: '調查時段', hint: '依規則算出出勤時段' },
  ];

  const RANGES = [
    { id: 3, label: '3 天' },
    { id: 7, label: '1 週' },
  ];

  const DEFAULTS = {
    cards: { sun: true, moon: true, tide: true, weather: true, radar: true, multi: true, plan: true },
    days: 7,
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

  function set(id, val) { load().cards[id] = !!val; return save(); }
  function setDays(n) { load().days = n === 3 ? 3 : 7; return save(); }
  function reset() { current = JSON.parse(JSON.stringify(DEFAULTS)); return save(); }

  return { CARDS, RANGES, load, save, on, days, set, setDays, reset, available };
})();
