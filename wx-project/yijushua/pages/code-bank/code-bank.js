/**
 * 代码题库入口页
 * --------------------------------------------------
 * 两步式选择：刷题模式（快速刷/质量刷）→ 编程语言科目 → 进入 quiz 页
 * 跳转时携带 quizType=code、style 和选中的科目参数
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
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    step: 'mode',            // mode=第一步选模式 / subject=第二步选科目
    style: '',               // 刷题风格：quick / quality
    modeName: '',            // 当前模式名称（快速刷/质量刷）
    modeIcon: '',            // 当前模式图标
    subjects: [],            // 代码科目列表（含"全部"）
    selectedSubjectId: 0,    // 选中科目ID（0=全部）
    selectedSubjectName: '全部',
    loadingSubjects: false
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.setData({ darkMode: _darkMode })
    this._subjectsLoaded = false
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({ darkMode, fontScale })
  },

  /**
   * 快速刷 → 进入科目选择
   */
  onQuick() {
    this._enterSubjectStep('quick', '快速刷', '⚡')
  },

  /**
   * 质量刷 → 进入科目选择
   */
  onQuality() {
    this._enterSubjectStep('quality', '质量刷', '🧠')
  },

  /**
   * 第二步：切到科目选择视图（科目列表只拉一次，返回重选不重复请求）
   */
  _enterSubjectStep(style, name, icon) {
    this.setData({
      step: 'subject',
      style: style,
      modeName: name,
      modeIcon: icon,
      selectedSubjectId: 0,
      selectedSubjectName: '全部'
    })
    if (!this._subjectsLoaded) this.loadSubjects()
  },

  /**
   * 加载代码科目列表（quiz_type='code' 的独立科目体系）
   */
  loadSubjects() {
    this.setData({ loadingSubjects: true })
    api.getSubjectList('code').then(data => {
      this._subjectsLoaded = true
      const subjects = [{ id: 0, name: '全部' }].concat(data || [])
      this.setData({ subjects: subjects, loadingSubjects: false })
    }).catch(() => {
      // 加载失败仅保留"全部"，不打断流程
      this.setData({ subjects: [{ id: 0, name: '全部' }], loadingSubjects: false })
    })
  },

  /**
   * 选择科目
   */
  onSelectSubject(e) {
    this.setData({
      selectedSubjectId: Number(e.currentTarget.dataset.id),
      selectedSubjectName: e.currentTarget.dataset.name
    })
  },

  /**
   * 返回第一步重选模式
   */
  onBackToMode() {
    this.setData({ step: 'mode' })
  },

  /**
   * 开始刷题 → 跳转 quiz 页，携带题目类型、风格与科目
   * 跳转前预拉取首题，缩短首屏白屏时间
   */
  onStart() {
    const style = this.data.style
    const subjectId = this.data.selectedSubjectId

    // 预拉取首题（签名需与 quiz.onLoad 计算方式一致）
    const signature = 'quizType=code&subjectId=' + subjectId + '&difficulty=0&style=' + style
    const app = getApp()
    app.globalData.preloadedFirstQuestion = {
      signature: signature,
      promise: api.getRandomQuestion(subjectId, 0, 'code', style),
      expire: Date.now() + 30000
    }

    const params = [
      'quizType=code',
      'style=' + style,
      'subjectId=' + subjectId,
      'subjectName=' + encodeURIComponent(this.data.selectedSubjectName)
    ].join('&')
    wx.navigateTo({ url: '/pages/quiz/quiz?' + params })
  },

  onShareAppMessage() {
    return {
      title: '我正在用一句刷刷代码题，快来一起挑战吧！',
      path: '/pages/home/home'
    }
  }
})
