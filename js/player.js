/* 播放器封装：支持 HLS(.m3u8) / 原生文件(.mp4 等) / iframe 嵌入 */
(function () {
  function detect(url) {
    if (!url) return 'embed';
    if (/\.m3u8(\?|#|$)/i.test(url)) return 'hls';
    if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(url)) return 'file';
    return 'embed';
  }

  function create(container, opts) {
    opts = opts || {};
    const kind = detect(opts.url);
    const handlers = {};
    let video = null, hls = null, destroyed = false;

    function emit(name, data) {
      (handlers[name] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn(e); } });
    }

    const api = {
      kind,
      get video() { return video; },
      on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return api; },
      play() { if (video) video.play().catch(() => {}); },
      pause() { if (video) video.pause(); },
      seekTo(t) { if (video && isFinite(t)) video.currentTime = t; },
      setSpeed(r) { if (video) video.playbackRate = r; },
      destroy() {
        destroyed = true;
        if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
        if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {} }
        container.innerHTML = '';
      }
    };

    // iframe 嵌入模式
    if (kind === 'embed') {
      container.innerHTML =
        '<iframe class="player-embed" src="' + opts.url + '" ' +
        'allow="autoplay; fullscreen; encrypted-media; picture-in-picture" ' +
        'allowfullscreen referrerpolicy="no-referrer"></iframe>';
      emit('ready');
      return api;
    }

    video = document.createElement('video');
    video.className = 'player-video';
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('playsinline', '');
    if (opts.poster) video.poster = opts.poster;

    container.innerHTML = '';
    container.appendChild(video);

    let lastTick = 0;
    video.addEventListener('timeupdate', () => {
      if (destroyed) return;
      const now = Date.now();
      if (now - lastTick < 1000) return;
      lastTick = now;
      emit('progress', { current: video.currentTime, duration: video.duration || 0 });
    });
    video.addEventListener('loadedmetadata', () => {
      if (opts.startAt && opts.startAt > 5 && opts.startAt < (video.duration || Infinity) - 5) {
        video.currentTime = opts.startAt;
      }
      if (opts.autoplay !== false) video.play().catch(() => {});
      emit('ready');
    });
    video.addEventListener('ended', () => emit('ended'));
    video.addEventListener('error', () => {
      emit('error', (video.error && video.error.message) || '播放出错，请检查播放源');
    });

    if (kind === 'hls') {
      const Hls = window.Hls;
      if (Hls && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 60 });
        hls.loadSource(opts.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (e, data) => {
          if (data && data.fatal) emit('error', 'HLS 错误：' + data.type + ' / ' + data.details);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = opts.url;
      } else {
        emit('error', '当前浏览器不支持 HLS 播放，请更换播放源');
      }
    } else {
      video.src = opts.url;
    }

    return api;
  }

  window.Player = { create, detect };
})();
