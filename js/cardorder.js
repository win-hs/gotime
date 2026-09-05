/*
 * 卡片排序：標題列的把手可拖曳改變順序，存 localStorage（每台裝置各自記住）。
 *
 * 用 Pointer Events 而非 HTML5 drag-and-drop：後者在觸控裝置上完全不作用，
 * 而這是野外會用手機開的工具，手機不能排序等於功能只做一半。
 */

const CardOrder = (function () {
  const KEY = 'gotime.cardorder';
  let stack = null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...stack.children].map((el) => el.id)));
    } catch (_) { /* 存不了就只是這次不記住，不影響操作 */ }
  }

  /**
   * 套用存檔順序。存檔裡沒提到的卡片（改版後新增的）會留在最前面，
   * 而不是被丟掉或塞到看不見的地方。
   */
  function apply() {
    let order;
    try {
      const raw = localStorage.getItem(KEY);
      order = raw ? JSON.parse(raw) : null;
    } catch (_) { return; }
    if (!Array.isArray(order)) return;
    for (const id of order) {
      const el = document.getElementById(id);
      if (el && el.parentElement === stack) stack.appendChild(el);
    }
  }

  /*
   * move／up 掛在 window 而非把手上，也不用 setPointerCapture：
   * 捕獲一旦被瀏覽器收回（捲動、切視窗、觸控手勢接管）就再也收不到 pointerup，
   * 卡片會卡在 dragging 狀態、順序也存不進去。掛 window 沒有這個失敗模式。
   */
  function startDrag(card, ev) {
    ev.preventDefault();                       // 擋掉選字與觸控捲動
    card.classList.add('dragging');

    function move(e) {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const over = under && under.closest('.card');
      if (!over || over === card || over.parentElement !== stack) return;

      const r = over.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      // 兩張卡在同一排（並排的窄卡）就比左右，否則比上下
      const sameRow = Math.abs(r.top - c.top) < Math.min(r.height, c.height) / 2;
      const after = sameRow ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
      stack.insertBefore(card, after ? over.nextSibling : over);
    }

    function end() {
      card.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      save();
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /** 在每張卡的標題列插入把手；把手由此產生，不必在 HTML 裡重複七次 */
  function init(stackEl) {
    stack = stackEl;
    apply();
    for (const card of [...stack.children]) {
      const h2 = card.querySelector('h2');
      if (!h2) continue;
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'drag-h';
      grip.textContent = '⠿';
      grip.title = '按住拖曳可調整卡片順序';
      grip.setAttribute('aria-label', '拖曳排序');
      h2.insertBefore(grip, h2.firstChild);
      grip.addEventListener('pointerdown', (e) => startDrag(card, e));
    }
  }

  return { init };
})();
