/**
 * 关于页面
 * --------------------------------------------------
 * 功能：
 *   1. 展示应用信息（名称、版本号、Logo）
 *   2. 展示团队信息
 *   3. 展示备案信息（点击可复制工信部链接）
 *   4. 展示免责声明
 *
 * 接口：GET /api/config/info（公开接口，无需登录）
 */

const api = require('../../utils/api.js')

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
    configInfo: null,   // 应用配置信息
    darkMode: _darkMode,    // 深色模式
    fontScale: 'medium'    // 适老化字号（small/medium/large），在 onShow 中读取
  },

  onLoad(options) {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.loadConfig()
    // 支持外部跳转时自动滚动到指定区块（如联系我们）
    this._scrollTarget = options && options.focus ? options.focus : ''
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    this.setData({ darkMode, fontScale })
    // 首次进入且指定 focus 区块时，等待渲染完成后滚动到目标位置
    if (this._scrollTarget) {
      const target = this._scrollTarget
      this._scrollTarget = ''
      setTimeout(() => this._scrollTo(target), 350)
    }
  },

  /**
   * 滚动到指定区块
   */
  _scrollTo(target) {
    if (target !== 'contact') return
    wx.pageScrollTo({
      selector: '.contact-section',
      offsetTop: -20,
      duration: 320
    })
  },

  /**
   * 获取应用配置信息
   */
  loadConfig() {
    api.getConfigInfo().then(data => {
      this.setData({ configInfo: data })
    }).catch(() => {})
  },

  /**
   * 点击备案号 → 复制备案号
   */
  onBeianTap() {
    wx.setClipboardData({
      data: '粤ICP备2026147363号-1X',
      success() {
        wx.showToast({ title: '备案号已复制', icon: 'success' })
      }
    })
  },

  /**
   * 点击 QQ 群号 → 复制群号
   */
  onCopyQQ() {
    wx.setClipboardData({
      data: '1130751121',
      success() {
        wx.showToast({ title: 'QQ群号已复制', icon: 'success' })
      }
    })
  },

  onOpenUserAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' })
  },

  onOpenPrivacy() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '一句刷 — 海量题库，随时随地刷起来',
      path: '/pages/home/home',    }
  }
})
