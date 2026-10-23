/**
 * 刷题页（首页）—— 整个小程序最核心的页面
 * --------------------------------------------------
 * 核心流程：
 *   1. 进页面 → 加载科目列表 → 自动取一道题
 *   2. 用户可筛选科目 / 难度 → 按条件取题
 *   3. 用户点选项 → 提交判题
 *   4. 展示对错反馈 + 解析
 *   5. 答对 → 0.8秒后自动取下一题；答错 → 等用户手动点「下一题」
 */

const api = require('../../utils/api.js')
const qcache = require('../../utils/question-cache.js')
const dailyStats = require('../../utils/daily-stats.js')
const onboarding = require('../../utils/onboarding.js')

// 模块加载时读一次主题：保证首帧渲染就是当前主题，避免深色模式切页闪白
const _darkMode = wx.getStorageSync('darkMode') === true

/**
 * 检测题目是否为多选题（仅自主题库的题会有 answer 字段，官方题库不会）
 */
function detectMultiChoice(question) {
  if (!question) return false
  // 优先使用后端返回的显式标识（不泄露答案）
  if (question.isMultiChoice === true) return true
  if (question.isMultiple === true) return true
  if (question.questionType === 'multiple' || question.type === 'multiple') return true
  // 兜底：本地列表接口可能直接返回了 answer/correctAnswer
  var ans = typeof question.answer === 'string' ? question.answer
          : (typeof question.correctAnswer === 'string' ? question.correctAnswer : '')
  if (ans.length > 1) return true
  return false
}

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

// 难度选项（固定，不依赖后端）
const DIFFICULTY_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 1, label: '初级' },
  { value: 2, label: '中级' },
  { value: 3, label: '高级' }
]

/**
 * 学习报告埋点：科目正确率 + 答题时段
 * 写入 localStorage 'reportStats'：
 *   { subjects: { 科目名: { total, correct } }, hours: { 0..23: count } }
 */
function trackAnswer(subjectName, isCorrect) {
  try {
    const stats = wx.getStorageSync('reportStats') || { subjects: {}, hours: {} }
    if (!stats.subjects) stats.subjects = {}
    if (!stats.hours) stats.hours = {}
    // 科目统计
    const name = (subjectName && String(subjectName).trim()) || '未分类'
    const s = stats.subjects[name] || { total: 0, correct: 0 }
    s.total += 1
    if (isCorrect) s.correct += 1
    stats.subjects[name] = s
    // 时段统计（0-23 点）
    const h = new Date().getHours()
    stats.hours[h] = (stats.hours[h] || 0) + 1
    wx.setStorageSync('reportStats', stats)
  } catch (e) {
    // 埋点失败不影响主流程
  }
}

/**
 * 答题日历埋点：每答一题即把当日计数 +1 写入 dailyStats（+ 本机埋点 dailyStatsLocal）
 * 与 mine.js 的 mergeServerToday 协同：
 *   - 本函数按"答一题 +1"增量写入（实时）
 *   - mine.js / report.js 用 mergeServerToday 合并服务端快照，防止跨天陈旧值污染
 * 本地日期键与 mine.js / report.js 一致，避免 toISOString 时区跨日
 */
function recordDailyAnswer() {
  dailyStats.recordDailyAnswer()
}

