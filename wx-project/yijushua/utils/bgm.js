/**
 * 全局背景音乐（BGM）管理器
 * --------------------------------------------------
 * 设计要点：
 * 1. 使用单个全局 InnerAudioContext 持续播放，跨页面不中断
 * 2. 默认关闭；开启后在"已选中"的曲目中随机播放
 * 3. 用户可在设置页多选曲目（selectedIds），默认全部选中，最少保留一首
 *    —— 不想要 BGM 时直接关开关即可，不存在"一首都不选"
 * 4. 试听（preview）使用独立上下文，不干扰正在进行的背景播放
 * 5. 所有设置只存在本地 wx.storage，无需后端/数据库
 *
 * BGM 文件托管在后端服务器：
 *   https://api.flashq.site/uploads/bgm/bgmXX.mp3
 * 由 Spring Boot 的 WebConfig 静态资源映射（/uploads/** → ./uploads）提供访问
 */

// ========== 配置区 ==========
// BGM 文件在服务器上的根路径（与后端 WebConfig 的 /uploads/** 映射对应）
const BGM_BASE = 'https://api.flashq.site/uploads/bgm/'

// BGM 列表（id 与文件名对应；ext 保留原始扩展名）
// 如后续在服务器新增 BGM，只需在此追加即可
const BGM_LIST = [
  { id: 'bgm01', label: '背景音乐 01', ext: 'mp3' },
  { id: 'bgm02', label: '背景音乐 02', ext: 'mp3' },
  { id: 'bgm03', label: '背景音乐 03', ext: 'mp3' },
  { id: 'bgm04', label: '背景音乐 04', ext: 'mp3' },
  { id: 'bgm05', label: '背景音乐 05', ext: 'mp3' },
  { id: 'bgm06', label: '背景音乐 06', ext: 'mp3' },
  { id: 'bgm07', label: '背景音乐 07', ext: 'mp3' },
  { id: 'bgm08', label: '背景音乐 08', ext: 'mp3' },
  { id: 'bgm09', label: '背景音乐 09', ext: 'mp3' }
]

// ========== 运行时状态 ==========
let bgmCtx = null        // 全局播放上下文（持续播放）
let previewCtx = null    // 试听上下文（独立）
let order = []           // 随机播放顺序（存 id）
let orderIndex = -1      // 当前在 order 中的索引
let enabled = false      // 是否开启
let bgmVolume = 0.5      // BGM 音量 0~1
let sfxVolume = 1        // 刷题音效音量 0~1
let selectedIds = []     // 已选中的 BGM id 列表（随机播放池）；默认全部
let previewingId = ''    // 当前正在试听的 id
let wasPlayingBeforePreview = false // 试听前主播放是否在进行（用于试听后恢复）
let previewChangeCb = null // 试听状态变化回调（供设置页更新 UI）
let settingsChangeCb = null // 选中列表变化回调（供设置页同步 UI）

// ========== 工具函数 ==========

function getUrl(item) {
  return BGM_BASE + item.id + '.' + item.ext
}

/** Fisher–Yates 洗牌 */
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

/** 读取本地设置到内存 */
function loadSettings() {
  enabled = wx.getStorageSync('bgmEnabled') === true
  const v = wx.getStorageSync('bgmVolume')
  bgmVolume = (v === '' || v === undefined || v === null) ? 0.5 : Number(v)
  const sv = wx.getStorageSync('sfxVolume')
  sfxVolume = (sv === '' || sv === undefined || sv === null) ? 1 : Number(sv)
  const stored = wx.getStorageSync('selectedBgmList')
  if (Array.isArray(stored) && stored.length > 0) {
    // 仅保留仍存在于 BGM_LIST 中的 id
    selectedIds = BGM_LIST.map(b => b.id).filter(id => stored.indexOf(id) !== -1)
  }
  if (selectedIds.length === 0) {
    selectedIds = BGM_LIST.map(b => b.id) // 默认全部选中
  }
}

/** 当前随机播放池（至少一首） */
function getPool() {
  return selectedIds.length > 0 ? selectedIds.slice() : BGM_LIST.map(b => b.id)
}

/** 懒加载主播放上下文 */
function getCtx() {
  if (!bgmCtx) {
    bgmCtx = wx.createInnerAudioContext()
    bgmCtx.volume = bgmVolume
    bgmCtx.onEnded(onTrackEnded)
    bgmCtx.onError(() => {
      // 出错时尝试跳到下一首，避免卡死
      if (enabled) {
        try { onTrackEnded() } catch (e) {}
      }
    })
  }
  return bgmCtx
}

