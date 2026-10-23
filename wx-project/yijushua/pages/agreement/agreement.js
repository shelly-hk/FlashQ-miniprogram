/**
 * 用户协议 / 隐私政策页面
 * --------------------------------------------------
 * URL 参数：type=user | privacy
 */

// 模块加载时读一次主题：保证首帧渲染就是当前主题，避免深色模式切页闪白
const _darkMode = wx.getStorageSync('darkMode') === true

function applyNavBar(dark) {
  wx.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: dark ? '#1a1a1a' : '#ffffff'
  })
  // 同步原生窗口背景色：否则切页时原生层先按 app.json 的浅色画一帧
  var bg = dark ? '#1a1a1a' : '#f5f6f8'
  wx.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg
  })
}

Page({
  data: {
    type: 'user',
    title: '用户协议',
    darkMode: _darkMode,
    fontScale: 'medium'    // 适老化字号（small/medium/large），在 onLoad 中读取
  },

  onLoad(options) {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    var type = options.type || 'user'
    this.setData({
      type: type,
      title: type === 'privacy' ? '隐私政策' : '用户协议',
      darkMode: wx.getStorageSync('darkMode') === true,
      fontScale: wx.getStorageSync('fontScale') || 'medium'
    })
  }
})
