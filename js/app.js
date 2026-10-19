/* 主应用：路由 + 视图渲染 */
(function () {
  const CFG = window.APP_CONFIG || {};
  const Api = window.Api;
  const Store = window.Store;
  const app = document.getElementById('app');

  let player = null; // 当前播放器实例

  /* ---------------- 工具函数 ---------------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (html) => Api.stripHtml(html);
  const posterOf = (s) => (s && s.image) ? (s.image.medium || s.image.original) : '';
  const yearOf = (s) => (s && s.premiered) ? String(s.premiered).slice(0, 4) : '';
  const fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  };

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
  }

  /* ---------------- 主题 ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    Store.setTheme(t);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0e1013' : '#f6f7f9');
  }
  function initTheme() {
    const saved = Store.getTheme();
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(saved || (prefersLight ? 'light' : 'dark'));
    document.getElementById('themeToggle').addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------------- 公共片段 ---------------- */
  function cardHTML(show) {
    if (!show) return '';
    const img = posterOf(show);
    const rating = show.rating && show.rating.average ? show.rating.average : null;
    const meta = [yearOf(show), (show.genres || []).slice(0, 2).join('/')].filter(Boolean).join(' · ');
    return '<a class="card" href="#/show/' + show.id + '" title="' + esc(show.name) + '">' +
      '<div class="card-poster">' +
      (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(show.name) + '">'
           : '<div class="poster-fallback">' + esc(show.name) + '</div>') +
      (rating ? '<span class="badge">★ ' + rating.toFixed(1) + '</span>' : '') +
      '</div>' +
      '<div class="card-body"><h3 class="card-title">' + esc(show.name) + '</h3>' +
      '<p class="card-meta">' + esc(meta) + '</p></div></a>';
  }

  function skeletonGrid(n) {
    let s = '<div class="grid">';
    for (let i = 0; i < (n || 12); i++) s += '<div class="card skeleton-card"><div class="skeleton poster"></div><div class="skeleton line"></div><div class="skeleton line short"></div></div>';
    return s + '</div>';
  }

  const errorHTML = (title, msg) =>
    '<section class="section empty"><h2>' + esc(title) + '</h2><p class="muted">' + esc(msg || '') + '</p>' +
    '<button class="btn primary" onclick="location.reload()">重试</button></section>';

  /* ---------------- 路由 ---------------- */
  function parse() {
    const raw = location.hash.replace(/^#/, '') || '/home';
    const [path, qs] = raw.split('?');
    return {
      parts: path.split('/').filter(Boolean),
      params: new URLSearchParams(qs || '')
    };
  }

  function setNav(view) {
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-nav') === view);
    });
  }

  function killPlayer() {
    if (player) { player.destroy(); player = null; }
  }

  async function route() {
    const { parts, params } = parse();
    const view = parts[0] || 'home';

    killPlayer();
    window.scrollTo(0, 0);
    setNav(view === 'show' || view === 'watch' ? 'home' : view);

    try {
      if (view === 'search') return viewSearch(params.get('q') || '');
      if (view === 'show') return viewShow(parts[1]);
      if (view === 'watch') return viewWatch(parts[1], Number(parts[2]), Number(parts[3]));
      if (view === 'mylist') return viewMyList();
      return viewHome();
    } catch (e) {
      app.innerHTML = errorHTML('出错了', e && e.message);
    }
  }

  /* ---------------- 首页 ---------------- */
  async function viewHome() {
    app.innerHTML = '<section class="section"><div class="skeleton hero-skel"></div></section>' + skeletonGrid(12);
    let shows, schedule = [];
    try {
      shows = await Api.getShowsPage(0);
    } catch (e) {
      app.innerHTML = errorHTML('无法加载剧集数据', e.message + '（请检查网络或 API 地址）');
      return;
    }
    try { schedule = await Api.getSchedule('US'); } catch (e) { schedule = []; }

    const withImg = shows.filter(s => s.image);
    const byRating = withImg.slice().sort((a, b) =>
      ((b.rating && b.rating.average) || 0) - ((a.rating && a.rating.average) || 0));
    const hot = withImg.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 18);
    const high = byRating.slice(0, 18);
    const today = schedule.filter(e => e.show && e.show.image).slice(0, 12);
    const cont = Store.getAllProgress().slice(0, 8);

    app.innerHTML =
      heroHTML(byRating[0]) +
      (cont.length ? '<section class="section"><div class="section-head"><h2>继续观看</h2>' +
        '<a class="more" href="#/mylist">全部 →</a></div><ul class="continue-list">' +
        cont.map(contRow).join('') + '</ul></section>' : '') +
      '<section class="section"><div class="section-head"><h2>热播推荐</h2></div>' +
        '<div class="row">' + hot.map(cardHTML).join('') + '</div></section>' +
      '<section class="section"><div class="section-head"><h2>高分剧集</h2></div>' +
        '<div class="grid">' + high.map(cardHTML).join('') + '</div></section>' +
      (today.length ? '<section class="section"><div class="section-head"><h2>今日更新</h2></div>' +
        '<div class="grid">' + today.map(e => cardHTML(e.show)).join('') + '</div></section>' : '');
  }

  function heroHTML(show) {
    if (!show) return '';
    const p = posterOf(show);
    const meta = [
      yearOf(show),
      (show.genres || []).slice(0, 3).join(' / '),
      show.rating && show.rating.average ? '★ ' + show.rating.average.toFixed(1) : ''
    ].filter(Boolean).join(' · ');
    const summary = plain(show.summary) || '暂无简介';
    return '<section class="hero">' +
      '<div class="hero-bg" style="background-image:url(' + JSON.stringify(p) + ')"></div>' +
      '<div class="hero-inner">' +
      (p ? '<img class="hero-poster" src="' + esc(p) + '" alt="' + esc(show.name) + '">' : '') +
      '<div class="hero-info"><span class="hero-tag">今日推荐</span>' +
      '<h1>' + esc(show.name) + '</h1>' +
      '<p class="hero-meta">' + esc(meta) + '</p>' +
      '<p class="hero-summary">' + esc(summary.slice(0, 150)) + '…</p>' +
      '<div class="hero-actions"><a class="btn primary" href="#/show/' + show.id + '">▶ 立即观看</a>' +
      '<a class="btn ghost" href="#/search?q=' + encodeURIComponent(show.name) + '">更多类似</a></div>' +
      '</div></div></section>';
  }

  function contRow(p) {
    const pct = p.d ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0;
    return '<li class="cont-item"><a href="#/watch/' + p.showId + '/' + p.season + '/' + p.episode + '">' +
      (p.image ? '<img loading="lazy" src="' + esc(p.image) + '" alt="">' : '<span class="cont-noimg">▶</span>') +
      '<div class="cont-main"><h3>' + esc(p.showName || ('剧集 ' + p.showId)) + '</h3>' +
      '<p class="muted">S' + p.season + ' E' + p.episode + (p.epName ? ' · ' + esc(p.epName) : '') + '</p>' +
      '<span class="ep-progress"><i style="width:' + pct + '%"></i></span></div>' +
      '<span class="cont-pct">' + pct + '%</span></a></li>';
  }

  /* ---------------- 搜索 ---------------- */
  async function viewSearch(q) {
    const input = document.getElementById('searchInput');
    if (q) input.value = q;

    if (!q) {
      app.innerHTML = '<section class="section empty"><h2>搜索剧集</h2>' +
        '<p class="muted">输入剧名、演员或关键词开始搜索。</p></section>';
      input.focus();
      return;
    }

    app.innerHTML = skeletonGrid(12);
    const results = await Api.search(q);
    if (!results.length) {
      app.innerHTML = '<section class="section empty"><h2>没有找到与「' + esc(q) + '」相关的剧集</h2>' +
        '<p class="muted">换个关键词试试。</p></section>';
      return;
    }
    app.innerHTML = '<section class="section"><div class="section-head"><h2>「' + esc(q) + '」的搜索结果</h2>' +
      '<span class="muted">' + results.length + ' 个结果</span></div>' +
      '<div class="grid">' + results.map(cardHTML).join('') + '</div></section>';
  }

  /* ---------------- 剧集详情 ---------------- */
  async function viewShow(id) {
    app.innerHTML = '<div class="detail-skeleton"><div class="skeleton poster big"></div>' +
      '<div><div class="skeleton line"></div><div class="skeleton line short"></div>' +
      '<div class="skeleton line"></div></div></div>';

    const show = await Api.getShowFull(id);
    const eps = ((show._embedded || {}).episodes || []).filter(e => e.number != null);
    const seasons = [...new Set(eps.map(e => e.season))].sort((a, b) => a - b);
    const p = posterOf(show);
    const rating = show.rating && show.rating.average ? show.rating.average : null;
    const fav = Store.isFavorite(show.id);
    const last = Store.lastWatched(show.id);
    const firstEp = eps.slice().sort((a, b) => a.season - b.season || a.number - b.number)[0];
    const start = last || firstEp;

    app.innerHTML =
      '<section class="detail">' +
      '<div class="detail-hero">' +
      '<div class="detail-poster">' + (p ? '<img src="' + esc(p) + '" alt="' + esc(show.name) + '">' : '') + '</div>' +
      '<div class="detail-info">' +
      '<h1>' + esc(show.name) + '</h1>' +
      '<p class="detail-meta">' + esc([yearOf(show), (show.genres || []).join(' / '), show.status].filter(Boolean).join(' · ')) + '</p>' +
      (rating ? '<div class="detail-rating">★ ' + rating.toFixed(1) + ' <span class="muted">观众评分</span></div>' : '') +
      '<p class="detail-summary">' + esc(plain(show.summary) || '暂无简介') + '</p>' +
      '<div class="detail-actions">' +
      (start ? '<a class="btn primary" href="#/watch/' + show.id + '/' + start.season + '/' + start.number + '">▶ ' +
        (last ? '继续观看 S' + last.season + 'E' + last.episode : '从第 1 集开始') + '</a>' : '') +
      '<button class="btn ghost" id="favBtn" type="button">' + (fav ? '♥ 已收藏' : '♡ 收藏') + '</button>' +
      (show.officialSite ? '<a class="btn ghost" href="' + esc(show.officialSite) + '" target="_blank" rel="noopener">官网</a>' : '') +
      '</div></div></div>' +

      '<div class="ep-section">' +
      '<div class="section-head"><h2>剧集列表</h2>' +
      (seasons.length > 1 ? '<select id="seasonSel" class="select">' +
        seasons.map(s => '<option value="' + s + '">第 ' + s + ' 季</option>').join('') + '</select>' : '') +
      '</div><ul class="ep-list" id="epList"></ul></div>' +
      '</section>';

    const listEl = document.getElementById('epList');
    const selEl = document.getElementById('seasonSel');
    const renderSeason = (season) => {
      const map = {};
      Store.getAllProgress().forEach(pr => { map[pr.showId + ':' + pr.season + ':' + pr.episode] = pr; });
      const list = eps.filter(e => e.season === season).sort((a, b) => a.number - b.number);
      listEl.innerHTML = list.length
        ? list.map(e => epRow(e, show, map[show.id + ':' + e.season + ':' + e.number])).join('')
        : '<li class="muted pad">该季暂无分集信息</li>';
    };
    renderSeason(seasons[0]);
    if (selEl) selEl.addEventListener('change', () => renderSeason(Number(selEl.value)));

    document.getElementById('favBtn').addEventListener('click', (ev) => {
      const nowFav = Store.toggleFavorite(show);
      ev.currentTarget.textContent = nowFav ? '♥ 已收藏' : '♡ 收藏';
      toast(nowFav ? '已加入我的追剧' : '已取消收藏');
    });
  }

  function epRow(ep, show, prog) {
    const pct = prog && prog.d ? Math.min(100, Math.round((prog.t / prog.d) * 100)) : 0;
    const state = pct >= 92 ? '已看完' : (pct > 0 ? '观看中 ' + pct + '%' : '▶');
    return '<li class="ep-item"><a class="ep-link" href="#/watch/' + show.id + '/' + ep.season + '/' + ep.number + '">' +
      '<span class="ep-no">' + ep.number + '</span>' +
      '<span class="ep-main"><span class="ep-name">' + esc(ep.name || ('第 ' + ep.number + ' 集')) + '</span>' +
      '<span class="ep-sub">' + esc([ep.airdate, ep.runtime ? ep.runtime + ' 分钟' : ''].filter(Boolean).join(' · ')) + '</span>' +
      (pct > 0 ? '<span class="ep-progress"><i style="width:' + pct + '%"></i></span>' : '') +
      '</span>' +
      '<span class="ep-state' + (pct >= 92 ? ' done' : '') + '">' + state + '</span></a></li>';
  }

  /* ---------------- 播放页 ---------------- */
  function sourceFor(show, season, episode) {
    const pb = (CFG.playback || {});
    if (pb.mode === 'template' && pb.template) {
      return {
        url: pb.template
          .replace('{showId}', show.id)
          .replace('{season}', season)
          .replace('{episode}', episode)
          .replace('{episodeName}', encodeURIComponent(''))
      };
    }
    const list = pb.demoStreams || [];
    if (!list.length) return { url: '' };
    const idx = (Number(show.id) + season * 10 + episode) % list.length;
    return list[idx];
  }

  async function viewWatch(showId, season, episode) {
    app.innerHTML = '<section class="section empty"><h2>正在加载…</h2></section>';

    const show = await Api.getShowFull(showId);
    const eps = ((show._embedded || {}).episodes || []).filter(e => e.number != null);
    const sorted = eps.slice().sort((a, b) => a.season - b.season || a.number - b.number);
    let idx = sorted.findIndex(e => e.season === season && e.number === episode);
    if (idx < 0) idx = 0;
    const cur = sorted[idx];
    if (!cur) { app.innerHTML = errorHTML('无法播放', '该剧暂无分集数据'); return; }

    const prev = sorted[idx - 1];
    const next = sorted[idx + 1];
    const src = sourceFor(show, cur.season, cur.number);
    const stored = Store.getProgress(show.id, cur.season, cur.number);
    const poster = cur.image ? cur.image.medium : posterOf(show);

    app.innerHTML =
      '<div class="watch">' +
      '<div class="player-wrap"><div id="playerBox" class="player-box"></div>' +
      '<div class="watch-progress"><i id="watchBar"></i></div></div>' +
      '<div class="watch-meta">' +
      '<a class="back" href="#/show/' + show.id + '">← 返回《' + esc(show.name) + '》</a>' +
      '<h1>' + esc(show.name) + '</h1>' +
      '<p class="watch-ep">第 ' + cur.season + ' 季 · 第 ' + cur.number + ' 集' +
      (cur.name ? ' · ' + esc(cur.name) : '') + '</p>' +
      '<div class="watch-actions">' +
      '<button class="btn ghost" id="prevBtn"' + (prev ? '' : ' disabled') + '>⏮ 上一集</button>' +
      '<button class="btn ghost" id="nextBtn"' + (next ? '' : ' disabled') + '>下一集 ⏭</button>' +
      '<label class="speed">倍速 <select id="speedSel" class="select">' +
      [0.5, 0.75, 1, 1.25, 1.5, 2].map(r => '<option value="' + r + '"' + (r === 1 ? ' selected' : '') + '>' + r + 'x</option>').join('') +
      '</select></label>' +
      '<button class="btn ghost" id="favBtn2" type="button">' + (Store.isFavorite(show.id) ? '♥' : '♡') + ' 收藏</button>' +
      '</div>' +
      '<p class="watch-hint muted" id="watchHint"></p>' +
      '</div>' +
      '<div class="ep-section"><div class="section-head"><h2>选集</h2></div>' +
      '<ul class="ep-list">' + eps.slice().sort((a, b) => a.season - b.season || a.number - b.number)
        .map(e => epRow(e, show, Store.getProgress(show.id, e.season, e.number)))
        .join('') + '</ul></div>' +
      '</div>';

    // 高亮当前集
    const curLink = app.querySelector('.ep-link[href="#/watch/' + show.id + '/' + cur.season + '/' + cur.number + '"]');
    if (curLink) curLink.classList.add('current');

    if (!src.url) { app.querySelector('#watchHint').textContent = '未配置播放源，请在 js/config.js 中设置。'; return; }

    const box = document.getElementById('playerBox');
    player = window.Player.create(box, {
      url: src.url,
      poster: poster || '',
      startAt: stored ? stored.t : 0,
      autoplay: true
    });

    const bar = document.getElementById('watchBar');
    const hint = document.getElementById('watchHint');
    if (src.name) hint.textContent = '当前播放源：' + src.name + (CFG.playback.mode === 'demo' ? '（演示片源，可在 config.js 替换）' : '');

    player.on('progress', (d) => {
      if (d.duration) {
        const pct = Math.min(100, (d.current / d.duration) * 100);
        if (bar) bar.style.width = pct + '%';
        Store.setProgress(show.id, cur.season, cur.number, {
          t: d.current, d: d.duration,
          showName: show.name, epName: cur.name, image: posterOf(show),
          done: pct >= 92
        });
      }
    });
    player.on('ended', () => {
      if (next) location.hash = '#/watch/' + show.id + '/' + next.season + '/' + next.number;
      else toast('已经是最后一集啦');
    });
    player.on('error', (m) => { hint.textContent = '⚠ ' + m; hint.classList.add('err'); });

    const go = (ep) => { if (ep) location.hash = '#/watch/' + show.id + '/' + ep.season + '/' + ep.number; };
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prev) prevBtn.addEventListener('click', () => go(prev));
    if (next) nextBtn.addEventListener('click', () => go(next));

    document.getElementById('speedSel').addEventListener('change', (e) => {
      player.setSpeed(Number(e.target.value));
    });
    document.getElementById('favBtn2').addEventListener('click', (ev) => {
      const nowFav = Store.toggleFavorite(show);
      ev.currentTarget.textContent = (nowFav ? '♥' : '♡') + ' 收藏';
      toast(nowFav ? '已加入我的追剧' : '已取消收藏');
    });

    // 键盘快捷键：空格播放/暂停，左右 5 秒
    document.addEventListener('keydown', onWatchKey);
    function onWatchKey(e) {
      if (location.hash.indexOf('#/watch/') !== 0 || !player) return;
      if (/input|select|textarea/i.test(e.target.tagName)) return;
      const v = player.video;
      if (e.code === 'Space') { e.preventDefault(); if (v) v.paused ? v.play() : v.pause(); }
      if (e.code === 'ArrowRight' && v) { v.currentTime += 5; }
      if (e.code === 'ArrowLeft' && v) { v.currentTime = Math.max(0, v.currentTime - 5); }
    }
    // 离开播放页时移除监听
    const origDestroy = player.destroy.bind(player);
    player.destroy = () => { document.removeEventListener('keydown', onWatchKey); origDestroy(); };
  }

  /* ---------------- 我的追剧 ---------------- */
  function viewMyList() {
    const favs = Store.getFavorites();
    const cont = Store.getAllProgress();

    app.innerHTML =
      '<section class="section"><div class="section-head"><h2>继续观看</h2>' +
      (cont.length ? '<span class="muted">' + cont.length + ' 条记录</span>' : '') + '</div>' +
      (cont.length ? '<ul class="continue-list">' + cont.map(contRow).join('') + '</ul>'
        : '<p class="muted">还没有观看记录，去「发现」页挑一部剧吧。</p>') +
      '</section>' +
      '<section class="section"><div class="section-head"><h2>我的收藏</h2>' +
      '<span class="muted">' + favs.length + ' 部</span></div>' +
      (favs.length ? '<div class="grid">' + favs.map(cardHTML).join('') + '</div>'
        : '<p class="muted">还没有收藏。在剧集详情页点「♡ 收藏」即可加入。</p>') +
      '</section>';
  }

  /* ---------------- 启动 ---------------- */
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
  });
  window.addEventListener('hashchange', route);

  initTheme();
  route();
})();