/** 某首播放结束后的接力逻辑 —— 在播放池内顺序走完一轮后重新洗牌 */
function onTrackEnded() {
  if (!enabled) return
  const ctx = getCtx()
  ctx.volume = bgmVolume
  orderIndex++
  if (orderIndex >= order.length) {
    order = shuffle(getPool())
    orderIndex = 0
  }
  const item = BGM_LIST.find(b => b.id === order[orderIndex]) || BGM_LIST[0]
  ctx.src = getUrl(item)
  ctx.play()
}

function notifySettingsChange() {
  if (typeof settingsChangeCb === 'function') settingsChangeCb(selectedIds.slice())
}

// ========== 对外 API ==========

/** 初始化（App.onLaunch 调用，仅读取设置，不自动播放） */
function init() {
  loadSettings()
}

/** 返回 BGM 列表（供设置页渲染） */
function getList() {
  return BGM_LIST.map(b => ({ id: b.id, label: b.label }))
}

/** 当前是否开启 */
function isEnabled() {
  return enabled
}

/** 已选中的 BGM id 列表（随机播放池） */
function getSelectedIds() {
  return selectedIds.slice()
}

/** BGM 音量 0~1 */
function getBgmVolume() {
  return bgmVolume
}

/** 刷题音效音量 0~1 */
function getSfxVolume() {
  return sfxVolume
}

/** 开始/继续播放 —— 在播放池中随机洗牌后顺序播放 */
function play() {
  loadSettings()
  if (!enabled) return
  const ctx = getCtx()
  ctx.volume = bgmVolume
  order = shuffle(getPool())
  orderIndex = 0
  const item = BGM_LIST.find(b => b.id === order[0]) || BGM_LIST[0]
  ctx.src = getUrl(item)
  ctx.play()
}

/** 停止播放 */
function stop() {
  if (bgmCtx) {
    try { bgmCtx.stop() } catch (e) {}
  }
}

/**
 * 切换开关（首页/各页音符按钮点击时调用）
 * @returns {boolean} 切换后是否开启
 */
function toggle() {
  loadSettings()
  enabled = !enabled
  wx.setStorageSync('bgmEnabled', enabled)
  if (enabled) {
    play()
  } else {
    stop()
  }
  return enabled
}

/**
 * 同步开关状态到指定值（用于设置页/恢复等）
 */
function setEnabled(value) {
  loadSettings()
  enabled = !!value
  wx.setStorageSync('bgmEnabled', enabled)
  if (enabled) play(); else stop()
  return enabled
}

/**
 * 设置 BGM 音量（0~1）
 */
function setBgmVolume(v) {
  bgmVolume = Math.max(0, Math.min(1, Number(v) || 0))
  wx.setStorageSync('bgmVolume', bgmVolume)
  if (bgmCtx) bgmCtx.volume = bgmVolume
}

/**
 * 设置刷题音效音量（0~1）
 */
function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, Number(v) || 0))
  wx.setStorageSync('sfxVolume', sfxVolume)
}

/**
 * 切换某首 BGM 的选中状态（加入/移出随机播放池）
 * 取消选中时若已是最后一首则拒绝（至少保留一首）
 * @returns {object} { selected: bool(切换后是否选中), ok: bool(是否成功) }
 */
function toggleSelected(id) {
  loadSettings()
  const idx = selectedIds.indexOf(id)
  let selected
  if (idx === -1) {
    selectedIds.push(id)
    selected = true
  } else {
    if (selectedIds.length <= 1) {
      // 已是最后一首，拒绝取消
      return { selected: true, ok: false }
    }
    selectedIds.splice(idx, 1)
    selected = false
  }
  wx.setStorageSync('selectedBgmList', selectedIds)
  notifySettingsChange()
  // 若正在播放，按新池重新开始
  if (enabled) play()
  return { selected, ok: true }
}

/**
 * 销毁当前试听上下文（解绑回调 + 停止 + 销毁）
 * 微信小程序的 InnerAudioContext 在复用、反复替换 src 时存在兼容性问题：
 * 首次设置 src 能正常播放，但替换 src 后再 play() 经常不会真正出声，
 * 因此每次试听都用全新上下文，播放完毕即销毁，从根本上规避该问题。
 */
