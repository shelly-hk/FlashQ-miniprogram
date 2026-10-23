/**
 * 刷题前设置页
 * --------------------------------------------------
 * 选择难度和科目，确认后跳转到刷题页
 * 新手引导承接：第二步「quiz-setup」会高亮底部「开始刷题」按钮
 */

const api = require('../../utils/api.js')
const onboarding = require('../../utils/onboarding.js')

// 模块加载时读一次主题：保证首帧渲染就是当前主题，避免深色模式切页闪白
const _darkMode = wx.getStorageSync('darkMode') === true

function applyNavBar(dark) {
  // 日间导航栏与页面背景同色 #E8F6F5（原本写死在 quiz-setup.json 里，
  // 静态值会在窗口创建时就被原生层画上去，深色模式切页会闪一下，故改为按主题动态设置）
  wx.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: dark ? '#1a1a1a' : '#E8F6F5'
  })
  // 同步原生窗口背景色：否则切页时原生层先按 app.json 的浅色画一帧
  var bg = dark ? '#1a1a1a' : '#f5f6f8'
  wx.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg
  })
}

const DIFFICULTY_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 1, label: '初级' },
  { value: 2, label: '中级' },
  { value: 3, label: '高级' }
]

Page({
  data: {
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    difficulties: DIFFICULTY_OPTIONS,
    selectedDifficulty: 0,
    selectedDifficultyLabel: '全部',
    subjects: [],
    selectedSubjectId: 0,
    selectedSubjectName: '全部',
    loadingSubjects: false,
    // ====== 新手引导（承接首页第二步） ======
    onboardingStep: null,        // 当前应在本页显示的引导步骤（无则 null）
    onboardingStepIndex: 0,      // 步骤序号（用于「03 / 05」展示）
    onboardingTotal: 5,          // 总步数
    onboardingClosing: false,    // 引导气泡退出动画
    onboardingSpotlight: null    // 高亮目标几何信息 { left, top, width, height }
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.setData({ darkMode: _darkMode })
    this.loadSubjects()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({ darkMode, fontScale })
    // 同步新手引导：若当前步骤属于本页，则渲染引导气泡 + 高亮目标
    this._syncOnboarding()
  },

  onHide() {
    this._clearOnboardingClosingTimer()
  },

  onUnload() {
    this._clearOnboardingClosingTimer()
  },

  /**
   * 同步新手引导状态
   * - 若当前步骤属于本页（quiz-setup）→ 渲染气泡 + 高亮目标
   * - 否则什么都不显示（首页或其他页面会处理）
   */
  _syncOnboarding() {
    const allSteps = onboarding.getAllSteps()
    const step = onboarding.getStepForPage('pages/quiz-setup/quiz-setup')

    let stepIndex = 0
    if (step) {
      const ids = allSteps.map(s => s.id)
      stepIndex = ids.indexOf(step.id)
    }

    this.setData({
      onboardingStep: step,
      onboardingStepIndex: stepIndex,
      onboardingTotal: allSteps.length,
      onboardingSpotlight: null,
      onboardingClosing: false
    })

    // 若该步骤有高亮目标，等渲染完成后测量其位置
    if (step && step.target) {
      setTimeout(() => this._measureOnboardingTarget(step.target), 120)
    }
  },

  /**
   * 测量高亮目标的屏幕坐标
   */
  _measureOnboardingTarget(target) {
    const selMap = {
      'start-btn': '.js-entry-start-btn'
    }
    const sel = selMap[target] || '.js-entry-' + target
    wx.createSelectorQuery()
      .selectAll(sel)
      .boundingClientRect()
      .exec(res => {
        const rects = res && res[0]
        if (!rects || !rects.length) return
        const r = rects[0]
        if (!r || !r.width) return
        this.setData({
          onboardingSpotlight: {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height
          }
        })
      })
  },

  /**
   * 点击引导气泡主按钮（「我知道了」）
   * 本页步骤不是 completeOnTargetTap 类型，直接完成并推进
   */
  onOnboardingPrimary() {
    const step = this.data.onboardingStep
    if (!step) return
    onboarding.completeCurrentStep()
    this._afterOnboardingChange()
  },

  /**
   * 阻止引导蒙层事件穿透
   */
  onOnboardingNoop() {},

  /**
   * 点击高亮的「开始刷题」按钮（spotlight 区域）
   * 直接走原跳转逻辑；onStart 内部会一并完成当前引导步骤并推进到 quiz 页
   */
  onOnboardingTargetTap() {
    if (!this.data.onboardingStep) return
    try { wx.vibrateShort({ type: 'light', fail: () => {} }) } catch (e) {}
    this.onStart()
  },

  /**
   * 引导状态变更后的统一收尾
   */
  _afterOnboardingChange() {
    this.setData({ onboardingClosing: true })
    this._clearOnboardingClosingTimer()
    this._onboardingClosingTimer = setTimeout(() => {
      this.setData({ onboardingClosing: false })
      this._syncOnboarding()
    }, 260)
  },

  _clearOnboardingClosingTimer() {
    if (this._onboardingClosingTimer) {
      clearTimeout(this._onboardingClosingTimer)
      this._onboardingClosingTimer = null
    }
  },

  /**
   * 加载科目列表
   */
  loadSubjects() {
    this.setData({ loadingSubjects: true })
    api.getSubjectList().then(data => {
      const subjects = [{ id: 0, name: '全部' }].concat(data || [])
      this.setData({ subjects, loadingSubjects: false })
    }).catch(() => {
      this.setData({ subjects: [{ id: 0, name: '全部' }], loadingSubjects: false })
    })
  },

  /**
   * 选择难度
   */
  onSelectDifficulty(e) {
    const value = Number(e.currentTarget.dataset.value)
    const label = (DIFFICULTY_OPTIONS.find(item => item.value === value) || {}).label || '全部'
    this.setData({ selectedDifficulty: value, selectedDifficultyLabel: label })
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
   * 开始刷题 → 跳转到 quiz 页，带上选中的难度和科目
   * 正常随机刷题不传 quizType，由后端默认返回全部题目（排除 code/interview 新题型）
   *
   * 性能优化：跳转前先发起首题请求（预拉取），把 Promise 槽存到 globalData，
   * quiz.onLoad 直接 await 这个 Promise，省掉进入页面后再发请求的等待时间
   *
   * 引导承接：若新手引导正好停留在本页步骤，则一并标记完成
   */
  onStart() {
    // 引导承接：标记当前步骤完成（防止用户没点气泡就直接点开始）
    if (this.data.onboardingStep) {
      onboarding.completeCurrentStep()
    }

    const difficulty = this.data.selectedDifficulty
    const subjectId = this.data.selectedSubjectId

    // 预拉取首题：把请求 Promise 与签名挂到全局，quiz 页消费后自动清空
    const signature = 'quizType=&subjectId=' + subjectId + '&difficulty=' + difficulty + '&style='
    const app = getApp()
    app.globalData.preloadedFirstQuestion = {
      signature: signature,
      promise: api.getRandomQuestion(subjectId, difficulty, '', ''),
      expire: Date.now() + 30000
    }

    const params = [
      'difficulty=' + difficulty,
      'subjectId=' + subjectId,
      'subjectName=' + encodeURIComponent(this.data.selectedSubjectName)
    ].join('&')

    wx.navigateTo({ url: '/pages/quiz/quiz?' + params })
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