Page({
  data: {
    // ---- 筛选相关 ----
    subjects: [],            // 科目列表（从后端获取）
    selectedSubjectId: 0,   // 当前选中的科目ID（0=全部）
    selectedSubjectName: '全部科目',  // 当前选中的科目名称
    difficulties: DIFFICULTY_OPTIONS,  // 难度列表
    selectedDifficulty: 0,  // 当前选中的难度（0=全部）
    showFilter: false,      // 筛选面板是否展开

    // ---- 题目相关 ----
    question: null,       // 当前题目对象
    options: [],          // 处理后的选项数组
    selectedOption: '',   // 用户选中的字母（单选）
    pressedOption: '',    // 按压反馈：当前按下的选项字母（驱动深色层副本）
    selectedOptions: [],  // 多选题已选字母数组
    isMultiChoice: false, // 当前题是否多选题
    judged: false,        // 是否已判题
    isCorrect: false,     // 是否答对
    correctAnswer: '',    // 正确答案
    explanation: '',      // 解析
    loading: false,       // 加载状态
    autoNext: true,       // 自动跳转下一题
    autoNextDelay: 0,     // 答对后停留秒数（0=不停留）
    countdown: 0,         // 倒计时剩余秒数
    darkMode: _darkMode,      // 深色模式（模块加载时读，保证首帧就是当前主题，切页不闪白）
    darkLayerVisible: _darkMode,
    darkClipPath: 'circle(0px at 50% 50%)',
    themeAnimating: false,
    clipNoTransition: false,  // 短暂禁用过渡：用于 circle ↔ inset(0) 形状切换瞬间（避免浏览器扭曲插值）
    bgmEnabled: false,    // 背景音乐开关
    hasHistory: false,    // 是否有上一题可返回
    soundEnabled: false,  // 音效开关（默认关闭）
    quizMode: 'normal',   // 刷题模式：normal/wrong/favorite/customWrong/customFavorite
    quizType: '',         // 题目类型：''(默认it随机题)/code/interview
    style: '',            // 刷题风格：''/quick/quality（代码题/面试题用）
    reviewFinished: false, // 专项复习：是否已刷完
    fromHistory: false,   // 是否从历史栈恢复（用于强制显示"下一题"按钮）
    reviewFilterId: null,  // 专项复习筛选ID（科目ID或分类ID，null=全部）
    loadError: false,     // 取题是否失败（用于显示重试按钮）
    emptyPool: false,     // 题库为空（后端返回null），区分于网络错误
    offlineMode: false,   // 当前题是否来自本地缓存（断网兜底，用于顶部提示）
    reviewCurrentNum: 0,  // 专项复习：当前第几题（1-based）
    reviewTotalNum: 0,    // 专项复习：本轮共多少题
    showSubjectFilter: true,  // 是否显示科目筛选（代码题/面试题/默认随机题均为 true，使用各自独立科目体系）
    interviewRevealed: false,  // 面试题专属：是否已点击"查看解析"显示解析面板
    // ---- 普通随机刷题：本轮去重 ----
    poolFinished: false,  // 本轮已刷完所有不重复的题（控制"再来一轮"弹窗）
    answeredCount: 0,     // 本轮已答题目数（用于展示进度）
    // ---- 答对粒子爆开 ----
    showParticles: false,    // 是否显示粒子 overlay
    particles: [],            // 粒子数组（动态生成角度/距离/颜色）
    // ---- 适老化：字号缩放 ----
    fontScale: 'medium',      // 小/中/大（small/medium/large）—— 在 onShow 中从本地存储读取
    // ====== 新手引导（承接第三步「quiz-answer」） ======
    onboardingStep: null,         // 当前应在本页显示的引导步骤
    onboardingStepIndex: 0,       // 步骤序号（用于「04 / 05」展示）
    onboardingTotal: 5,           // 总步数
    onboardingClosing: false,     // 引导气泡退出动画
    onboardingSpotlight: null     // 高亮目标几何信息 { left, top, width, height }
  },

  /**
   * 是否处于专项复习模式（公共或自主题库的错题/收藏）
   */
  isReviewMode() {
    const m = this.data.quizMode
    return m === 'wrong' || m === 'favorite' || m === 'customWrong' || m === 'customFavorite'
  },

  /**
   * 是否为自主题库模式
   */
  isCustomMode() {
    const m = this.data.quizMode
    return m === 'customWrong' || m === 'customFavorite'
  },

  onLoad(options) {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.history = []     // 做题历史（完整快照数组）
    this.historyIndex = -1  // 当前在历史中的位置指针
    this.reviewList = []  // 专项复习题目列表
    this.reviewIndex = 0  // 专项复习当前索引
    this._firstLoad = true  // 首题标志：用于消费预拉取的 Promise
    this.answeredIds = null  // 本轮已答题目 ID 集合（Set，延迟初始化，仅 normal 模式使用）

    // 接收刷题模式参数
    if (options && options.mode) {
      this.setData({ quizMode: options.mode })
      // 专项复习模式：接收科目/分类筛选参数
      if (this.isReviewMode()) {
        // 接收题目类型参数（代码题/面试题复习）
        if (options.quizType) {
          this.setData({ quizType: options.quizType })
        }
        // 解析筛选参数
        if (options.subjectId !== undefined && Number(options.subjectId) > 0) {
          this.setData({ reviewFilterId: Number(options.subjectId) })
        } else if (options.categoryId !== undefined && Number(options.categoryId) > 0) {
          this.setData({ reviewFilterId: Number(options.categoryId) })
        }
        this.readSettings()
        this.loadReviewQuestions()
        return
      }
    }

    // 先解析题目类型与刷题风格（代码题/面试题入口传入）
    const qt = options && options.quizType ? options.quizType : ''
    const isCodeInterview = (qt === 'code' || qt === 'interview')
    if (qt) this.setData({ quizType: qt })
    if (options && options.style) this.setData({ style: options.style })

    if (isCodeInterview) {
      if (qt === 'code') {
        // 代码题：有独立科目体系（quiz_type='code'），加载代码科目并启用科目筛选
        this.setData({ showSubjectFilter: true, selectedSubjectName: '全部科目' })
        this.loadSubjects('code')
      } else {
        // 面试题：有独立岗位科目体系（quiz_type='interview'），加载面试科目并启用科目筛选
        this.setData({ showSubjectFilter: true, selectedSubjectName: '全部' })
        this.loadSubjects('interview')
      }
    } else {
      // 正常随机刷题：加载 IT 科目列表供筛选
      this.setData({ showSubjectFilter: true })
      this.loadSubjects()
    }

    // 接收 quiz-setup / code-bank / interview-bank 传来的难度和科目参数
    if (options && options.difficulty !== undefined) {
      this.setData({ selectedDifficulty: Number(options.difficulty) })
    }
    if (options && options.subjectId !== undefined) {
      const subjectName = options.subjectName ? decodeURIComponent(options.subjectName) : '已选科目'
      this.setData({
        selectedSubjectId: Number(options.subjectId),
        selectedSubjectName: subjectName
      })
    }

    this.readSettings()
    // 普通随机刷题：加载本轮已答 ID 集合（按筛选维度隔离）
    this._loadAnsweredPool()
    this.loadQuestion()
  },

  onShow() {
    this.readSettings()
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({
      darkMode,
      fontScale,
      darkLayerVisible: darkMode,
      // 深色稳定态用 inset(0) 矩形全覆盖（不用超大半径 circle，
      // 否则长题干/长解析页面滚动到下方时会露出浅色层）
      darkClipPath: darkMode ? 'inset(0)' : 'circle(0px at 50% 50%)',
      bgmEnabled: getApp().globalData.bgm.isEnabled()
    })
    // 同步新手引导：若当前步骤属于本页，则渲染气泡 + 高亮选项区
    this._syncOnboarding()
  },

  /**
   * 同步新手引导状态
   * - 仅当当前步骤属于本页（quiz）时渲染气泡；否则不显示
   * - 仅在普通随机刷题（quizMode==='normal' 且 quizType==='')时承接，
   *   避免代码题/面试题/复习模式与引导气泡同时出现造成混乱
   */
  _syncOnboarding() {
    const allSteps = onboarding.getAllSteps()
    const step = onboarding.getStepForPage('pages/quiz/quiz')

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

    // 若该步骤有高亮目标且题目已就绪，等渲染完成后测量
    if (step && step.target && this.data.question && !this.data.loading) {
      setTimeout(() => this._measureOnboardingTarget(step.target), 200)
    }
  },

  /**
   * 测量高亮目标的屏幕坐标（仅支持选项区）
   */
  _measureOnboardingTarget(target) {
    const selMap = {
      'options': '.js-entry-options'
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
   * 点击引导气泡主按钮（「开始答题」）
   * 本页步骤不是 completeOnTargetTap，直接完成并推进至最后一步（complete）
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
   * 从本地缓存读取用户设置
   */
  readSettings() {
    const autoNext = wx.getStorageSync('autoNext')
    if (autoNext !== '' && autoNext !== undefined) {
      this.setData({ autoNext: autoNext })
    }
    const delay = wx.getStorageSync('autoNextDelay')
    if (delay !== '' && delay !== undefined) {
      this.setData({ autoNextDelay: delay })
    }
    const soundEnabled = wx.getStorageSync('soundEnabled') === true
    this.setData({ soundEnabled })
  },

  /**
   * 加载科目列表
   * 调用接口：GET /api/subject/list（quizType 可选，加载对应题库的独立科目）
   */
  loadSubjects(quizType) {
    api.getSubjectList(quizType).then(data => {
      // 在列表最前面加上"全部"选项
      const subjects = [{ id: 0, name: '全部' }].concat(data || [])
      this.setData({ subjects: subjects })
    }).catch(() => {
      // 科目列表加载失败，用默认的"全部"
      this.setData({ subjects: [{ id: 0, name: '全部' }] })
    })
  },

  /* ============================================================
   * 普通随机刷题：本轮去重
   * ------------------------------------------------------------
   * 策略：按当前筛选维度（quizType+subjectId+difficulty+style）在本地 storage
   * 维护一个"已答题目 ID 集合"。每次拉到新题先查集合，命中则换一道；
   * 连续多次（POOL_MAX_RETRY）都命中已答即判定本轮刷完 → 弹"再来一轮"。
   * 用户切换科目/难度 → 切到另一个维度的已答集合；
   * 用户点"再来一轮" → 清空当前维度集合重新开始。
   * ============================================================ */

  /**
   * 本轮去重的最大重试次数：超过即判定刷完
   * 8 次足以覆盖绝大多数题库场景；题库特别小时也能快速判定。
   */
  _poolMaxRetry() {
    return 8
  },

  /**
   * 生成本轮去重的 storage key（按筛选维度隔离，避免不同维度互相污染）
   */
  _getPoolKey() {
    const qt = this.data.quizType || ''
    const subj = this.data.selectedSubjectId || 0
    const diff = this.data.selectedDifficulty || 0
    const style = this.data.style || ''
    return 'answeredPool_' + qt + '_' + subj + '_' + diff + '_' + style
  },

  /**
   * 从 storage 加载本轮已答 ID 集合到内存（按当前筛选维度）
   * 仅在 normal 模式下使用，复习模式不走此路径
   */
  _loadAnsweredPool() {
    if (this.isReviewMode()) {
      this.answeredIds = null
      this.setData({ answeredCount: 0, poolFinished: false })
      return
    }
    try {
      const key = this._getPoolKey()
      const saved = wx.getStorageSync(key)
      if (saved && Array.isArray(saved.ids)) {
        this.answeredIds = new Set(saved.ids)
      } else {
        this.answeredIds = new Set()
      }
      this.setData({
        answeredCount: this.answeredIds.size,
        poolFinished: false
      })
    } catch (e) {
      this.answeredIds = new Set()
      this.setData({ answeredCount: 0, poolFinished: false })
    }
  },

  /**
   * 把本轮已答 ID 集合持久化到 storage
   */
  _saveAnsweredPool() {
    if (!this.answeredIds) return
    try {
      const key = this._getPoolKey()
      wx.setStorageSync(key, {
        ids: Array.from(this.answeredIds),
        signature: key,
        updatedAt: Date.now()
      })
    } catch (e) {
      // storage 写入失败（空间满等）不影响主流程
    }
  },

  /**
   * 清空当前维度的已答集合（用于"再来一轮"）
   */
  _clearAnsweredPool() {
    this.answeredIds = new Set()
    try {
      wx.removeStorageSync(this._getPoolKey())
    } catch (e) {}
    this.setData({ answeredCount: 0, poolFinished: false })
  },

  /**
   * BGM 开关 — 点击切换背景音乐
   */
  onToggleBgm() {
    const bgm = getApp().globalData.bgm
    const enabled = bgm.toggle()
    this.setData({ bgmEnabled: enabled })
    wx.showToast({
      title: enabled ? '背景音乐已开启' : '背景音乐已关闭',
      icon: 'none'
    })
  },

  /**
   * 切换深色模式 — 从触摸点圆形扩散
   *
   * 性能优化：
   * 1. 原生导航栏/背景色由 syncThemeToAllPages 延迟到动画结束后统一处理，
   *    避免与 clip-path 过渡竞争主线程
   * 2. 动画结束后用 inset(0) 矩形替代超大 circle，避免 WebView 裁剪导致长内容露底
   * 3. 精简 setData 字段，仅更新动画必需的状态
   */
  onToggleTheme(e) {
    if (this.data.themeAnimating) return

    const touch = (e && e.changedTouches && e.changedTouches[0]) ||
                  (e && e.touches && e.touches[0])
    const x = touch ? touch.clientX : 340
    const y = touch ? touch.clientY : 24

    const sys = wx.getWindowInfo()
    const dx = Math.max(x, sys.windowWidth - x)
    const dy = Math.max(y, sys.windowHeight - y)
    const maxRadius = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 80

    const goingDark = !this.data.darkMode
    this.setData({ themeAnimating: true })

    // 立即同步所有其他页面的主题（避免切换后返回时闪屏）
    // 原生 API 由 syncThemeToAllPages 延迟到 580ms 后统一调用
    getApp().syncThemeToAllPages(goingDark, this.route)

    if (goingDark) {
      // 浅 → 深：深色层从触摸点扩散
      // 关键：dark-layer 常驻 DOM 但 visibility:hidden 时浏览器无"已渲染前一帧"，
      // 若直接 setData clip-path 到触摸点，浏览器会从初始值 circle(0 at 50% 50%)
      // （屏幕中心）合并计算，导致动画原点错误。
      // 修复：先用 clipNoTransition 无过渡把起点钉在触摸点，再启用 transition 做扩散。
      this.setData({
        clipNoTransition: true,
        darkLayerVisible: true,
        darkMode: true,
        darkClipPath: `circle(0px at ${x}px ${y}px)`
      })
      setTimeout(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(${maxRadius}px at ${x}px ${y}px)`
        })
      }, 30)
      setTimeout(() => {
        // 动画结束后无过渡切回 inset(0) 矩形全覆盖：
        // circle 与 inset 形状不同，浏览器无法良好插值，必须禁用过渡瞬间切换；
        // inset(0) 不受圆心和半径限制，长题干/长解析滚动到底部也不会露出浅色层
        this.setData({
          clipNoTransition: true,
          themeAnimating: false,
          darkClipPath: 'inset(0)'
        })
        wx.nextTick(() => this.setData({ clipNoTransition: false }))
        wx.setStorageSync('darkMode', true)
      }, 580)
    } else {
      // 深 → 浅：深色层收缩到触摸点
      // 当前稳定态是 inset(0)，必须先无过渡切到 circle(maxRadius)，
      // 否则浏览器会从矩形扭曲过渡到圆形，动画瞬间消失
      this.setData({
        clipNoTransition: true,
        darkMode: false,
        darkClipPath: `circle(${maxRadius}px at ${x}px ${y}px)`
      })
      setTimeout(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(0px at ${x}px ${y}px)`
        })
      }, 30)
      setTimeout(() => {
        this.setData({ darkLayerVisible: false, themeAnimating: false })
        wx.setStorageSync('darkMode', false)
      }, 580)
    }
  },

  /**
   * 展开/收起筛选面板
   */
  onToggleFilter() {
    this.setData({ showFilter: !this.data.showFilter })
  },

  /**
   * 选择科目
   */
  onSelectSubject(e) {
    const id = Number(e.currentTarget.dataset.id)
    const name = e.currentTarget.dataset.name
    this.clearCountdown()
    this.setData({
      selectedSubjectId: id,
      selectedSubjectName: name,
      showFilter: false,
      hasHistory: false
    })
    this.history = []
    this.historyIndex = -1
    // 切换科目 → 切到另一个筛选维度的已答集合
    this._loadAnsweredPool()
    this.loadQuestion()
  },

  /**
   * 选择难度
   */
  onSelectDifficulty(e) {
    const value = Number(e.currentTarget.dataset.value)
    const diff = this.data.difficulties.find(d => d.value === value)
    this.clearCountdown()
    this.setData({
      selectedDifficulty: value,
      showFilter: false,
      hasHistory: false
    })
    this.history = []
    this.historyIndex = -1
    // 切换难度 → 切到另一个筛选维度的已答集合
    this._loadAnsweredPool()
    this.loadQuestion()
  },

  /**
   * 加载专项复习题目（错题本/收藏夹）
   * 一次性加载所有题目，打乱顺序后逐题练习
   */
  loadReviewQuestions() {
    this.setData({ loading: true })
    const mode = this.data.quizMode
    const filterId = this.data.reviewFilterId || null
    const quizType = this.data.quizType || ''
    const fetchFn = mode === 'wrong' ? api.getWrongList
      : mode === 'favorite' ? api.getFavoriteList
      : mode === 'customWrong' ? api.getCustomWrongList
      : api.getCustomFavoriteList
    const pageSize = 50

    // 公共题库（wrong/favorite）支持按 quizType 筛选；自主题库不传 quizType
    const isPublic = mode === 'wrong' || mode === 'favorite'
    const fetch = (page, size, fid) => {
      if (isPublic) {
        return fetchFn(page, size, fid, quizType)
      }
      return fetchFn(page, size, fid)
    }

    // 先取第一页，拿到 total 后再决定是否继续加载
    fetch(1, pageSize, filterId).then(data => {
      const allQuestions = (data.list || []).slice()
      const total = data.total || allQuestions.length
      const pages = Math.ceil(total / pageSize)
      // 加载剩余页
      const promises = []
      for (let p = 2; p <= pages; p++) {
        promises.push(fetch(p, pageSize, filterId))
      }
      Promise.all(promises).then(results => {
        results.forEach(res => {
          allQuestions.push(...(res.list || []))
        })
        // 打乱顺序
        for (let i = allQuestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]]
        }
        this.reviewList = allQuestions
        this.reviewIndex = 0
        this.setData({ loading: false, reviewTotalNum: allQuestions.length })
        if (allQuestions.length === 0) {
          this.setData({ reviewFinished: true, question: null })
        } else {
          this.showReviewQuestion()
        }
      }).catch(() => {
        // 只有一页也够用
        this.reviewList = allQuestions
        this.reviewIndex = 0
        this.setData({ loading: false, reviewTotalNum: allQuestions.length })
        if (allQuestions.length === 0) {
          this.setData({ reviewFinished: true, question: null })
        } else {
          this.showReviewQuestion()
        }
      })
    }).catch(() => {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /**
   * 从复习列表中取当前题目
   */
  showReviewQuestion() {
    const item = this.reviewList[this.reviewIndex]
    if (!item) {
      this.setData({ reviewFinished: true, question: null })
      return
    }
    const options = (item.options || []).map((text, index) => ({
      letter: String.fromCharCode(65 + index),
      text: text,
      keyId: item.id + '_' + index
    }))
    const isMultiChoice = this.isCustomMode() && detectMultiChoice(item)
    this.setData({
      question: item,
      options: options,
      isMultiChoice: isMultiChoice,
      selectedOption: item._selectedOption || '',
      selectedOptions: item._selectedOptions || [],
      judged: item._judged || false,
      _judging: false,
      isCorrect: item._isCorrect || false,
      correctAnswer: item._correctAnswer || '',
      explanation: item._explanation || '',
      loading: false,
      hasHistory: this.reviewIndex > 0,
      fromHistory: item._judged === true,
      interviewRevealed: false,
      reviewCurrentNum: this.reviewIndex + 1
    })
  },

  /**
   * ① 取一道随机题（带科目和难度筛选）
   * 调用接口：GET /api/question/random?subjectId=&difficulty=
   *
   * 性能优化：首次加载时会尝试消费上游页面（quiz-setup/code-bank/interview-bank）
   * 预拉取的 Promise，省掉进入页面后再发请求的等待时间，显著减少首题白屏。
   */
  loadQuestion() {
    // 专项复习模式
    if (this.isReviewMode()) {
      this.reviewIndex++
      if (this.reviewIndex >= this.reviewList.length) {
        this.setData({ reviewFinished: true, question: null })
        return
      }
      this.showReviewQuestion()
      return
    }

    this.setData({ loading: true, loadError: false, emptyPool: false, offlineMode: false })
    this._loadQuestionInternal(0)
  },

  /**
   * 实际拉题的内部函数，支持重试计数
   * 拿到题后若命中本轮已答集合，最多重试 _poolMaxRetry() 次；
   * 仍命中即判定本轮刷完，弹出"再来一轮"对话框。
   */
  _loadQuestionInternal(retryCount) {
    // 首题：尝试消费预拉取的 Promise（仅在 retryCount===0 时复用，避免重复消费）
    let promise = null
    if (this._firstLoad && retryCount === 0) {
      this._firstLoad = false
      promise = this._consumePreloadedQuestion()
    }
    if (!promise) {
      promise = api.getRandomQuestion(this.data.selectedSubjectId, this.data.selectedDifficulty, this.data.quizType, this.data.style)
    }

    promise.then(data => {
      // 题库为空（后端返回 null）：提示无题目
      // 必须同时清掉旧题，否则页面仍渲染上一道题，"暂无题目"提示永远不会出现
      if (!data || data.id == null) {
        this.setData({ loading: false, emptyPool: true, question: null })
        return
      }

      // 去重检查：命中本轮已答集合则换一道
      if (this.answeredIds && this.answeredIds.has(data.id)) {
        if (retryCount < this._poolMaxRetry()) {
          // 命中已答：立即重试拉一道（不再走预拉取槽位）
          this._loadQuestionInternal(retryCount + 1)
          return
        }
        // 连续 N 次都命中已答 → 判定本轮刷完
        this.setData({ loading: false, poolFinished: true })
        return
      }

      // 命中网络题：顺手塞进本地缓存池，断网时还能继续刷
      // 仅缓存普通随机题（含 code/interview），专项复习/自主题库不入池
      qcache.push(data, this.data.quizType)

      this._renderQuestion(data, false)
    }).catch(() => {
      // 网络失败兜底：尝试从本地缓存取一道题，避免卡在白屏
      // 排除当前题 id 与本轮已答 id，避免重复
      const excludeId = this.data.question && this.data.question.id
      const cached = qcache.pop(this.data.quizType, excludeId)
      if (cached) {
        // 缓存题也要做本轮去重检查
        if (this.answeredIds && this.answeredIds.has(cached.id)) {
          // 缓存题命中已答：尝试再弹一道，或直接报错
          const cached2 = qcache.pop(this.data.quizType, excludeId)
          if (cached2 && !(this.answeredIds && this.answeredIds.has(cached2.id))) {
            this._renderQuestion(cached2, true)
            return
          }
          this.setData({ loading: false, loadError: true, question: null })
          return
        }
        this._renderQuestion(cached, true)
        return
      }
      this.setData({ loading: false, loadError: true, question: null })
    })
  },

  /**
   * 把一道题渲染到页面（统一处理在线/离线缓存两种来源）
   * @param {object} data     题目对象
   * @param {boolean} offline 是否来自本地缓存（断网兜底）
   */
  _renderQuestion(data, offline) {
    const options = (data.options || []).map((text, index) => ({
      letter: String.fromCharCode(65 + index),
      text: text,
      keyId: data.id + '_' + index
    }))

    // 截断前进历史（从中间位置加载新题时，丢弃之后的记录）
    this.history = this.history.slice(0, this.historyIndex + 1)
    // 将新题压入历史
    this.history.push({
      question: data,
      options: options,
      selectedOption: '',
      judged: false,
      isCorrect: false,
      correctAnswer: '',
      explanation: ''
    })
    this.historyIndex = this.history.length - 1
    // 限制最多 50 条
    if (this.history.length > 50) {
      this.history.shift()
      this.historyIndex--
    }

    this.setData({
      question: data,
      options: options,
      selectedOption: '',
      judged: false,
      _judging: false,
      isCorrect: false,
      correctAnswer: '',
      explanation: '',
      loading: false,
      hasHistory: this.historyIndex > 0,
      fromHistory: false,
      interviewRevealed: false,
      offlineMode: !!offline
    })
    // 题目就绪后，若新手引导正停留在 quiz 步骤，立即测量高亮位置
    if (this.data.onboardingStep && this.data.onboardingStep.target) {
      setTimeout(() => this._measureOnboardingTarget(this.data.onboardingStep.target), 200)
    }
  },

  /**
   * 消费上游页面预拉取的首题 Promise
   * 校验签名（quizType + subjectId + difficulty + style）一致才会复用；
   * 否则返回 null，调用方走正常请求。
   */
  _consumePreloadedQuestion() {
    const app = getApp()
    const slot = app.globalData.preloadedFirstQuestion
    if (!slot) return null
    // 一次性消费：无论是否命中都立即清空槽位
    app.globalData.preloadedFirstQuestion = null
    // 过期则丢弃（避免拿到陈旧数据）
    if (Date.now() > slot.expire) return null
    const expectedSig = 'quizType=' + (this.data.quizType || '') +
                        '&subjectId=' + this.data.selectedSubjectId +
                        '&difficulty=' + this.data.selectedDifficulty +
                        '&style=' + (this.data.style || '')
    if (slot.signature !== expectedSig) return null
    return slot.promise
  },

  /**
   * 面试题专属：点击"查看解析"，直接展示当前面试题的解析（不经过判题）
   * 面试题改为问答题/OJ题模式，无选项可选，不再调用 /api/question/judge
   */
  onShowInterviewExplanation() {
    if (this.data.interviewRevealed) return
    if (!this.data.question) return
    const explanation = this.data.question.explanation || '暂无解析'
    this.setData({
      interviewRevealed: true,
      explanation: explanation
    })
  },

  /**
   * 面试题专属：收起解析面板，回到"查看解析"按钮状态
   */
  onHideInterviewExplanation() {
    this.setData({
      interviewRevealed: false,
      explanation: ''
    })
  },

  /**
   * ② 用户点击了一个选项
   */
  onOptionTap(e) {
    if (this.data.judged) return
    if (this.data._judging) return
    if (!this.data.question) return

    // 新手引导：用户首次点任一选项即视为完成「quiz-answer」步骤
    // 不等待判题结果，避免气泡浮在答题过程中造成视觉干扰
    if (this.data.onboardingStep && this.data.onboardingStep.id === 'quiz-answer') {
      try { wx.vibrateShort({ type: 'light', fail: () => {} }) } catch (e) {}
      onboarding.completeCurrentStep()
      this._afterOnboardingChange()
    }

    const letter = e.currentTarget.dataset.letter

    // 按压反馈：驱动深色层副本显示「缩小 → 回弹」
    // （深色层 pointer-events:none，hover-class 无法在其上触发）
    // 日间由 hover-class 天然可见，这里只在夜间触发，避免答题时多余的 setData 重绘
    if (this.data.darkMode) {
      this.setData({ pressedOption: letter })
      setTimeout(() => {
        this.setData({ pressedOption: '' })
      }, 200)
    }

    // 多选题：切换勾选状态，不立即判题
    if (this.data.isMultiChoice) {
      let selected = this.data.selectedOptions.slice()
      const idx = selected.indexOf(letter)
      if (idx > -1) {
        selected.splice(idx, 1)
      } else {
        selected.push(letter)
      }
      this.setData({ selectedOptions: selected })
      return
    }

    // 单选题：保持点击即判
    this.data._judging = true
    this.setData({ selectedOption: letter })
    this.judge(letter)
  },

  /**
   * 多选题：确认提交答案
   */
  onSubmitMulti() {
    if (this.data.judged) return
    if (this.data._judging) return
    if (!this.data.question) return
    const selected = this.data.selectedOptions
    if (!selected || selected.length === 0) {
      wx.showToast({ title: '请至少选择一项', icon: 'none' })
      return
    }
    const answer = selected.slice().sort().join('')
    this.data._judging = true
    this.judge(answer)
  },

  /**
   * ③ 提交答案给后端判题
   * 调用接口：POST /api/question/judge
   */
  judge(userAnswer) {
    const judgeFn = this.isCustomMode() ? api.judgeCustomQuestion : api.judgeQuestion
    judgeFn({
      questionId: this.data.question.id,
      userAnswer: userAnswer
    }).then(res => {
      this.setData({
        judged: true,
        isCorrect: res.isCorrect,
        correctAnswer: res.correctAnswer,
        explanation: res.explanation || '暂无解析'
      })

      // 游客答题计数：未登录时累计到本地，用于首页「登录可永久保留」引导
      if (!wx.getStorageSync('token')) {
        try {
          const next = (wx.getStorageSync('guestAnswerCount') || 0) + 1
          wx.setStorageSync('guestAnswerCount', next)
        } catch (e) {}
      }

      // 播放音效反馈
      this.playSound(res.isCorrect)

      // 答对触发绿色粒子爆开（独立于音效，无音效时也有动画）
      if (res.isCorrect) {
        this.triggerParticleBurst()
      }

      // 学习报告埋点：科目 + 时段（失败不影响主流程）
      const subjectName = (this.data.question && (this.data.question.subjectName || this.data.question.subject))
                          || this.data.selectedSubjectName
                          || '未分类'
      trackAnswer(subjectName, res.isCorrect)

      // 答题日历埋点：实时写入当日计数，确保历史日期不被漏录
      recordDailyAnswer()

      // 更新当前快照的答题状态（普通模式）
      if (this.history[this.historyIndex]) {
        this.history[this.historyIndex].selectedOption = userAnswer
        this.history[this.historyIndex].judged = true
        this.history[this.historyIndex].isCorrect = res.isCorrect
        this.history[this.historyIndex].correctAnswer = res.correctAnswer
        this.history[this.historyIndex].explanation = res.explanation || '暂无解析'
      }

      // 更新复习列表中当前题目的答题状态（专项复习模式）
      if (this.isReviewMode() && this.reviewList[this.reviewIndex]) {
        this.reviewList[this.reviewIndex]._selectedOption = userAnswer
        this.reviewList[this.reviewIndex]._selectedOptions = this.data.selectedOptions
        this.reviewList[this.reviewIndex]._judged = true
        this.reviewList[this.reviewIndex]._isCorrect = res.isCorrect
        this.reviewList[this.reviewIndex]._correctAnswer = res.correctAnswer
        this.reviewList[this.reviewIndex]._explanation = res.explanation || '暂无解析'
      }

      // 普通随机刷题：把当前题加入本轮已答集合，用于下次拉题去重
      if (!this.isReviewMode() && this.data.question && this.data.question.id != null) {
        if (this.answeredIds && !this.answeredIds.has(this.data.question.id)) {
          this.answeredIds.add(this.data.question.id)
          this._saveAnsweredPool()
          this.setData({ answeredCount: this.answeredIds.size })
        }
      }

      if (res.isCorrect && this.data.autoNext) {
        this.startCountdown()
      }
    }).catch(() => {
      this.data._judging = false
      this.setData({ selectedOption: '', selectedOptions: [] })
    })
  },

  /**
   * ⑤ 手动点「下一题」
   */
  onNextTap() {
    this.clearCountdown()

    // 面试题无判题环节：点"下一题"即视为已刷，把当前题纳入本轮去重集合，
    // 否则面试题永远不进 answeredIds，会"取出放回"重复抽到
    if (this.data.quizType === 'interview' && !this.isReviewMode() &&
        this.data.question && this.data.question.id != null &&
        this.answeredIds && !this.answeredIds.has(this.data.question.id)) {
      this.answeredIds.add(this.data.question.id)
      this._saveAnsweredPool()
      this.setData({ answeredCount: this.answeredIds.size })
    }

    // 专项复习模式：始终加载下一道
    if (this.isReviewMode()) {
      this.setData({ fromHistory: false })
      this.loadQuestion()
      return
    }

    // 有前进历史 → 恢复下一题（不重新随机）
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      const snapshot = this.history[this.historyIndex]
      this.setData({
        question: snapshot.question,
        options: snapshot.options,
        selectedOption: snapshot.selectedOption,
        judged: snapshot.judged,
        isCorrect: snapshot.isCorrect,
        correctAnswer: snapshot.correctAnswer,
        explanation: snapshot.explanation,
        hasHistory: true,
        fromHistory: true,
        interviewRevealed: false
      })
    } else {
      // 没有前进历史 → 加载新随机题
      this.setData({ fromHistory: false })
      this.loadQuestion()
    }
  },

  /**
   * 播放音效（答对/答错）
   */
  playSound(isCorrect) {
    if (!this.data.soundEnabled) return
    // 读取刷题音效音量（默认 1）
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
  },

  /**
   * 答对粒子爆开：从屏幕中心向四周扩散绿色粒子 + 双层光环
   * 14 个粒子均匀环形分布，加入轻微随机抖动让爆发更自然
   */
  triggerParticleBurst() {
    const colors = ['#5EEAD4', '#34D399', '#10B981', '#6EE7B7', '#A7F3D0']
    const N = 14
    const particles = []
    for (let i = 0; i < N; i++) {
      // 基础角度均分 360°，叠加 ±5° 随机抖动
      const angle = i * (360 / N) + (Math.random() * 10 - 5)
      // 飞行距离 200~280rpx，制造层次
      const distance = 200 + Math.floor(Math.random() * 80)
      // 微小延迟错开 0~0.08s，让爆发有节奏感
      const delay = (i % 3) * 0.025
      // 粒子直径 12~20rpx
      const size = 12 + Math.floor(Math.random() * 8)
      particles.push({
        id: i,
        angle: angle,
        distance: distance,
        delay: delay,
        size: size,
        color: colors[i % colors.length]
      })
    }
    this.setData({ showParticles: true, particles: particles })
    // 1.1s 后清理（粒子动画 0.9s + ring-2 延迟 0.15s + 缓冲）
    if (this._particleTimer) clearTimeout(this._particleTimer)
    this._particleTimer = setTimeout(() => {
      this.setData({ showParticles: false })
    }, 1100)
  },

  /**
   * 返回上一题（从历史恢复）
   */
  onPrevTap() {
    this.clearCountdown()

    // 专项复习模式：回退到上一道复习题
    if (this.isReviewMode()) {
      if (this.reviewIndex <= 0) return
      this.reviewIndex--
      this.showReviewQuestion()
      return
    }

    if (this.historyIndex <= 0) return

    this.historyIndex--
    const snapshot = this.history[this.historyIndex]
    this.setData({
      question: snapshot.question,
      options: snapshot.options,
      selectedOption: snapshot.selectedOption,
      judged: snapshot.judged,
      _judging: false,
      isCorrect: snapshot.isCorrect,
      correctAnswer: snapshot.correctAnswer,
      explanation: snapshot.explanation,
      hasHistory: this.historyIndex > 0,
      fromHistory: true,
      interviewRevealed: false
    })
  },

  /**
   * 启动倒计时跳转下一题
   */
  startCountdown() {
    this.clearCountdown()
    const delay = this.data.autoNextDelay

    // 不停留 → 立即跳转
    if (delay === 0) {
      this.loadQuestion()
      return
    }

    // 有停留时间 → 倒计时
    this.setData({ countdown: delay })
    this.countdownTimer = setInterval(() => {
      const remain = this.data.countdown - 1
      if (remain <= 0) {
        this.clearCountdown()
        this.loadQuestion()
      } else {
        this.setData({ countdown: remain })
      }
    }, 1000)
  },

  /**
   * 清除倒计时
   */
  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    this.setData({ countdown: 0 })
  },

  /**
   * 页面卸载时清除定时器
   */
  onUnload() {
    this.clearCountdown()
    if (this._particleTimer) {
      clearTimeout(this._particleTimer)
      this._particleTimer = null
    }
  },

  /**
   * 页面隐藏时清除定时器（切 tab 时）
   */
  onHide() {
    this.clearCountdown()
  },

  /**
   * 专项复习：重新开始
   */
  onRestartReview() {
    this.history = []
    this.historyIndex = -1
    this.reviewIndex = 0
    this.setData({ reviewFinished: false, question: null })
    this.loadReviewQuestions()
  },

  /**
   * 专项复习：返回
   */
  onBackHome() {
    wx.navigateBack()
  },

  /**
   * 普通随机刷题：本轮已刷完，再来一轮
   * 清空当前筛选维度下的已答集合，重新开始刷
   */
  onRestartPool() {
    this._clearAnsweredPool()
    this.history = []
    this.historyIndex = -1
    this.setData({ poolFinished: false, question: null })
    this.loadQuestion()
  },

  /**
   * 普通随机刷题：本轮已刷完，返回上一页
   */
  onPoolBackHome() {
    wx.navigateBack()
  },

  /**
   * 收藏 / 取消收藏
   */
  onFavoriteTap() {
    if (!this.data.question) return

    const token = wx.getStorageSync('token')
    if (!token) {
      wx.showModal({
        title: '需要登录',
        content: '收藏功能需要登录后使用，是否现在登录？',
        confirmText: '去登录',
        success(res) {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/mine/mine' })
          }
        }
      })
      return
    }

    const toggleFn = this.isCustomMode() ? api.toggleCustomFavorite : api.toggleFavorite
    const questionId = this.data.question.id
    toggleFn(questionId).then(res => {
      this.setData({ 'question.isFavorited': res.isFavorited })
      // 同步历史快照：否则前后翻题后再回来，收藏状态会回退
      if (this.history[this.historyIndex] &&
          this.history[this.historyIndex].question.id === questionId) {
        this.history[this.historyIndex].question.isFavorited = res.isFavorited
      }
      wx.showToast({
        title: res.isFavorited ? '已收藏' : '已取消',
        icon: 'none'
      })
    })
  },

  /**
   * 错题复习模式：从错题本移除当前题目
   */
  onRemoveWrongTap() {
    if (!this.data.question) return

    const deleteFn = this.data.quizMode === 'customWrong' ? api.deleteCustomWrongQuestion : api.deleteWrongQuestion
    deleteFn(this.data.question.id).then(() => {
      wx.showToast({ title: '已从错题本移除', icon: 'none' })
      // 从复习列表中也移除，避免本轮再次出现
      if (this.reviewList[this.reviewIndex]) {
        this.reviewList.splice(this.reviewIndex, 1)
        // 索引回退一位，因为 loadQuestion 中会先 reviewIndex++，
        // 这样移除后下一题正好指向被移除位置的新题目
        this.reviewIndex--
      }
      // 移除后立即加载下一题（隐藏当前题目和移除按钮）
      this.setData({ 
        judged: false, 
        isCorrect: false, 
        selectedOption: '', 
        selectedOptions: [],
        reviewTotalNum: this.reviewList.length
      })
      this.loadQuestion()
    }).catch(() => {
      wx.showToast({ title: '移除失败', icon: 'none' })
    })
  },

  /**
   * 网络失败后重试加载
   */
  onRetryLoad() {
    this.loadQuestion()
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '我正在用一句刷，快来一起挑战吧！',
      path: '/pages/home/home',    }
  }
})
