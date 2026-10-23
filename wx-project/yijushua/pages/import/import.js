/**
 * 导入题目页
 * --------------------------------------------------
 * 功能：
 *   1. 展示题目格式规范说明（可复制给其他平台AI）
 *   2. 用户上传文档或粘贴文本（按格式规范编写）
 *   3. 后端直接解析入库，不走AI，即时完成
 *   4. 用户可选择导入到哪个分类
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

// 格式规范文本
const FORMAT_SPEC = `每道题按以下格式编写，题目之间用空行分隔：

题干：一句话题干（难度高不超过50字，难度初/中不超过30字）
A.选项A内容（难度高不超过20字，难度初/中不超过15字）
B.选项B内容
C.选项C内容
D.选项D内容
答案：B
解析：一句话解析（选填）
难度：中（初/中/高，选填，默认中）

注意事项：
1."题干"和"答案"为必填，选项至少2个
2.答案支持多选，如"答案：ABD"
3."解析"和"难度"为选填，不填不影响导入
4.选项支持 A. / A、 / A) 等格式
5.题目之间必须用空行分隔`

// 文件大小限制
const DOC_TYPES = ['pdf', 'doc', 'docx', 'txt']
const DOC_MAX_SIZE = 1 * 1024 * 1024 // 1MB

Page({
  data: {
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    formatSpec: FORMAT_SPEC,
    categories: [],           // 分类列表
    selectedCategory: null,   // {id, name}
    showTextInput: false,
    textInputValue: '',
    importing: false,
    importResult: null,       // {imported, failed, total}
    showPrivacy: false,       // 隐私授权弹窗
    specExpanded: false        // 格式规范展开状态
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.loadCategories()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    this.setData({ darkMode, fontScale })

    // 注册隐私授权弹窗处理器：本页会触发 chooseMessageFile
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization(resolve => {
        this.setData({ showPrivacy: true })
        this._privacyResolve = resolve
      })
    }
  },

  /**
   * 加载用户分类列表
   */
  loadCategories() {
    api.getCustomCategoryList().then(data => {
      const list = data.list || []
      this.setData({ categories: list })
    }).catch(() => {})
  },

  /**
   * 展开/收起格式规范
   */
  onToggleSpec() {
    this.setData({ specExpanded: !this.data.specExpanded })
  },

  /**
   * 复制格式规范
   */
  onCopySpec() {
    wx.setClipboardData({
      data: FORMAT_SPEC,
      success() {
        wx.showToast({ title: '已复制格式规范', icon: 'success' })
      }
    })
  },

  /**
   * 选择导入分类
   */
  onSelectCategory() {
    const items = this.data.categories.map(c => c.name)
    wx.showActionSheet({
      itemList: items.length ? items : ['其他'],
      success: (res) => {
        const cat = this.data.categories[res.tapIndex]
        if (cat) {
          this.setData({
            selectedCategory: { id: cat.id, name: cat.name }
          })
        }
      }
    })
  },

  /**
   * 选择文档上传
   */
  onChooseFile() {
    if (this.data.importing) return

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: DOC_TYPES,
      success: (res) => {
        const file = res.tempFiles[0]
        this.checkAndImportFile(file.path, file.size)
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 校验文件大小并导入
   */
  checkAndImportFile(filePath, size) {
    const ext = filePath.split('.').pop().toLowerCase()
    if (!DOC_TYPES.includes(ext)) {
      wx.showToast({ title: '不支持的格式：' + ext, icon: 'none' })
      return
    }
    if (size > DOC_MAX_SIZE) {
      wx.showToast({ title: '文件大小超过限制（最大1MB）', icon: 'none' })
      return
    }

    this.doImportFile(filePath)
  },

  /**
   * 执行文件导入
   */
  doImportFile(filePath) {
    const categoryId = this.data.selectedCategory ? this.data.selectedCategory.id : 0

    this.setData({ importing: true })

    api.importQuestionsFromFile(filePath, categoryId).then(data => {
      this.setData({
        importing: false,
        importResult: data
      })
      wx.showToast({
        title: '成功导入' + data.imported + '道题',
        icon: 'success',
        duration: 2000
      })
    }).catch((err) => {
      this.setData({ importing: false })
      const msg = err && err.msg ? err.msg : '导入失败'
      const code = err && err.code ? err.code : 0
      if (code === 403) {
        wx.showToast({ title: '内容包含违规信息', icon: 'none' })
      } else {
        wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      }
    })
  },

  /**
   * 显示粘贴文本输入区
   */
  onShowTextInput() {
    if (this.data.importing) return
    this.setData({ showTextInput: true })
  },

  /**
   * 关闭粘贴文本输入区
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
   * 提交导入文本
   */
  onSubmitText() {
    const text = this.data.textInputValue.trim()
    if (!text) {
      wx.showToast({ title: '请输入题目文本', icon: 'none' })
      return
    }
    if (text.length < 10) {
      wx.showToast({ title: '文本内容太短', icon: 'none' })
      return
    }
    if (text.length > 50000) {
      wx.showToast({ title: '文本内容过长（最大50000字）', icon: 'none' })
      return
    }

    const categoryId = this.data.selectedCategory ? this.data.selectedCategory.id : 0

    this.setData({ importing: true })

    api.importQuestionsFromText(text, categoryId).then(data => {
      this.setData({
        importing: false,
        importResult: data,
        showTextInput: false,
        textInputValue: ''
      })
      wx.showToast({
        title: '成功导入' + data.imported + '道题',
        icon: 'success',
        duration: 2000
      })
    }).catch((err) => {
      this.setData({ importing: false })
      const msg = err && err.msg ? err.msg : '导入失败'
      const code = err && err.code ? err.code : 0
      if (code === 403) {
        wx.showToast({ title: '内容包含违规信息', icon: 'none' })
      } else {
        wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      }
    })
  },

  /**
   * 清空结果
   */
  onClearResult() {
    this.setData({ importResult: null })
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
