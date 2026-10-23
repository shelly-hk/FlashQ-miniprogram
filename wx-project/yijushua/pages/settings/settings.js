/**
 * 设置页面
 * --------------------------------------------------
 * 功能：
 *   1. 答对自动跳转开关（存储到本地，刷题页读取）
 *   2. 清除缓存
 *   3. 跳转关于页面
 *   4. 背景音乐：音量 / 选择 / 试听
 *   5. 刷题音效：音量
 */

const bgm = require('../../utils/bgm.js')

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
    autoNext: true,      // 答对后是否自动下一题
    cacheSize: '0 KB',   // 缓存大小
    darkMode: _darkMode,     // 深色模式
    autoNextDelay: 0,    // 答对后停留秒数（0=不停留）
    soundEnabled: false, // 音效开关（默认关闭）
    // —— 背景音乐 ——
    bgmList: [],               // BGM 列表 [{ id, label }]
    selectedIds: [],           // 已选中的 BGM id 列表（随机播放池）
    bgmExpanded: false,        // 选择面板是否展开（默认收起）
    bgmVolumePercent: 50,      // BGM 音量 0~100
    // —— 刷题音效 ——
    sfxVolumePercent: 100,     // 刷题音效音量 0~100
    previewingId: '',          // 当前试听的 BGM id
    // —— 字号（适老化 / 无障碍）——
    fontScale: 'medium',       // 当前字号：small / medium / large
    fontOptions: [
      { value: 'small',  label: '小',  desc: '适合视力好、信息密集偏好' },
      { value: 'medium', label: '中',  desc: '默认推荐' },
      { value: 'large',  label: '大',  desc: '适老化，照顾视力下降用户' }
    ],
    delayOptions: [
      { value: 0, label: '不停留' },
      { value: 1, label: '1秒' },
      { value: 3, label: '3秒' },
      { value: 5, label: '5秒' },
      { value: 8, label: '8秒' }
    ]
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    // 读取本地存储的自动跳转设置（默认开启）
    const autoNext = wx.getStorageSync('autoNext')
    this.setData({
      autoNext: autoNext !== false  // 没存过默认 true
    })
    // 读取停留时间（默认不停留）
    const delay = wx.getStorageSync('autoNextDelay')
    if (delay !== '' && delay !== undefined) {
      this.setData({ autoNextDelay: delay })
    }
    const soundEnabled = wx.getStorageSync('soundEnabled') === true
    this.setData({ soundEnabled })
    // 读取字号设置（默认 medium）
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    this.setData({ fontScale })
    // 初始化背景音乐 / 刷题音效设置
    this.setData({
      selectedIds: bgm.getSelectedIds(),
      bgmVolumePercent: Math.round(bgm.getBgmVolume() * 100),
      sfxVolumePercent: Math.round(bgm.getSfxVolume() * 100)
    })
    this.buildBgmList()
    // 试听状态变化回调（刷新"试听/停止"按钮）
    bgm.onPreviewChange((id) => this.setData({ previewingId: id || '' }))
    // 选中列表变化回调（同步 UI）
    bgm.onSettingsChange(() => {
      this.setData({ selectedIds: bgm.getSelectedIds() })
      this.buildBgmList()
    })
    this.calculateCacheSize()
  },

  /**
   * 构建 BGM 列表（合并 selectedIds → 每个 item 带 selected 布尔标志，便于 wxml 渲染）
   */
  buildBgmList() {
    const selectedIds = bgm.getSelectedIds()
    const list = bgm.getList().map(item => ({
      id: item.id,
      label: item.label,
      selected: selectedIds.indexOf(item.id) !== -1
    }))
    this.setData({ bgmList: list })
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    this.setData({ darkMode })
    applyNavBar(darkMode)
  },

  /**
   * 离开设置页时停止试听，避免音乐继续放
   */
  onHide() {
    bgm.stopPreview()
  },

  onUnload() {
    bgm.stopPreview()
  },

  /**
   * 切换"答对自动下一题"开关
   */
  onAutoNextChange(e) {
    const value = e.detail.value
    wx.setStorageSync('autoNext', value)
    this.setData({ autoNext: value })
    wx.showToast({
      title: value ? '已开启自动跳转' : '已关闭自动跳转',
      icon: 'none'
    })
  },

  /**
   * 切换"答题音效"开关
   */
  onSoundChange(e) {
    const value = e.detail.value
    wx.setStorageSync('soundEnabled', value)
    this.setData({ soundEnabled: value })
  },

  /**
   * 调节背景音乐音量
   */
  onBgmVolumeChange(e) {
    const pct = e.detail.value
    bgm.setBgmVolume(pct / 100)
    this.setData({ bgmVolumePercent: pct })
  },

  /**
   * 调节刷题音效音量
   */
  onSfxVolumeChange(e) {
    const pct = e.detail.value
    bgm.setSfxVolume(pct / 100)
    this.setData({ sfxVolumePercent: pct })
  },

  /**
   * 展开 / 收起选择面板
   */
  onToggleExpand() {
    this.setData({ bgmExpanded: !this.data.bgmExpanded })
  },

  /**
   * 切换某首 BGM 的选中状态（深色=选中并随机播放，浅色=不播放）
   * 至少保留一首：取消最后一首会被拒绝并提示
   */
  onToggleBgmItem(e) {
    const id = e.currentTarget.dataset.id
    const res = bgm.toggleSelected(id)
    if (!res.ok) {
      // 已是最后一首，不允许全部取消
      wx.showToast({
        title: '至少保留一首，不想听可关闭 BGM',
        icon: 'none'
      })
    }
    // 刷新列表（含 selected 标志）
    this.setData({ selectedIds: bgm.getSelectedIds() })
    this.buildBgmList()
  },

  /**
   * 试听 / 停止试听某首 BGM
   */
  onPreviewBgm(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.previewingId === id) {
      // 再次点击同一首 → 停止试听
      bgm.stopPreview()
      this.setData({ previewingId: '' })
    } else {
      bgm.preview(id)
      this.setData({ previewingId: id })
    }
  },

  /**
   * 切换停留时间
   */
  onDelayChange(e) {
    const value = Number(e.currentTarget.dataset.value)
    wx.setStorageSync('autoNextDelay', value)
    this.setData({ autoNextDelay: value })
  },

  /**
   * 切换字号（无障碍 / 适老化）
   * 写入本地后，所有页面在 onShow 时读取并应用到根容器 class
   */
  onFontScaleChange(e) {
    const value = e.currentTarget.dataset.value
    wx.setStorageSync('fontScale', value)
    this.setData({ fontScale: value })
    wx.showToast({
      title: '字号已切换为' + (value === 'small' ? '小' : value === 'large' ? '大' : '中'),
      icon: 'none'
    })
  },

  /**
   * 计算缓存大小（仅统计非用户设置的缓存数据）
   */
  calculateCacheSize() {
    try {
      const info = wx.getStorageInfoSync()
      const reservedKeys = ['token', 'autoNext', 'darkMode', 'autoNextDelay', 'soundEnabled', 'bgmEnabled', 'bgmVolume', 'sfxVolume', 'selectedBgmList']
      let bytes = 0
      info.keys.forEach(key => {
        if (reservedKeys.indexOf(key) === -1) {
          const val = wx.getStorageSync(key)
          try {
            bytes += JSON.stringify(val).length
          } catch (e) {
            bytes += String(val).length
          }
        }
      })
      const sizeKB = Math.round(bytes / 1024)
      let sizeStr = ''
      if (sizeKB < 1) {
        sizeStr = '0 KB'
      } else if (sizeKB < 1024) {
        sizeStr = sizeKB + ' KB'
      } else {
        sizeStr = (sizeKB / 1024).toFixed(1) + ' MB'
      }
      this.setData({ cacheSize: sizeStr })
    } catch (e) {
      this.setData({ cacheSize: '0 KB' })
    }
  },

  /**
   * 清除缓存（保留 token 和 autoNext）
   */
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地缓存数据（不影响登录状态），确定继续？',
      success: (res) => {
        if (!res.confirm) return

        // 先保存需要保留的数据
        const token = wx.getStorageSync('token')
        const autoNext = wx.getStorageSync('autoNext')
        const darkMode = wx.getStorageSync('darkMode')
        const autoNextDelay = wx.getStorageSync('autoNextDelay')
        const soundEnabled = wx.getStorageSync('soundEnabled')
        const bgmEnabled = wx.getStorageSync('bgmEnabled')
        const bgmVolume = wx.getStorageSync('bgmVolume')
        const sfxVolume = wx.getStorageSync('sfxVolume')
        const selectedBgmList = wx.getStorageSync('selectedBgmList')

        // 清除所有缓存
        wx.clearStorageSync()

        // 恢复保留的数据
        if (token) wx.setStorageSync('token', token)
        if (autoNext !== '') wx.setStorageSync('autoNext', autoNext)
        if (darkMode !== '') wx.setStorageSync('darkMode', darkMode)
        if (autoNextDelay !== '') wx.setStorageSync('autoNextDelay', autoNextDelay)
        if (soundEnabled) wx.setStorageSync('soundEnabled', soundEnabled)
        if (bgmEnabled) wx.setStorageSync('bgmEnabled', bgmEnabled)
        if (bgmVolume !== '') wx.setStorageSync('bgmVolume', bgmVolume)
        if (sfxVolume !== '') wx.setStorageSync('sfxVolume', sfxVolume)
        if (selectedBgmList) wx.setStorageSync('selectedBgmList', selectedBgmList)

        this.calculateCacheSize()
        wx.showToast({ title: '缓存已清除', icon: 'success' })
      }
    })
  },

  /**
   * 跳转关于页面
   */
  onAboutTap() {
    wx.navigateTo({ url: '/pages/about/about' })
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
