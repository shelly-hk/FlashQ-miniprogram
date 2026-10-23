/**
 * 上传出题页
 * --------------------------------------------------
 * 核心流程：
 *   1. 进页面 → 查询上传配额
 *   2. 用户选图片/文档/粘贴文本 → 前端校验类型和大小
 *   3. 上传成功 → 注册到全局后台轮询 → 提示用户可返回
 *   4. 用户可自由返回其他页面操作，生成完成后全局弹窗通知
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

// 文件类型与大小限制
const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp']
const IMAGE_MAX_SIZE = 5 * 1024 * 1024   // 5MB
const DOC_TYPES = ['pdf', 'doc', 'docx', 'txt']
const DOC_MAX_SIZE = 1 * 1024 * 1024     // 1MB

Page({
  data: {
    quota: { dailyLimit: 30, usedToday: 0, remaining: 30, extraReward: 0 },
    uploading: false,       // 是否正在上传（文件传输阶段）
    uploadFileName: '',     // 当前上传的文件名
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    showPrivacy: false,
    showTextInput: false,
    textInputValue: ''
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.loadQuota()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({ darkMode, fontScale })
    this.loadQuota()

    // 注册隐私授权弹窗处理器：本页会触发 chooseMedia / chooseMessageFile，
    // 每次显示都重新注册，确保触发隐私接口时弹出的是本页的自定义弹窗
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization(resolve => {
        this.setData({ showPrivacy: true })
        this._privacyResolve = resolve
      })
    }
  },

  /**
   * 查询今日上传配额
   */
  loadQuota() {
    api.getUploadQuota().then(data => {
      this.setData({ quota: data })
    }).catch(() => {})
  },

  /**
   * 选择图片上传
   */
  onChooseImage() {
    if (this.data.quota.remaining <= 0) {
      wx.showToast({ title: '今日上传次数已用完', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles[0]
        this.checkAndUpload(file.tempFilePath, file.size, 'image')
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择图片失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 选择文档上传
   */
  onChooseFile() {
    if (this.data.quota.remaining <= 0) {
      wx.showToast({ title: '今日上传次数已用完', icon: 'none' })
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: DOC_TYPES,
      success: (res) => {
        const file = res.tempFiles[0]
        this.checkAndUpload(file.path, file.size, 'document')
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 显示粘贴文本输入区域
   */
  onShowTextInput() {
    if (this.data.quota.remaining <= 0) {
      wx.showToast({ title: '今日上传次数已用完', icon: 'none' })
      return
    }
    this.setData({ showTextInput: true })
  },

  /**
   * 关闭粘贴文本输入区域
   */
  onCloseTextInput() {
    this.setData({ showTextInput: false })
  },

  /**
   * 文本输入
   */
  onTextInput(e) {
    this.setData({ textInputValue: e.detail.value })
  },

  /**
   * 提交文本生成题目
   */
  onSubmitText() {
    const text = this.data.textInputValue.trim()
    if (!text) {
      wx.showToast({ title: '请输入文本内容', icon: 'none' })
      return
    }
    if (text.length < 10) {
      wx.showToast({ title: '文本内容太短，至少10个字', icon: 'none' })
      return
    }

    this.setData({
      showTextInput: false,
      uploading: true,
      uploadFileName: '粘贴文本'
    })

    api.uploadText(text).then(data => {
      this.onUploadSuccess(data.taskId, '粘贴文本')
    }).catch((err) => {
      this.setData({ uploading: false })
      const msg = err && err.msg ? err.msg : '提交失败'
      const code = err && err.code ? err.code : 0
      if (code === 429) {
        wx.showToast({ title: '今日上传次数已用完', icon: 'none' })
        this.loadQuota()
      } else {
        wx.showToast({ title: msg, icon: 'none' })
      }
    })
  },

  /**
   * 校验文件类型与大小，通过后上传
   */
  checkAndUpload(filePath, size, type) {
    const ext = filePath.split('.').pop().toLowerCase()
    const validTypes = type === 'image' ? IMAGE_TYPES : DOC_TYPES
    const maxSize = type === 'image' ? IMAGE_MAX_SIZE : DOC_MAX_SIZE

    if (!validTypes.includes(ext)) {
      wx.showToast({ title: '不支持的格式：' + ext, icon: 'none' })
      return
    }

    if (size > maxSize) {
      const maxStr = type === 'image' ? '5MB' : '1MB'
      wx.showToast({ title: '文件大小超过限制（最大' + maxStr + '）', icon: 'none' })
      return
    }

    this.doUpload(filePath)
  },

  /**
   * 执行上传（文件传输阶段）
   */
  doUpload(filePath) {
    const fileName = filePath.split('/').pop() || filePath
    this.setData({ uploading: true, uploadFileName: fileName })

    api.uploadFile(filePath, 0).then(data => {
      this.onUploadSuccess(data.taskId, fileName)
    }).catch((err) => {
      this.setData({ uploading: false })
      const msg = err && err.msg ? err.msg : '上传失败'
      const code = err && err.code ? err.code : 0

      if (code === 429) {
        wx.showToast({ title: '今日上传次数已用完', icon: 'none' })
        this.loadQuota()
      } else {
        wx.showToast({ title: msg, icon: 'none' })
      }
    })
  },

  /**
   * 上传成功 — 注册到全局后台轮询，提示用户可离开
   */
  onUploadSuccess(taskId, fileName) {
    const app = getApp()
    app.addPendingTask(taskId, fileName)

    this.setData({ uploading: false })
    this.loadQuota()

    // 提示用户：任务较多时可能排队，做完会通知。用 showModal 让长文案显示完整
    wx.showModal({
      title: '提交成功',
      content: 'AI 正在后台生成题目，任务较多时可能需要排队，请耐心等待。\n\n你可以先去做其他事，完成后会通知你～',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#576B95'
    })

    // 显示弹窗让用户选择：返回或继续上传
    this.setData({
      showTextInput: false,
      textInputValue: ''
    })
  },

  /**
   * 跳转到导入题目页
   */
  onGoImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  /* -------------------- 隐私授权 -------------------- */

  handleAgreePrivacy() {
    this._privacyResolve && this._privacyResolve({ buttonId: 'agree-btn', event: 'agree' })
    this.setData({ showPrivacy: false })
  },

  handleDisagreePrivacy() {
    this._privacyResolve && this._privacyResolve({ event: 'disagree' })
    this.setData({ showPrivacy: false })
  },

  onOpenPrivacyContract() {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract()
    } else {
      wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
    }
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '我正在用一句刷，快来一起挑战吧！',
      path: '/pages/home/home'
    }
  }
})
