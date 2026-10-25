(() => {
  'use strict';
  const CONFIG = Object.freeze(window.UNKNOWN_CONFIG || {});
  const WORKS = ['serial', 'shorts'];
  const STORAGE = 'unknown-archive-v1';
  const el = {
    home: document.getElementById('homeView'), sub: document.getElementById('subView'),
    menu: document.getElementById('menuToggle'), nav: document.getElementById('mainNav'),
    dialog: document.getElementById('ageDialog'), cancel: document.getElementById('ageCancel'),
    proceed: document.getElementById('ageContinue')
  };
  const state = { stories: [], syncError: false, pending: null, ageOK: false, visited: [], lastSerial: '', fontSize: 18, readerMode: 'light' };
  const storageRead = (key, fallback = '') => { try { return localStorage.getItem(STORAGE + ':' + key) ?? fallback; } catch (_) { return fallback; } };
  const storageWrite = (key, val) => { try { localStorage.setItem(STORAGE + ':' + key, String(val)); } catch (_) {} };
  const sessionRead = key => { try { return sessionStorage.getItem(STORAGE + ':' + key); } catch (_) { return null; } };
  const sessionWrite = (key, val) => { try { sessionStorage.setItem(STORAGE + ':' + key, val); } catch (_) {} };
  state.ageOK = sessionRead('age') === 'yes';
  try { const parsed = JSON.parse(storageRead('visited', '[]')); state.visited = Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string').slice(-300) : []; } catch (_) {}
  state.lastSerial = storageRead('last-serial');
  state.fontSize = Math.min(24, Math.max(15, Number(storageRead('font-size', '18')) || 18));
  state.readerMode = storageRead('reader-mode', 'light') === 'dark' ? 'dark' : 'light';

  const serialName = CONFIG.serialTitle || 'The Distance Between Us';
  const shortName = CONFIG.shortTitle || '獨立短篇集';
  const serialStatus = CONFIG.serialStatus || '連載';
  const pad = n => String(n).padStart(2, '0');
  const safeText = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelCP = item => Array.isArray(item.cp) && item.cp.length ? item.cp.join('、') : '未標示 CP';
  const isAdult = item => /18\+|r18|成人|限制|explicit/i.test(String(item.ageRating || ''));
  const chapterName = item => 'Chapter ' + pad(item.chapterNumber ?? 0);
  const safeUrl = raw => { if (typeof raw !== 'string' || !raw.trim()) return null; try { const u = new URL(raw); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch (_) { return null; } };
  const safeMedia = raw => {
    if (typeof raw !== 'string') return null;
    if (/^\.\/assets\/notion\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|gif)$/.test(raw)) return raw;
    return safeUrl(raw);
  };
  const articleHref = item => `#read/${encodeURIComponent(item.work)}/${encodeURIComponent(item.slug)}`;
  const listFor = work => state.stories.filter(x => x.work === work).sort((a, b) => {
    if (work === 'serial') return (a.chapterNumber || 0) - (b.chapterNumber || 0) || a.slug.localeCompare(b.slug);
    return (b.publishedAt || '').localeCompare(a.publishedAt || '') || (b.chapterNumber || 0) - (a.chapterNumber || 0);
  });
  const found = (work, slug) => state.stories.find(x => x.work === work && x.slug === slug);
  const visited = item => state.visited.includes(item.work + ':' + item.slug);
  const dateText = raw => /^\d{4}-\d\d-\d\d/.test(raw || '') ? raw.slice(0, 10).replaceAll('-', '.') : '';
  const setTitle = name => { document.title = name + ' | UNKNOWN — SAKURAI_TK'; };
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' });
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
  const crumb = (where, type) => `<nav class="crumbs" aria-label="麵包屑導覽"><a href="#home">首頁</a><span>/</span>${type ? `<a href="#series/${type}">${safeText(type === 'serial' ? serialName : shortName)}</a><span>/</span>` : ''}<span>${safeText(where)}</span></nav>`;

  function markVisit(item) {
    const key = item.work + ':' + item.slug;
    if (!state.visited.includes(key)) { state.visited.push(key); storageWrite('visited', JSON.stringify(state.visited.slice(-300))); }
    if (item.work === 'serial') { state.lastSerial = item.slug; storageWrite('last-serial', item.slug); }
  }
  function navUpdate(page) {
    el.nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.nav === page));
  }
  function updateHome() {
    const serial = listFor('serial').length, shorts = listFor('shorts').length;
    const node = document.getElementById('homeCounts');
    if (!node) return;
    node.textContent = `目前公開：${serial} 章連載 · ${shorts} 篇獨立短篇。只顯示 Notion 已發布且勾選網站公開的文章。`;
  }
  function header(name, title, subtitle, image) {
    return `<header class="sub-banner" style="--banner-image:url('${image}')"><div class="inner-shell sub-banner-content">${crumb(name)}<p class="banner-kicker">${safeText(subtitle)}</p><h1>${safeText(title)}</h1><p class="banner-desc">${name === 'serial' ? '在時間的縫隙裡，循著每一章的腳步，慢慢走近那些還沒說出口的心事。' : '不同時間裡的片刻，各有自己的起點與終點。從任何一篇開始都可以。'}</p></div></header>`;
  }
  function showSerial() {
    const items = listFor('serial');
    setTitle(serialName);
    const first = items[0];
    const last = items.find(x => x.slug === state.lastSerial) || null;
    el.sub.innerHTML = header('serial', serialName, '01 / FEATURED SERIAL · 連續劇情', './assets/serial-window.svg') +
      `<div class="inner-shell series-content">
        <div class="status-row"><span class="tiny-tag">${safeText(serialStatus)}</span><span class="plain">${items.length} 章已公開 · 依連續劇情順序閱讀</span></div>
        <div class="series-cta-row"><button id="startSerial" class="primary-button" type="button" ${first ? '' : 'disabled'}>從第一章開始閱讀 <span>→</span></button>${last ? `<button class="ghost-button" type="button" id="resumeSerial">接續閱讀 ${safeText(chapterName(last))} →</button>` : ''}</div>
        <div class="series-header"><h2>章節目錄</h2><span class="small-meta">${items.length} CHAPTERS</span></div>
        <div class="chapter-board"><div class="chapter-head"><span>THE CHAPTERS / 連載目錄</span></div><div id="chapterRows"></div></div>
      </div>`;
    document.getElementById('startSerial').addEventListener('click', () => first && openItem(first));
    if (last) document.getElementById('resumeSerial').addEventListener('click', () => openItem(last));
    const rows = document.getElementById('chapterRows');
    function paint() {
      rows.replaceChildren();
      if (!items.length) {
        const div = document.createElement('div'); div.className = 'chapter-empty';
        div.innerHTML = '<strong>連載正在準備中</strong>尚未有符合公開設定的章節；草稿不會出現在這裡。';
        rows.append(div); return;
      }
      for (const item of items) {
        const b = document.createElement('button'); b.className = 'chapter-row'; b.type = 'button';
        const isRead = visited(item);
        b.innerHTML = `<span class="chapter-number">${pad(item.chapterNumber)}</span><span class="chapter-main"><span class="chapter-title">${safeText(item.title || chapterName(item))}</span>${item.subtitle ? `<span class="chapter-subtitle">${safeText(item.subtitle)}</span>` : ''}${isRead ? '<span class="chapter-read">曾經閱讀</span>' : ''}${isAdult(item) ? '<span class="chapter-adult">18+</span>' : ''}</span><span class="chapter-last">${safeText(dateText(item.publishedAt))}</span><span class="chapter-arrow">↗</span>`;
        b.setAttribute('aria-label', `閱讀 ${item.title || chapterName(item)}`); b.addEventListener('click', () => openItem(item)); rows.append(b);
      }
    }
    paint();
  }
  function showShorts() {
    const items = listFor('shorts');
    setTitle(shortName);
    el.sub.innerHTML = header('shorts', shortName, '02 / SHORT STORY COLLECTION · 獨立短篇', './assets/short-stories.svg') +
      `<div class="inner-shell series-content"><div class="series-header"><h2>全部獨立短篇</h2><span class="small-meta">${items.length} PUBLIC STORIES</span></div>
       <div class="filter-bar"><input type="search" id="storySearch" aria-label="搜尋篇名或CP" placeholder="搜尋篇名或 CP…"><select id="cpFilter" aria-label="篩選CP"><option value="">全部 CP</option></select><select id="ratingFilter" aria-label="篩選分級"><option value="">全部分級</option><option value="general">一般</option><option value="adult">18+</option></select><select id="sortFilter" aria-label="排序方式"><option value="newest">最新發布</option><option value="oldest">最早發布</option><option value="order">自訂順序</option></select></div><div id="storiesList" class="story-list" aria-live="polite"></div><p class="count-note" id="shortSummary"></p></div>`;
    const search = document.getElementById('storySearch');
    const cp = document.getElementById('cpFilter');
    const rating = document.getElementById('ratingFilter');
    const sort = document.getElementById('sortFilter');
    const target = document.getElementById('storiesList');
    const cpOptions = [...new Set(items.flatMap(x => Array.isArray(x.cp) ? x.cp : []))].filter(Boolean).sort();
    cpOptions.forEach(value => { const opt = document.createElement('option'); opt.value = value; opt.textContent = value; cp.append(opt); });
    function paint() {
      const q = search.value.trim().toLocaleLowerCase();
      const rows = items.filter(item => (!q || (item.title + ' ' + labelCP(item)).toLocaleLowerCase().includes(q)) && (!cp.value || (item.cp || []).includes(cp.value)) && (!rating.value || (rating.value === 'adult') === isAdult(item)));
      rows.sort((a, b) => sort.value === 'order' ? (a.chapterNumber || 0) - (b.chapterNumber || 0) : sort.value === 'oldest' ? (a.publishedAt || '').localeCompare(b.publishedAt || '') : (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      target.replaceChildren();
      if (!rows.length) {
        const empty = document.createElement('div'); empty.className = 'empty';
        empty.innerHTML = items.length ? '<strong>找不到符合條件的故事</strong>請調整搜尋與篩選條件。' : '<strong>短篇集正在整理中</strong>公開的短篇同步完成後會自動顯示在這裡。';
        target.append(empty);
      }
      rows.forEach((item, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'story-row';
        b.innerHTML = `<span class="story-no">${pad(i + 1)}</span><span class="story-main"><strong>${safeText(item.title)}</strong><small>${safeText(dateText(item.publishedAt))}${visited(item) ? ' · 曾經閱讀' : ''}</small></span><span class="story-cp">${safeText(labelCP(item))}</span><span class="rating-tag${isAdult(item) ? ' adult' : ''}">${isAdult(item) ? '18+' : '一般'}</span><span class="story-arrow">↗</span>`;
        b.setAttribute('aria-label', `閱讀 ${item.title}`); b.addEventListener('click', () => openItem(item)); target.append(b);
      });
      document.getElementById('shortSummary').textContent = `顯示 ${rows.length} / ${items.length} 篇已公開故事`;
    }
    search.addEventListener('input', paint); [cp, rating, sort].forEach(x => x.addEventListener('change', paint)); paint();
  }
  function showAbout() {
    setTitle('關於本站');
    el.sub.innerHTML = `<div class="inner-shell about-view">${crumb('關於本站')}<p class="section-label" style="margin-top:65px">ABOUT / THE ARCHIVE</p><h1>故事或許沒有答案。</h1><p>《關於未知的我們》是 SAKURAI_TK 的非官方二次創作檔案。這裡包含連續故事《${safeText(serialName)}》與可以自由閱讀的獨立短篇。網站以 Notion 作為文章管理來源，保留作者原本的文字格式與明確設定的超連結。</p><div class="about-card"><h2>文章公開原則</h2><p>只有在 Notion 設為「已發布」，同時勾選「網站公開」且屬於本作品的文章，才會匯出。未公開的草稿不會顯示於網站。</p><h2>閱讀分級</h2><p>18+ 文章顯示成年提醒；提醒並非真實年齡驗證。</p><h2>著作權說明</h2><p>本網站是非官方同人創作作品集，與原劇製作方、發行方及權利人沒有官方關係。網站圖片以授權清楚的免費圖庫攝影為目標；過渡期使用原創視覺素材，並非官方劇照。</p></div></div>`;
  }
  function showMissing() {
    setTitle('找不到頁面');
    el.sub.innerHTML = `<div class="inner-shell about-view">${crumb('找不到頁面')}<h1>這個故事暫時無法抵達。</h1><p>文章可能尚未公開或網址有誤。</p><a class="ghost-button" href="#home">返回首頁 →</a></div>`;
  }
  function openItem(item) {
    if (isAdult(item) && !state.ageOK) {
      state.pending = item;
      if (el.dialog.showModal) el.dialog.showModal();
      else if (window.confirm('這篇標示為 18+，請確認您已達法定成年年齡。')) allowAge();
      return;
    }
    go(articleHref(item));
  }
  function allowAge() {
    state.ageOK = true; sessionWrite('age', 'yes');
    if (el.dialog.open) el.dialog.close();
    if (state.pending) { const item = state.pending; state.pending = null; go(articleHref(item)); }
  }
  el.proceed.addEventListener('click', allowAge);
  el.cancel.addEventListener('click', () => { state.pending = null; if (el.dialog.open) el.dialog.close(); });
  el.dialog.addEventListener('cancel', () => { state.pending = null; });

  function appendRich(target, runs) {
    for (const part of runs || []) {
      const content = String(part?.text ?? ''); if (!content) continue;
      let child = part.code ? document.createElement('code') : document.createElement('span');
      child.textContent = content;
      if (part.bold) child.style.fontWeight = '700';
      if (part.italic) child.style.fontStyle = 'italic';
      if (part.underline) child.style.textDecoration = 'underline';
      if (part.strikethrough) child.style.textDecoration = 'line-through';
      const link = safeUrl(part.href) || (content.trim() === content && /^https?:\/\/\S+$/.test(content) ? safeUrl(content) : null);
      if (link) { const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(child); target.append(a); }
      else target.append(child);
    }
  }
  function buildBlock(b, headings) {
    const t = b.type || 'paragraph';
    if (t === 'divider') return document.createElement('hr');
    if (t === 'image') {
      const path = safeMedia(b.url); if (!path) return document.createDocumentFragment();
      const fig = document.createElement('figure'), img = document.createElement('img'); img.loading = 'lazy'; img.src = path; img.alt = b.caption || '文章插圖'; fig.append(img);
      if (b.caption) { const cap = document.createElement('figcaption'); cap.textContent = b.caption; fig.append(cap); }
      return fig;
    }
    if (t === 'table_row') {
      const tr = document.createElement('tr'); (b.cells || []).forEach(cell => { const td = document.createElement('td'); appendRich(td, cell); tr.append(td); }); return tr;
    }
    const tag = ({heading_1:'h2',heading_2:'h2',heading_3:'h3',bulleted_list_item:'li',numbered_list_item:'li',quote:'blockquote',code:'pre',callout:'div',toggle:'details',to_do:'div',table:'table'})[t] || 'p';
    const el = document.createElement(tag);
    if (headings.has(b)) el.id = headings.get(b);
    if (t === 'code') { const code = document.createElement('code'); appendRich(code, b.runs); el.append(code); }
    else if (t === 'toggle') { const summary = document.createElement('summary'); appendRich(summary, b.runs); el.append(summary); }
    else if (t === 'callout') { el.className = 'callout'; appendRich(el, b.runs); }
    else if (t === 'to_do') { el.className = 'to-do'; const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!b.checked; chk.disabled = true; el.append(chk); appendRich(el, b.runs); }
    else appendRich(el, b.runs);
    if (Array.isArray(b.children) && b.children.length) {
      const wrap = document.createElement(t === 'table' ? 'tbody' : 'div'); wrap.append(...renderNodes(b.children, headings)); el.append(wrap);
    }
    return el;
  }
  function renderNodes(blocks, headings = new Map()) {
    const result = []; let group = null; let kind = '';
    const flush = () => { if (group) result.push(group); group = null; kind = ''; };
    for (const b of blocks || []) {
      if (['bulleted_list_item', 'numbered_list_item'].includes(b.type)) {
        const wanted = b.type === 'bulleted_list_item' ? 'ul' : 'ol';
        if (kind !== wanted) { flush(); kind = wanted; group = document.createElement(kind); }
        group.append(buildBlock(b, headings));
      } else { flush(); result.push(buildBlock(b, headings)); }
    }
    flush(); return result;
  }
  function youtubeLinks(blocks) {
    const out = new Set();
    function walk(nodes) { for (const b of nodes || []) { for (const run of b.runs || []) { for (const candidate of [run.href, run.text]) { if (typeof candidate !== 'string') continue; const match = candidate.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s<>"']*v=[\w-]+|youtu\.be\/[\w-]+)/i); if (match && safeUrl(match[0])) out.add(safeUrl(match[0])); } } walk(b.children); } }
    walk(blocks); return [...out];
  }
  function partHeadings(blocks) {
    const out = [], regex = /^(?:第[一二三四五六七八九十\d]+章|chapter\s*[\divx]+\b)/i;
    const walk = nodes => { for (const b of nodes || []) { const title = (b.runs || []).map(x => x.text || '').join('').trim(); if (['heading_2', 'heading_3'].includes(b.type) && regex.test(title)) out.push({b, title}); walk(b.children); } }; walk(blocks); return out;
  }
  function showReader(item) {
    if (isAdult(item) && !state.ageOK) { state.pending = item; if (el.dialog.showModal) el.dialog.showModal(); return; }
    markVisit(item);
    setTitle(item.title);
    const all = listFor(item.work); const idx = all.findIndex(x => x.slug === item.slug);
    const prev = all[idx - 1], next = all[idx + 1];
    const section = item.work === 'serial' ? serialName : shortName;
    el.sub.innerHTML = `<article class="reader-layout" id="readerLayout" data-mode="${state.readerMode}" style="--reader-font-size:${state.fontSize}px"><div id="readProgress" class="reader-progress"></div><div class="inner-shell"><div class="reader-topbar">${crumb(item.work === 'serial' ? chapterName(item) : item.title, item.work)}<div class="reader-tools"><button type="button" id="fontDown" aria-label="縮小字體" title="縮小字體">A−</button><button type="button" id="fontUp" aria-label="放大字體" title="放大字體">A+</button><button type="button" id="readerMode" aria-label="切換閱讀配色" title="切換閱讀配色">${state.readerMode === 'dark' ? '☀' : '☾'}</button></div></div></div><div class="reader-paper"><p class="reader-kicker">${safeText(section)} ${item.work === 'serial' ? ' / ' + safeText(chapterName(item)) : ' / SHORT STORY'}</p><h1 class="reader-title" id="readerArticleTitle"></h1><p class="reader-article-subtitle" id="readerArticleSubtitle" hidden></p><div class="reader-meta" id="readerMeta"></div><div class="reader-rule"></div><div id="readerToc"></div><div id="readerContent" class="reader-content"></div><div class="reader-rule"></div><nav class="reader-actions" id="readerFooter" aria-label="小說導覽"></nav></div></article>`;
    document.getElementById('readerArticleTitle').textContent = item.title;
    const subtitleNode = document.getElementById('readerArticleSubtitle');
    if (item.subtitle) { subtitleNode.textContent = item.subtitle; subtitleNode.hidden = false; }
    document.getElementById('readerMeta').textContent = `${CONFIG.author || 'SAKURAI_TK'}  ·  ${labelCP(item)}  ·  ${item.ageRating || '一般'}${item.publishedAt ? '  ·  ' + dateText(item.publishedAt) : ''}`;
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];
    const headings = partHeadings(blocks), map = new Map(); headings.forEach((entry, i) => map.set(entry.b, 'section-' + pad(i + 1)));
    const toc = document.getElementById('readerToc');
    if (headings.length > 1) { toc.className = 'reader-toc'; const label = document.createElement('strong'); label.textContent = '本篇章節 · ' + headings.length + ' PARTS'; toc.append(label); headings.forEach(entry => { const a = document.createElement('a'); a.href = '#' + map.get(entry.b); a.textContent = entry.title; a.addEventListener('click', ev => { ev.preventDefault(); document.getElementById(map.get(entry.b))?.scrollIntoView({behavior:'smooth', block:'start'}); }); toc.append(a); }); }
    const music = youtubeLinks(blocks);
    if (music.length) { const a = document.createElement('a'); a.className = 'reader-playlist'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.href = music[0]; a.textContent = '♫ 本篇推薦配樂 · YouTube ↗'; toc.before(a); }
    const content = document.getElementById('readerContent'); content.append(...renderNodes(blocks, map));
    if (!blocks.length) { const p = document.createElement('p'); p.textContent = '本篇尚無可顯示的正文，請檢查 Notion 文章同步。'; content.append(p); }
    const footer = document.getElementById('readerFooter');
    function link(item, text, fallback) { const a = document.createElement('a'); a.href = item ? articleHref(item) : '#series/' + (fallback || 'serial'); a.textContent = text; if (item) a.addEventListener('click', e => { if (isAdult(item) && !state.ageOK) { e.preventDefault(); openItem(item); } }); return a; }
    footer.append(link(prev, prev ? '← 上一' + (item.work === 'serial' ? '章' : '篇') : '← 返回目錄', item.work), link(null, '章節／作品目錄', item.work), link(next, next ? '下一' + (item.work === 'serial' ? '章' : '篇') + ' →' : '回到目錄 →', item.work));
    document.getElementById('fontDown').addEventListener('click', () => adjustFont(-1));
    document.getElementById('fontUp').addEventListener('click', () => adjustFont(1));
    document.getElementById('readerMode').addEventListener('click', () => { state.readerMode = state.readerMode === 'dark' ? 'light' : 'dark'; storageWrite('reader-mode', state.readerMode); const box = document.getElementById('readerLayout'); if (box) box.dataset.mode = state.readerMode; document.getElementById('readerMode').textContent = state.readerMode === 'dark' ? '☀' : '☾'; });
    updateProgress();
  }
  function adjustFont(shift) { state.fontSize = Math.max(15, Math.min(24, state.fontSize + shift)); storageWrite('font-size', state.fontSize); document.getElementById('readerLayout')?.style.setProperty('--reader-font-size', state.fontSize + 'px'); }
  function updateProgress() {
    const indicator = document.getElementById('readProgress'), body = document.getElementById('readerLayout');
    if (!indicator || !body) return;
    // Progress relative to the full document scroll.
    const docMax = document.documentElement.scrollHeight - window.innerHeight;
    indicator.style.width = (docMax > 0 ? Math.min(100, Math.max(0, window.scrollY / docMax * 100)) : 0) + '%';
  }
  window.addEventListener('scroll', updateProgress, {passive:true});
  function route() {
    const parts = (location.hash || '#home').slice(1).split('/').map(x => { try { return decodeURIComponent(x); } catch (_) { return ''; } });
    const page = parts[0] || 'home';
    el.nav.classList.remove('open'); el.menu.setAttribute('aria-expanded', 'false');
    const isHome = page === 'home'; el.home.hidden = !isHome; el.sub.hidden = isHome;
    scrollTop();
    if (isHome) { navUpdate('home'); setTitle('關於未知的我們'); updateHome(); return; }
    if (page === 'series' && WORKS.includes(parts[1])) { navUpdate(parts[1]); if (parts[1] === 'serial') showSerial(); else showShorts(); return; }
    if (page === 'read') { const item = found(parts[1], parts[2]); navUpdate(parts[1] || ''); if (item) showReader(item); else showMissing(); return; }
    if (page === 'about') { navUpdate('about'); showAbout(); return; }
    navUpdate(''); showMissing();
  }
  el.menu.addEventListener('click', () => { const expanded = el.nav.classList.toggle('open'); el.menu.setAttribute('aria-expanded', String(expanded)); });
  window.addEventListener('hashchange', route);
  async function init() {
    document.getElementById('footerYear').textContent = String(new Date().getFullYear());
    try {
      const resp = await fetch('./data/chapters.json', {cache:'no-store'}); if (!resp.ok) throw Error('HTTP ' + resp.status);
      const json = await resp.json(); const rows = Array.isArray(json) ? json : (Array.isArray(json.chapters) ? json.chapters : []);
      state.stories = rows.filter(x => x && WORKS.includes(x.work) && typeof x.slug === 'string' && typeof x.title === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(x.slug) && !x.private && !x.draft);
    } catch (err) { state.syncError = true; console.warn('Unable to load published stories:', err); }
    route();
  }
  init();
})();
