/* TVMaze 公开 API 封装（内存缓存，减少重复请求） */
(function () {
  const BASE = (window.APP_CONFIG && window.APP_CONFIG.catalogApi && window.APP_CONFIG.catalogApi.base)
    || 'https://api.tvmaze.com';

  const cache = new Map();

  function get(path) {
    if (cache.has(path)) return cache.get(path);
    const p = fetch(BASE + path, { headers: { Accept: 'application/json' } })
      .then(r => {
        if (!r.ok) throw new Error('接口返回 ' + r.status);
        return r.json();
      });
    cache.set(path, p);
    return p.catch(e => { cache.delete(path); throw e; });
  }

  // 把 summary 里的 HTML 标签去掉，只留纯文本
  const stripHtml = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').trim();
  };

  window.Api = {
    BASE,
    stripHtml,
    search: (q) => get('/search/shows?q=' + encodeURIComponent(q)).then(a => a.map(x => x.show)),
    getShowsPage: (page) => get('/shows?page=' + page),
    getShow: (id) => get('/shows/' + id),
    getShowFull: (id) => get('/shows/' + id + '?embed[]=episodes&embed[]=cast'),
    getSchedule: (country) => get('/schedule?country=' + (country || 'US'))
  };
})();
