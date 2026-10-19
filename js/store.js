/* 本地存储：收藏 + 追剧进度 + 主题（纯静态站，数据保存在浏览器 localStorage） */
(function () {
  const K_FAV = 'dh:favorites';
  const K_PROG = 'dh:progress';
  const K_THEME = 'dh:theme';
  const MAX_PROGRESS = 300;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  window.Store = {
    /* ---------- 主题 ---------- */
    getTheme() { return read(K_THEME, null); },
    setTheme(t) { write(K_THEME, t); },

    /* ---------- 收藏 ---------- */
    getFavorites() { return read(K_FAV, []); },
    isFavorite(id) {
      id = Number(id);
      return this.getFavorites().some(s => Number(s.id) === id);
    },
    toggleFavorite(show) {
      const list = this.getFavorites().filter(Boolean);
      const i = list.findIndex(s => Number(s.id) === Number(show.id));
      if (i >= 0) {
        list.splice(i, 1);
        write(K_FAV, list);
        return false;
      }
      list.unshift({
        id: Number(show.id),
        name: show.name,
        image: show.image ? (show.image.medium || show.image.original) : null,
        rating: show.rating ? show.rating.average : null,
        premiered: show.premiered || null,
        genres: show.genres || [],
        addedAt: Date.now()
      });
      write(K_FAV, list);
      return true;
    },

    /* ---------- 追剧进度 ---------- */
    progressKey(showId, s, e) { return showId + ':' + s + ':' + e; },

    getProgress(showId, s, e) {
      return read(K_PROG, {})[this.progressKey(showId, s, e)] || null;
    },

    setProgress(showId, s, e, data) {
      const all = read(K_PROG, {});
      const key = this.progressKey(showId, s, e);
      all[key] = Object.assign({
        showId: Number(showId), season: s, episode: e, updatedAt: Date.now()
      }, all[key] || {}, data);

      const keys = Object.keys(all);
      if (keys.length > MAX_PROGRESS) {
        keys.sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0));
        while (keys.length > MAX_PROGRESS) delete all[keys.shift()];
      }
      write(K_PROG, all);
    },

    getAllProgress() {
      const all = read(K_PROG, {});
      return Object.values(all)
        .filter(p => p && p.d > 5)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    // 某部剧最近观看的一集，用于「继续观看」
    lastWatched(showId) {
      return this.getAllProgress().filter(p => Number(p.showId) === Number(showId))[0] || null;
    }
  };
})();
