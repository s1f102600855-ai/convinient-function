'use strict';

(() => {
  const W = 960, H = 1200, RATIO = 2;
  const STORAGE_KEY = 'tegaki-note-v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const canvas = $('#draw-canvas'), ink = $('#ink-canvas');
  const liveCtx = canvas.getContext('2d'), inkCtx = ink.getContext('2d');
  const uid = () => globalThis.crypto?.randomUUID?.() || `page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const newPage = (title = '新しいページ') => ({id: uid(), title, paper: 'dot', strokes: [], created: Date.now(), updated: Date.now()});
  const firstPage = newPage('はじめのページ');
  let state = {format: 'tegaki-note', version: 1, pages: [firstPage], active: firstPage.id, updatedAt: Date.now()};
  let db = null, tool = 'pen', color = '#303e38', currentStroke = null, pointerId = null;
  let widths = {pen: 3, marker: 24, eraser: 26}, scale = 1, toastTimer, saveTimer;
  let dirty = false, saveQueue = Promise.resolve(), savedTime = 0, saving = false;
  const histories = new Map();
  const page = () => state.pages.find(p => p.id === state.active) || state.pages[0];
  const history = () => {
    if (!histories.has(page().id)) histories.set(page().id, {undo: [], redo: []});
    return histories.get(page().id);
  };

  function setSaveStatus(text, error = false) {
    const el = $('#save-state');
    el.classList.toggle('error', error);
    el.innerHTML = `${icon(error ? 'help' : 'check')}<span></span>`;
    el.querySelector('span').textContent = text;
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.toggle('error', error);
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 6500 : 3200);
  }
  function openDatabase() {
    return new Promise(resolve => {
      try {
        const request = indexedDB.open(STORAGE_KEY, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('notebooks');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  function readDatabase() {
    return new Promise(resolve => {
      try {
        const request = db.transaction('notebooks').objectStore('notebooks').get('main');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  function writeDatabase(snapshot) {
    if (!db) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('notebooks', 'readwrite');
        tx.objectStore('notebooks').put(snapshot, 'main');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('保存できませんでした'));
      } catch (e) { reject(e); }
    });
  }
  function save() {
    clearTimeout(saveTimer);
    if (!dirty) return saveQueue;
    const snapshot = structuredClone(state);
    dirty = false;
    saving = true;
    saveQueue = saveQueue.catch(() => {}).then(() => writeDatabase(snapshot)).then(() => {
      savedTime = Math.max(savedTime, snapshot.updatedAt);
      if (savedTime >= state.updatedAt) {
        saving = false;
        setSaveStatus('保存しました');
        if (db) {
          try {
            const recovery = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (recovery && recovery.updatedAt <= savedTime) localStorage.removeItem(STORAGE_KEY);
          } catch { /* IndexedDB remains the primary store. */ }
        }
      }
    }).catch(() => {
      dirty = true;
      saving = false;
      setSaveStatus('保存できませんでした', true);
      toast('保存領域を確認してください。「書き出す」からバックアップできます。', true);
    });
    return saveQueue;
  }
  function changed(immediate = false) {
    page().updated = Date.now();
    state.updatedAt = Math.max(Date.now(), state.updatedAt + 1);
    dirty = true;
    setSaveStatus('保存中…');
    clearTimeout(saveTimer);
    if (immediate) save(); else saveTimer = setTimeout(save, 280);
  }

  function drawStroke(ctx, stroke) {
    const pts = stroke.points;
    if (!pts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = stroke.tool === 'marker' ? .3 : 1;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.arc(pts[0][0], pts[0][1], stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const next = pts[i + 1];
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + next[0]) / 2, (pts[i][1] + next[1]) / 2);
      }
      ctx.lineTo(pts.at(-1)[0], pts.at(-1)[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  function resetCanvas(ctx) {
    ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0);
    ctx.clearRect(0, 0, W, H);
  }
  function renderInk() {
    resetCanvas(inkCtx);
    page().strokes.forEach(s => drawStroke(inkCtx, s));
    resetCanvas(liveCtx);
    $('#empty-hint').hidden = page().strokes.length > 0 || !!currentStroke;
    updateHistoryButtons();
  }
  function paperBackground(ctx, type, width = W, height = H) {
    ctx.fillStyle = '#fffefb';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e6eadd';
    ctx.beginPath();
    if (type === 'grid') {
      for (let x = 0; x <= width; x += 24) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); }
      for (let y = 0; y <= height; y += 24) { ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); }
      ctx.stroke();
    } else if (type === 'ruled') {
      ctx.strokeStyle = '#e1e7d9';
      for (let y = 131; y <= height; y += 36) { ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); }
      ctx.stroke();
    } else if (type === 'dot') {
      ctx.fillStyle = '#d5ddce';
      for (let x = 0; x <= width; x += 24) for (let y = 0; y <= height; y += 24) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  function drawThumbnail(target, p) {
    const ctx = target.getContext('2d');
    ctx.setTransform(target.width / W, 0, 0, target.height / H, 0, 0);
    paperBackground(ctx, p.paper);
    // Keep erasing confined to transparent ink so the paper stays intact.
    const layer = document.createElement('canvas');
    layer.width = target.width; layer.height = target.height;
    const lc = layer.getContext('2d');
    lc.setTransform(target.width / W, 0, 0, target.height / H, 0, 0);
    p.strokes.forEach(s => drawStroke(lc, s));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }
  function renderPageList() {
    const list = $('#page-list');
    list.replaceChildren();
    state.pages.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = `page-item${p.id === state.active ? ' active' : ''}`;
      item.setAttribute('role', 'button'); item.tabIndex = 0;
      item.setAttribute('aria-label', `${i + 1}ページ ${p.title}`);
      item.setAttribute('aria-current', p.id === state.active ? 'page' : 'false');
      item.dataset.pageId = p.id;
      const thumb = document.createElement('canvas');
      thumb.className = 'page-thumbnail'; thumb.width = 84; thumb.height = 108;
      thumb.setAttribute('aria-hidden', 'true');
      drawThumbnail(thumb, p);
      const text = document.createElement('div'); text.className = 'page-item-text';
      const title = document.createElement('div'); title.className = 'page-item-title'; title.textContent = p.title || '無題のページ';
      const meta = document.createElement('div'); meta.className = 'page-item-meta';
      const d = new Date(p.created);
      meta.textContent = `${String(i + 1).padStart(2, '0')}  ·  ${d.getMonth() + 1}月${d.getDate()}日`;
      text.append(title, meta); item.append(thumb, text);
      const del = document.createElement('button'); del.className = 'page-delete'; del.innerHTML = icon('trash');
      del.setAttribute('aria-label', `${p.title || '無題のページ'}を削除`);
      del.addEventListener('click', e => { e.stopPropagation(); deletePage(p.id); });
      item.append(del);
      item.addEventListener('click', () => switchPage(p.id));
      item.addEventListener('keydown', e => {
        if (e.target === item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchPage(p.id); }
      });
      list.append(item);
    });
    $('#page-count').textContent = state.pages.length;
  }
  function updateThumbnail() {
    const item = $$('.page-item').find(el => el.dataset.pageId === state.active);
    if (item) drawThumbnail(item.querySelector('canvas'), page());
  }
  function renderPage() {
    const p = page(), number = state.pages.indexOf(p) + 1;
    $('#page-title').value = p.title;
    $('#paper-type').value = p.paper;
    $('#paper').className = `paper paper-${p.paper}`;
    $('#paper-number').textContent = String(number).padStart(2, '0');
    $('#page-position').textContent = `PAGE ${String(number).padStart(2, '0')} / ${String(state.pages.length).padStart(2, '0')}`;
    $('#paper-date').textContent = new Intl.DateTimeFormat('en-US', {year: 'numeric', month: 'short', day: '2-digit'}).format(p.created).toUpperCase();
    renderInk(); renderPageList();
  }
  function switchPage(id) {
    finishStroke();
    state.active = id;
    changed(); renderPage();
    $('#workspace').scrollTop = 0;
    closeSidebar();
  }
  function updateHistoryButtons() {
    $('#undo').disabled = history().undo.length === 0;
    $('#redo').disabled = history().redo.length === 0;
    $('#clear-page').disabled = page().strokes.length === 0;
  }
  function record(operation) {
    history().undo.push(operation);
    if (history().undo.length > 150) history().undo.shift();
    history().redo.length = 0;
  }
  function undo() {
    finishStroke();
    const op = history().undo.pop(); if (!op) return;
    if (op.kind === 'stroke') page().strokes.pop(); else page().strokes = op.strokes;
    history().redo.push(op); renderInk(); updateThumbnail(); changed(true);
  }
  function redo() {
    finishStroke();
    const op = history().redo.pop(); if (!op) return;
    if (op.kind === 'stroke') page().strokes.push(op.stroke); else page().strokes = [];
    history().undo.push(op); renderInk(); updateThumbnail(); changed(true);
  }
  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - rect.left) * W / rect.width * 100) / 100, Math.round((e.clientY - rect.top) * H / rect.height * 100) / 100];
  }
  function startStroke(e) {
    if (e.button !== 0 || currentStroke) return;
    e.preventDefault(); closePopovers();
    pointerId = e.pointerId; canvas.setPointerCapture(pointerId);
    currentStroke = {tool, color, width: widths[tool], points: [pointFromEvent(e)]};
    $('#empty-hint').hidden = true;
    if (tool === 'eraser') drawStroke(inkCtx, currentStroke); else drawStroke(liveCtx, currentStroke);
  }
  function moveStroke(e) {
    if (!currentStroke || e.pointerId !== pointerId) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() || [e];
    // Some browser engines return an empty coalesced list for synthetic events.
    for (const event of events.length ? events : [e]) {
      const pt = pointFromEvent(event), prev = currentStroke.points.at(-1);
      if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < .4) continue;
      currentStroke.points.push(pt);
      if (currentStroke.tool === 'eraser') drawStroke(inkCtx, {...currentStroke, points: [prev, pt]});
    }
    if (currentStroke.tool !== 'eraser') {
      resetCanvas(liveCtx); drawStroke(liveCtx, currentStroke);
    }
  }
  function finishStroke(e) {
    if (!currentStroke || (e && e.pointerId !== pointerId)) return;
    if (e?.type === 'pointerup') moveStroke(e);
    const stroke = currentStroke, capturedId = pointerId;
    currentStroke = null; pointerId = null;
    if (capturedId !== null && canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId);
    page().strokes.push(stroke); record({kind: 'stroke', stroke});
    if (stroke.tool === 'eraser') renderInk();
    else { drawStroke(inkCtx, stroke); resetCanvas(liveCtx); updateHistoryButtons(); }
    updateThumbnail(); changed(true);
  }
  function setTool(next) {
    finishStroke(); tool = next;
    $$('.tool-button').forEach(el => { const active = el.dataset.tool === tool; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
    $('#active-tool-label').textContent = {pen: 'ペン', marker: 'マーカー', eraser: '消しゴム'}[tool];
    $('#pen-width').max = tool === 'eraser' ? 80 : tool === 'marker' ? 50 : 30;
    canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    updateWidth();
  }
  function setColor(value) {
    color = value;
    $$('.color-swatch').forEach(el => { const active = el.dataset.color === color; el.classList.toggle('selected', active); el.setAttribute('aria-pressed', String(active)); });
    $('.custom-color').classList.toggle('selected', !$$('.color-swatch').some(el => el.dataset.color === color));
    if (tool === 'eraser') setTool('pen');
  }
  function updateWidth() {
    const value = widths[tool];
    $('#width-label').textContent = `${value} px`; $('#width-output').textContent = `${value} px`;
    $('#pen-width').value = value;
    $('#width-preview').style.width = $('#width-preview').style.height = `${Math.max(3, Math.min(14, value))}px`;
  }
  function resizePaper() {
    const available = $('#workspace').clientWidth;
    scale = $('#zoom').value === 'fit' ? Math.max(.15, Math.min(1, (available - (available < 600 ? 32 : 80)) / W)) : Number($('#zoom').value);
    $('#paper').style.transform = `scale(${scale})`;
    $('#paper-wrap').style.width = `${W * scale}px`; $('#paper-wrap').style.height = `${H * scale}px`;
    $('#zoom').options[0].textContent = `自動 ${Math.round(scale * 100)}%`;
  }
  function stepZoom(direction) {
    const steps = [.5, .75, 1, 1.25, 1.5];
    const next = direction > 0 ? steps.find(v => v > scale + .01) : [...steps].reverse().find(v => v < scale - .01);
    $('#zoom').value = String(next ?? (direction > 0 ? 1.5 : .5)); resizePaper();
  }
  function closePopovers(except) {
    for (const name of ['width', 'export']) {
      if (name === except) continue;
      $(`#${name}-menu`).hidden = true; $(`#${name}-toggle`).setAttribute('aria-expanded', 'false');
    }
  }
  function togglePopover(name) {
    const menu = $(`#${name}-menu`), willOpen = menu.hidden;
    closePopovers(); menu.hidden = !willOpen;
    $(`#${name}-toggle`).setAttribute('aria-expanded', String(willOpen));
  }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-shade').hidden = true; }
  function confirmAction(title, description, action) {
    return new Promise(resolve => {
      const dialog = $('#confirm-dialog');
      $('#confirm-title').textContent = title; $('#confirm-description').textContent = description;
      $('#confirm-action').textContent = action; dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once: true});
      dialog.showModal();
    });
  }
  async function deletePage(id) {
    finishStroke();
    const target = state.pages.find(p => p.id === id); if (!target) return;
    if (!await confirmAction('このページを削除しますか？', `「${target.title || '無題のページ'}」を削除します。この操作は元に戻せません。`, 'ページを削除')) return;
    state.pages = state.pages.filter(p => p.id !== id); histories.delete(id);
    if (!state.pages.length) state.pages.push(newPage('はじめのページ'));
    if (state.active === id) state.active = state.pages[0].id;
    renderPage(); changed(true); toast('ページを削除しました');
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportPNG() {
    finishStroke(); closePopovers();
    const target = document.createElement('canvas'); target.width = W * 2; target.height = H * 2;
    const ctx = target.getContext('2d'); ctx.scale(2, 2); paperBackground(ctx, page().paper);
    ctx.fillStyle = '#b7c0ac'; ctx.font = '10px Arial'; ctx.textAlign = 'left';
    ctx.fillText($('#paper-date').textContent, 46, 45);
    ctx.textAlign = 'right'; ctx.fillText('TEGAKI NOTE', W - 46, 45);
    ctx.drawImage(ink, 0, 0, W, H); ctx.textAlign = 'center';
    ctx.fillText($('#paper-number').textContent, W / 2, H - 30);
    target.toBlob(blob => {
      if (!blob) { toast('画像を作成できませんでした', true); return; }
      const title = (page().title || '無題のページ').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
      download(blob, `${title}.png`); toast('ページをPNG画像で書き出しました');
    }, 'image/png');
  }
  function validNotebook(input) {
    if (!input || input.format !== 'tegaki-note' || input.version !== 1 || !Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 200) throw new Error('てがきノートのバックアップファイルを選んでください。');
    let pointCount = 0;
    const pages = input.pages.map(p => {
      if (!p || typeof p.title !== 'string' || !Array.isArray(p.strokes) || !['dot', 'grid', 'ruled', 'plain'].includes(p.paper)) throw new Error('ノートの形式が正しくありません。');
      const strokes = p.strokes.map(s => {
        if (!s || !['pen', 'marker', 'eraser'].includes(s.tool) || !/^#[0-9a-f]{6}$/i.test(s.color) || !Number.isFinite(s.width) || s.width < 1 || s.width > 100 || !Array.isArray(s.points)) throw new Error('描画データの形式が正しくありません。');
        pointCount += s.points.length;
        if (pointCount > 1500000) throw new Error('描画データが大きすぎます。');
        const points = s.points.map(pt => {
          if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(Number.isFinite) || Math.abs(pt[0]) > 100000 || Math.abs(pt[1]) > 100000) throw new Error('座標データの形式が正しくありません。');
          return [pt[0], pt[1]];
        });
        return {tool: s.tool, color: s.color, width: s.width, points};
      });
      return {id: typeof p.id === 'string' ? p.id : uid(), title: p.title.slice(0, 60), paper: p.paper, strokes, created: Number.isFinite(p.created) && Math.abs(p.created) < 8640000000000000 ? p.created : Date.now(), updated: Date.now()};
    });
    const used = new Set();
    for (const p of pages) { if (used.has(p.id)) p.id = uid(); used.add(p.id); }
    return {format: 'tegaki-note', version: 1, pages, active: pages.some(p => p.id === input.active) ? input.active : pages[0].id, updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now()};
  }

  async function initialize() {
    db = await openDatabase();
    let stored = db ? await readDatabase() : null;
    try {
      const recovery = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (recovery && (!stored || recovery.updatedAt > stored.updatedAt)) stored = recovery;
    } catch { /* Storage may be blocked; saving will display an actionable error. */ }
    if (stored) {
      try { state = validNotebook(stored); savedTime = state.updatedAt; }
      catch { toast('保存されたノートを読み込めませんでした。バックアップから読み込めます。', true); }
    }
    renderPage(); resizePaper();
    new ResizeObserver(resizePaper).observe($('#workspace'));
    canvas.addEventListener('pointerdown', startStroke);
    canvas.addEventListener('pointermove', moveStroke);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    canvas.addEventListener('lostpointercapture', finishStroke);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    $$('.tool-button').forEach(el => el.addEventListener('click', () => setTool(el.dataset.tool)));
    $$('.color-swatch').forEach(el => el.addEventListener('click', () => setColor(el.dataset.color)));
    $('#custom-color').addEventListener('input', e => setColor(e.target.value));
    $('#pen-width').addEventListener('input', e => { widths[tool] = Number(e.target.value); updateWidth(); });
    $$('[data-width]').forEach(el => el.addEventListener('click', () => { widths[tool] = Number(el.dataset.width); updateWidth(); }));
    $('#width-toggle').addEventListener('click', () => togglePopover('width'));
    $('#export-toggle').addEventListener('click', () => togglePopover('export'));
    document.addEventListener('click', e => { if (!e.target.closest('.popover-anchor')) closePopovers(); });
    $('#undo').addEventListener('click', undo); $('#redo').addEventListener('click', redo);
    $('#add-page').addEventListener('click', () => {
      finishStroke();
      if (state.pages.length >= 200) { toast('ページは200枚までです。バックアップを保存して整理してください。', true); return; }
      const next = newPage(); state.pages.push(next); state.active = next.id;
      renderPage(); changed(true); closeSidebar(); $('#workspace').scrollTop = 0;
      $('#page-title').focus(); $('#page-title').select();
    });
    $('#page-title').addEventListener('input', e => {
      page().title = e.target.value; changed();
      const item = $$('.page-item').find(el => el.dataset.pageId === state.active);
      if (item) {
        const title = page().title || '無題のページ';
        item.querySelector('.page-item-title').textContent = title;
        item.setAttribute('aria-label', `${state.pages.indexOf(page()) + 1}ページ ${title}`);
        item.querySelector('.page-delete').setAttribute('aria-label', `${title}を削除`);
      }
    });
    $('#page-title').addEventListener('blur', () => {
      if (!page().title.trim()) { page().title = '無題のページ'; $('#page-title').value = page().title; changed(); }
      renderPageList();
    });
    $('#page-title').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
    $('#paper-type').addEventListener('change', e => { page().paper = e.target.value; $('#paper').className = `paper paper-${page().paper}`; updateThumbnail(); changed(true); });
    $('#zoom').addEventListener('change', resizePaper);
    $('#zoom-in').addEventListener('click', () => stepZoom(1)); $('#zoom-out').addEventListener('click', () => stepZoom(-1));
    $('#clear-page').addEventListener('click', async () => {
      finishStroke(); if (!page().strokes.length) return;
      if (!await confirmAction('ページをまっさらにしますか？', 'このページの手書きをすべて消します。「元に戻す」で復元できます。', 'クリアする')) return;
      record({kind: 'clear', strokes: page().strokes}); page().strokes = [];
      renderInk(); updateThumbnail(); changed(true); toast('ページをクリアしました。元に戻すこともできます。');
    });
    $('#export-png').addEventListener('click', exportPNG);
    $('#export-json').addEventListener('click', () => {
      finishStroke(); closePopovers();
      download(new Blob([JSON.stringify(state)], {type: 'application/json'}), `てがきノート_${new Date().toLocaleDateString('sv-SE')}.json`);
      toast('すべてのページをバックアップしました');
    });
    $('#import-json').addEventListener('click', () => { closePopovers(); $('#import-file').click(); });
    $('#import-file').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        if (file.size > 35 * 1024 * 1024) throw new Error('35MB以下のファイルを選んでください。');
        const imported = validNotebook(JSON.parse(await file.text()));
        if (imported.pages.length + state.pages.length > 200) throw new Error('合計200ページ以内で読み込んでください。');
        imported.pages.forEach(p => { p.id = uid(); });
        finishStroke(); state.pages.push(...imported.pages); state.active = imported.pages[0].id;
        renderPage(); changed(true); toast(`${imported.pages.length}ページを読み込みました`);
      } catch (error) { toast(error instanceof SyntaxError ? 'JSON形式のバックアップを選んでください。' : error.message, true); }
      finally { e.target.value = ''; }
    });
    $('#help').addEventListener('click', () => { closeSidebar(); $('#help-dialog').showModal(); });
    $('#close-help').addEventListener('click', () => $('#help-dialog').close());
    $('#mobile-menu').addEventListener('click', () => { $('#sidebar').classList.toggle('open'); $('#sidebar-shade').hidden = !$('#sidebar').classList.contains('open'); });
    $('#sidebar-shade').addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closePopovers(); closeSidebar(); }
      if (e.target.closest('input,textarea,select,[contenteditable="true"]') || $('dialog[open]')) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && ['p', 'h', 'e'].includes(key)) setTool({p: 'pen', h: 'marker', e: 'eraser'}[key]);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { finishStroke(); save(); } });
    window.addEventListener('beforeunload', () => {
      finishStroke();
      if (dirty || saving || state.updatedAt > savedTime) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the last committed database version. */ }
      }
    });
    if (!stored) { dirty = true; save(); }
    document.documentElement.dataset.ready = 'true';
  }
  initialize().catch(() => { setSaveStatus('初期化できませんでした', true); toast('ページを再読み込みしてください。', true); });
})();
