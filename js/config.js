/* 站点配置：改完直接重新部署即可生效 */
window.APP_CONFIG = {
  siteName: '追剧站',

  // 剧集元数据 API（TVMaze 无需 Key，支持 CORS）
  catalogApi: { base: 'https://api.tvmaze.com' },

  playback: {
    // mode = 'demo'     → 用下面的公开测试流演示播放
    // mode = 'template' → 用你自己的播放源模板
    mode: 'demo',

    // mode = 'template' 时使用。占位符：{showId} {season} {episode} {episodeName}
    // 返回 .m3u8 / .mp4 → 用内置播放器；返回其它地址 → 当作 iframe 嵌入播放
    template: 'https://your-source.example/play/{showId}/{season}/{episode}',

    // 公有领域 / 官方公开测试流，可自由替换
    demoStreams: [
      { name: 'Big Buck Bunny (HLS)', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { name: 'Sintel (HLS)',         url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
      { name: 'Tears of Steel (MP4)', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
      { name: 'Elephants Dream (MP4)',url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
      { name: 'For Bigger Blazes (MP4)', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' }
    ]
  }
};
