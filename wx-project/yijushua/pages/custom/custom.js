/**
 * 自主题库刷题页
 * --------------------------------------------------
 * 与公共刷题页逻辑类似，但调用 /custom/question/* 接口
 * 刷题计数独立，不计入排行榜和错题本
 * 支持分类筛选和自主题目收藏
 */

const api = require('../../utils/api.js')

const _darkMode = wx.getStorageSync('darkMode') === true

/**
 * 检测题目是否为多选题
 * 利用自定义题库返回的 answer 字段长度判断（官方题库不返回 answer，天然不会误判）
 * 同时兼容后端将来可能新增的显式字段（type/isMultiple/questionType）
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

Page({
  data: {
    question: null,
    options: [],
    selectedOption: '',
    selectedOptions: [],     // 多选题已选字母数组
    isMultiChoice: false,    // 当前题是否多选题
    judged: false,
    isCorrect: false,
    correctAnswer: '',
    explanation: '',
    isFavorited: false,
    loading: false,
    totalCount: 0,
    todayCount: 0,
    autoNext: true,
    autoNextDelay: 0,
    countdown: 0,
    darkMode: _darkMode,
    darkLayerVisible: _darkMode,
    darkClipPath: 'circle(0px at 50% 50%)',
    themeAnimating: false,
    clipNoTransition: false,  // 短暂禁用过渡：circle ↔ inset(0) 形状切换瞬间用（避免扭曲插值）
    bgmEnabled: false,    // 背景音乐开关
    hasHistory: false,
    fromHistory: false,
    soundEnabled: false,
    loadError: false,
    // 分类筛选
    categories: [],
    selectedCategoryId: 0,
    selectedCategoryName: '全部',
    showCategoryPanel: false,
    // ---- 进度条 ----
    customCurrentNum: 0,  // 当前第几题（1-based，基于 historyIndex）
    customTotalNum: 0,    // 当前模式下共多少题（基于分类 questionCount 累加）
    // ---- 答对粒子爆开 ----
    showParticles: false,    // 是否显示粒子 overlay
    particles: [],            // 粒子数组（动态生成角度/距离/颜色）
    // ---- 本轮去重 ----
    poolFinished: false,     // 本轮已刷完所有不重复的题（控制"再来一轮"弹窗）
    answeredCount: 0          // 本轮已答题目数（用于展示进度）
  },

  onLoad(options) {
    applyNavBar(_darkMode)
    this.history = []
    this.historyIndex = -1
    this.answeredIds = null  // 本轮已答题目 ID 集合（Set，延迟初始化）
    this.readSettings()
    // 从列表页跳转时携带分类参数
    if (options && options.categoryId && Number(options.categoryId) > 0) {
      this.setData({
        selectedCategoryId: Number(options.categoryId),
        selectedCategoryName: decodeURIComponent(options.categoryName || '所选分类')
      })
    }
    this.loadCategories()
    this._loadAnsweredPool()
    this.loadQuestion()
    this.loadInitialStats()
  },

  /**
   * 加载初始统计数据（累计刷题/今日刷题）
   */
  loadInitialStats() {
    if (!wx.getStorageSync('token')) return
    api.getUserInfo().then(data => {
      if (!this._unloaded && data) {
        this.setData({
          totalCount: data.totalCount || 0,
          todayCount: data.todayCount || 0
        })
      }
    }).catch(() => {})
  },

  /**
   * 网络失败后重试加载
   */
  onRetryLoad() {
    this.loadQuestion()
  },

  onShow() {
    this.readSettings()
    const darkMode = wx.getStorageSync('darkMode') === true
    applyNavBar(darkMode)
    this.setData({
      darkMode,
      darkLayerVisible: darkMode,
      // 深色稳定态用 inset(0) 矩形全覆盖（不用超大半径 circle，
      // 否则长题干/长解析滚动到下方时会露出浅色层，与随机刷题页保持一致）
      darkClipPath: darkMode ? 'inset(0)' : 'circle(0px at 50% 50%)',
      // 入场直接跳到稳定态（无过渡）：circle↔inset 形状不同无法插值，
      // 启用过渡会让浏览器尝试插值并闪烁。扩散动画在 onToggleTheme 里实现。
      clipNoTransition: true,
      bgmEnabled: getApp().globalData.bgm.isEnabled()
    })
    wx.nextTick(() => this.setData({ clipNoTransition: false }))
  },

  onUnload() {
    this._unloaded = true
    this.clearCountdown()
    if (this._particleTimer) {
      clearTimeout(this._particleTimer)
      this._particleTimer = null
    }
  },

  onHide() {
    this.clearCountdown()
  },

  readSettings() {
    const autoNext = wx.getStorageSync('autoNext')
    if (autoNext !== '' && autoNext !== undefined) {
      this.setData({ autoNext })
    }
    const delay = wx.getStorageSync('autoNextDelay')
    if (delay !== '' && delay !== undefined) {
      this.setData({ autoNextDelay: delay })
    }
    const soundEnabled = wx.getStorageSync('soundEnabled') === true
    this.setData({ soundEnabled })
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
   * 记录页面滚动位置
   * 主题按钮是 fixed 常驻右上角，触点坐标是「视口坐标」，而深色层的坐标
   * 原点是「页面顶部」（它高度随内容撑开、随页面一起滚动）。滚动后再切主题
   * 若不换算，圆心会落在视口之外，550ms 扩散动画看上去就像没反应。
   */
  onPageScroll(e) {
    this._scrollTop = (e && e.scrollTop) || 0
  },

  /**
   * 切换深色模式 — 从触摸点圆形扩散（与随机刷题页一致）
   */
  onToggleTheme(e) {
    if (this.data.themeAnimating) return

    const touch = (e && e.changedTouches && e.changedTouches[0]) ||
                  (e && e.touches && e.touches[0])
    const x = touch ? touch.clientX : 340
    const y = (touch ? touch.clientY : 24) + (this._scrollTop || 0)

    const sys = wx.getWindowInfo()
    const dx = Math.max(x, sys.windowWidth - x)
    const dy = Math.max(y, sys.windowHeight - y)
    const maxRadius = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 80

    const goingDark = !this.data.darkMode
    this.setData({ themeAnimating: true })

    // 立即同步页面栈中其他页面的主题（切页返回时不闪屏）
    getApp().syncThemeToAllPages && getApp().syncThemeToAllPages(goingDark, this.route)

    if (goingDark) {
      // 浅 → 深：wx:if 创建深色层，首帧绘制 circle(0 at touch)。
      // 节点必须真正被绘制（哪怕被 circle(0) 裁空）才能作为过渡的插值起点；
      // 不能用 visibility:hidden，否则浏览器无"已渲染上一帧"，扩散动画播不出来。
      // 此处不带 clipNoTransition：让首帧就处于"过渡已启用"状态，30ms 后改
      // 半径即可平滑插值。
      applyNavBar(true)
      this.setData({
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
        // 动画结束切回 inset(0) 矩形全覆盖：circle 与 inset 形状不同无法插值，
        // 必须无过渡瞬间切换；inset(0) 不受圆心/半径限制，长题干滚动不露浅色层
        this.setData({
          clipNoTransition: true,
          themeAnimating: false,
          darkClipPath: 'inset(0)'
        })
        wx.nextTick(() => this.setData({ clipNoTransition: false }))
        wx.setStorageSync('darkMode', true)
      }, 580)
    } else {
      // 深 → 浅：稳定态是 inset(0)，先无过渡切到 circle(maxRadius) 再收缩。
      // 浅色层永远恒浅（不挂 dark 类），深色圆收缩露出的天然是浅色层，视觉无缝。
      applyNavBar(false)
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
   * 加载分类列表
   */
  loadCategories() {
    api.getCustomCategoryList().then(data => {
      const categories = data.list || []
      this.setData({ categories })
      this.refreshTotalNum()
    }).catch(() => {})
  },

  /* ============================================================
   * 本轮去重：按当前分类（categoryId）维度在本地 storage 维护
   * 已答题目 ID 集合。每次拉到新题先查集合，命中则换一道；
   * 连续多次（_poolMaxRetry）都命中已答即判定本轮刷完 → 弹"再来一轮"。
   * ============================================================ */

  _poolMaxRetry() {
    return 8
  },

  _getPoolKey() {
    const cat = this.data.selectedCategoryId || 0
    return 'customAnsweredPool_' + cat
  },

  _loadAnsweredPool() {
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

  _saveAnsweredPool() {
    if (!this.answeredIds) return
    try {
      const key = this._getPoolKey()
      wx.setStorageSync(key, {
        ids: Array.from(this.answeredIds),
        signature: key,
        updatedAt: Date.now()
      })
    } catch (e) {}
  },

  _clearAnsweredPool() {
    this.answeredIds = new Set()
    try {
      wx.removeStorageSync(this._getPoolKey())
    } catch (e) {}
    this.setData({ answeredCount: 0, poolFinished: false })
  },

  /**
   * 根据当前选中的分类计算总题数
   * 全部分类时累加所有分类的 questionCount
   */
  refreshTotalNum() {
    const cats = this.data.categories || []
    const selectedId = this.data.selectedCategoryId
    let total = 0
    if (selectedId > 0) {
      const hit = cats.find(c => c.id === selectedId)
      total = hit ? (hit.questionCount || 0) : 0
    } else {
      total = cats.reduce((sum, c) => sum + (c.questionCount || 0), 0)
    }
    this.setData({ customTotalNum: total })
  },

  /**
   * 展开/收起分类筛选面板
   */
  onToggleCategoryPanel() {
    this.setData({ showCategoryPanel: !this.data.showCategoryPanel })
  },

  /**
   * 选择分类
   */
  onSelectCategory(e) {
    const id = Number(e.currentTarget.dataset.id) || 0
    const name = e.currentTarget.dataset.name

    this.setData({
      selectedCategoryId: id || 0,
      selectedCategoryName: name || '全部',
      showCategoryPanel: false
    })
    // 切换分类后清空历史
    this.history = []
    this.historyIndex = -1
    this.refreshTotalNum()
    // 切换分类 → 切到另一个分类维度的已答集合
    this._loadAnsweredPool()
    this.loadQuestion()
  },

  /**
   * 取一道自主题库随机题
   */
  loadQuestion() {
    this.setData({ loading: true, loadError: false })
    this.clearCountdown()
    this._loadQuestionInternal(0)
  },

  /**
   * 实际拉题的内部函数，支持重试计数
   * 拿到题后若命中本轮已答集合，最多重试 _poolMaxRetry 次；
   * 仍命中即判定本轮刷完，弹出"再来一轮"对话框。
   */
  _loadQuestionInternal(retryCount) {
    const categoryId = this.data.selectedCategoryId || undefined
    const excludeId = this.data.question ? this.data.question.id : undefined

    api.getCustomRandomQuestion(undefined, categoryId, excludeId).then(data => {
      if (!data) {
        // 后端返回空 = 自主题库确实没有题目（真空状态）
        this.setData({ question: null, loading: false, loadError: false })
        return
      }

      // 去重检查：命中本轮已答集合则换一道
      if (this.answeredIds && this.answeredIds.has(data.id)) {
        if (retryCount < this._poolMaxRetry()) {
          this._loadQuestionInternal(retryCount + 1)
          return
        }
        // 连续 N 次都命中已答 → 判定本轮刷完
        this.setData({ loading: false, poolFinished: true })
        return
      }

      const options = (data.options || []).map((text, index) => ({
        letter: String.fromCharCode(65 + index),
        text: text
      }))
      const isMultiChoice = detectMultiChoice(data)

      // 截断前进历史（从中间位置加载新题时，丢弃之后的记录）
      this.history = this.history.slice(0, this.historyIndex + 1)
      // 将新题压入历史
      this.history.push({
        question: data,
        options: options,
        isMultiChoice: isMultiChoice,
        selectedOption: '',
        selectedOptions: [],
        judged: false,
        isCorrect: false,
        correctAnswer: '',
        explanation: '',
        isFavorited: data.isFavorited || false
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
        isMultiChoice: isMultiChoice,
        selectedOption: '',
        selectedOptions: [],
        judged: false,
        isCorrect: false,
        correctAnswer: '',
        explanation: '',
        isFavorited: data.isFavorited || false,
        loading: false,
        hasHistory: this.historyIndex > 0,
        fromHistory: false,
        customCurrentNum: this.historyIndex + 1
      })
    }).catch(() => {
      // 网络请求失败 ≠ 题库为空，标记为加载错误，显示重试而非误导性的"去上传"
      this.setData({ question: null, loading: false, loadError: true })
    })
  },

  /**
   * 点击选项
   * 单选：点击即判题
   * 多选：勾选/取消，需点"确认提交"才判题
   */
  onOptionTap(e) {
    if (this.data.judged) return
    if (!this.data.question) return

    const letter = e.currentTarget.dataset.letter

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
    this.setData({ selectedOption: letter })
    this.judge(letter)
  },

  /**
   * 多选题：确认提交答案
   */
  onSubmitMulti() {
    if (this.data.judged) return
    if (!this.data.question) return
    const selected = this.data.selectedOptions
    if (!selected || selected.length === 0) {
      wx.showToast({ title: '请至少选择一项', icon: 'none' })
      return
    }
    // 按字母顺序排序后拼接（与后端答案比较一致）
    const answer = selected.slice().sort().join('')
    this.judge(answer)
  },

  /**
   * 判题
   */
  judge(userAnswer) {
    api.judgeCustomQuestion({
      questionId: this.data.question.id,
      userAnswer: userAnswer
    }).then(res => {
      this.setData({
        judged: true,
        isCorrect: res.isCorrect,
        correctAnswer: res.correctAnswer,
        explanation: res.explanation || '暂无解析',
        totalCount: res.totalCount || this.data.totalCount,
        todayCount: res.todayCount || this.data.todayCount
      })

      // 播放音效反馈
      this.playSound(res.isCorrect)

      // 答对触发绿色粒子爆开
      if (res.isCorrect) {
        this.triggerParticleBurst()
      }

      // 更新当前快照的答题状态
      if (this.history[this.historyIndex]) {
        this.history[this.historyIndex].selectedOption = this.data.selectedOption
        this.history[this.historyIndex].selectedOptions = this.data.selectedOptions
        this.history[this.historyIndex].judged = true
        this.history[this.historyIndex].isCorrect = res.isCorrect
        this.history[this.historyIndex].correctAnswer = res.correctAnswer
        this.history[this.historyIndex].explanation = res.explanation || '暂无解析'
      }

      // 把当前题加入本轮已答集合，用于下次拉题去重
      if (this.data.question && this.data.question.id != null) {
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
      this.setData({ selectedOption: '', selectedOptions: [] })
    })
  },

  /**
   * 收藏/取消收藏自主题目
   */
  onToggleFavorite() {
    if (!this.data.question) return
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    const questionId = this.data.question.id
    api.toggleCustomFavorite(questionId).then(res => {
      this.setData({ isFavorited: res.isFavorited })
      // 同步更新历史快照，确保前后翻页时收藏状态不丢失
      if (this.history[this.historyIndex]) {
        this.history[this.historyIndex].isFavorited = res.isFavorited
      }
      wx.showToast({
        title: res.isFavorited ? '已收藏' : '已取消',
        icon: 'none'
      })
    })
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
   * 下一题
   */
  onNextTap() {
    this.clearCountdown()

    // 有前进历史 → 恢复下一题（不重新随机）
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      const s = this.history[this.historyIndex]
      this.setData({
        question: s.question,
        options: s.options,
        isMultiChoice: s.isMultiChoice || false,
        selectedOption: s.selectedOption,
        selectedOptions: s.selectedOptions || [],
        judged: s.judged || false,
        isCorrect: s.isCorrect || false,
        correctAnswer: s.correctAnswer || '',
        explanation: s.explanation || '',
        isFavorited: s.isFavorited || false,
        hasHistory: true,
        fromHistory: true,
        customCurrentNum: this.historyIndex + 1
      })
    } else {
      // 没有前进历史 → 加载新随机题
      this.setData({ fromHistory: false })
      this.loadQuestion()
    }
  },

  /**
   * 倒计时
   */
  startCountdown() {
    this.clearCountdown()
    const delay = this.data.autoNextDelay
    if (delay === 0) {
      this.loadQuestion()
      return
    }
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

  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    if (!this._unloaded) {
      this.setData({ countdown: 0 })
    }
  },

  /**
   * 返回上一题（从历史恢复）
   */
  onPrevTap() {
    this.clearCountdown()
    if (this.historyIndex <= 0) return

    this.historyIndex--
    const s = this.history[this.historyIndex]
    this.setData({
      question: s.question,
      options: s.options,
      isMultiChoice: s.isMultiChoice || false,
      selectedOption: s.selectedOption,
      selectedOptions: s.selectedOptions || [],
      judged: s.judged || false,
      isCorrect: s.isCorrect || false,
      correctAnswer: s.correctAnswer || '',
      explanation: s.explanation || '',
      isFavorited: s.isFavorited || false,
      hasHistory: this.historyIndex > 0,
      fromHistory: true,
      customCurrentNum: this.historyIndex + 1
    })
  },

  /**
   * 跳转上传页
   */
  onGoUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  /**
   * 本轮已刷完，再来一轮
   * 清空当前分类维度下的已答集合，重新开始刷
   */
  onRestartPool() {
    this._clearAnsweredPool()
    this.history = []
    this.historyIndex = -1
    this.setData({ poolFinished: false, question: null })
    this.loadQuestion()
  },

  /**
   * 本轮已刷完，返回上一页
   */
  onPoolBackHome() {
    wx.navigateBack()
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