function destroyPreviewCtx() {
  if (!previewCtx) return
  try { previewCtx.offCanplay && previewCtx.offCanplay() } catch (e) {}
  try { previewCtx.offPlay && previewCtx.offPlay() } catch (e) {}
  try { previewCtx.offEnded && previewCtx.offEnded() } catch (e) {}
  try { previewCtx.offError && previewCtx.offError() } catch (e) {}
  try { previewCtx.stop() } catch (e) {}
  try { previewCtx.destroy() } catch (e) {}
  previewCtx = null
  // 兜底关闭加载提示，避免因提前停止/出错而让 loading 一直转
  try { wx.hideLoading() } catch (e) {}
}

/**
 * 试听某一首（独立上下文，不打断开关状态）
 * 每次试听都创建全新的 InnerAudioContext，结束后自动销毁，确保每首都能正常出声。
 * 试听期间会暂停主播放，结束后自动恢复
 */
function preview(id) {
  const item = BGM_LIST.find(b => b.id === id)
  if (!item) return

  // 先销毁上一次的试听上下文，避免复用同一 InnerAudioContext 切换 src 的兼容性问题
  destroyPreviewCtx()

  // 若主播放正在进行，先暂停以便清晰试听
  wasPlayingBeforePreview = enabled && bgmCtx && !bgmCtx.paused
  if (wasPlayingBeforePreview && bgmCtx) {
    try { bgmCtx.pause() } catch (e) {}
  }

  // 每次试听都创建独立上下文，回调只绑定一次
  previewCtx = wx.createInnerAudioContext()
  previewCtx.volume = bgmVolume

  // 首次试听需从服务器缓冲音频，显示加载提示以免用户误以为卡住
  wx.showLoading({ title: '加载中...', mask: true })
  let loadingShown = true

  // 音频缓冲到可播放时关闭加载提示（部分基础库可能不触发，故 onPlay 里再兜底一次）
  previewCtx.onCanplay(() => {
    if (!loadingShown) return
    loadingShown = false
    wx.hideLoading()
  })
  previewCtx.onPlay(() => {
    if (!loadingShown) return
    loadingShown = false
    wx.hideLoading()
  })
  previewCtx.onEnded(() => {
    setPreviewingId('')
    if (wasPlayingBeforePreview && enabled && bgmCtx) {
      try { bgmCtx.play() } catch (e) {}
    }
    wasPlayingBeforePreview = false
    destroyPreviewCtx()
  })
  previewCtx.onError(() => {
    setPreviewingId('')
    wasPlayingBeforePreview = false
    destroyPreviewCtx()
    wx.showToast({ title: '试听失败，请稍后重试', icon: 'none' })
  })

  previewCtx.src = getUrl(item)
  previewCtx.play()
  setPreviewingId(id)
}

/** 停止试听 */
function stopPreview() {
  destroyPreviewCtx()
  setPreviewingId('')
  if (wasPlayingBeforePreview && enabled && bgmCtx) {
    try { bgmCtx.play() } catch (e) {}
  }
  wasPlayingBeforePreview = false
}

/** 当前正在试听的 id */
function getPreviewingId() {
  return previewingId
}

function setPreviewingId(id) {
  previewingId = id || ''
  if (typeof previewChangeCb === 'function') previewChangeCb(previewingId)
}

/** 注册试听状态变化回调（设置页用来刷新 UI） */
function onPreviewChange(cb) {
  previewChangeCb = cb
}

/** 注册选中列表变化回调（设置页用来同步 UI） */
function onSettingsChange(cb) {
  settingsChangeCb = cb
}

/**
 * 播放刷题音效（答对/答错），供 quiz / custom 页调用
 * 读取本地 soundEnabled 与 sfxVolume 设置
 */
function playSfx(isCorrect) {
  const soundEnabled = wx.getStorageSync('soundEnabled') === true
  if (!soundEnabled) return
  const sv = wx.getStorageSync('sfxVolume')
  const vol = (sv === '' || sv === undefined || sv === null) ? 1 : Number(sv)
  if (vol <= 0) return
  const src = isCorrect ? '/assets/sfx-correct.mp3' : '/assets/sfx-wrong.mp3'
  const audio = wx.createInnerAudioContext()
  audio.volume = vol
  audio.src = src
  audio.play()
  audio.onEnded(() => audio.destroy())
  audio.onError(() => audio.destroy())
}

module.exports = {
  init,
  getList,
  isEnabled,
  getSelectedIds,
  getBgmVolume,
  getSfxVolume,
  play,
  stop,
  toggle,
  setEnabled,
  setBgmVolume,
  setSfxVolume,
  toggleSelected,
  preview,
  stopPreview,
  getPreviewingId,
  onPreviewChange,
  onSettingsChange,
  playSfx
}
