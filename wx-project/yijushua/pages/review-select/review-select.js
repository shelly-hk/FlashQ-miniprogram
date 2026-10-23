/**
 * 专项复习选择页
 * --------------------------------------------------
 * 选择刷错题本或收藏夹的题目（公共题库 / 自主题库）
 * 点击后需先选择科目/分类，再开始刷题
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
    // 弹窗状态
    showFilter: false,
    pendingMode: '',         // 当前选择的模式（wrong/favorite/customWrong/customFavorite）
    pendingIsCustom: false,  // 是否自主题库
    pendingQuizType: '',     // 当前选择的题目类型：''=公共随机题库 / 'code' / 'interview'
    filterLabel: '科目',     // 弹窗标题里的筛选维度名：科目 / 编程语言 / 岗位 / 分类
    filterTabs: [],          // [{id:0, name:'全部'}, ...]
    activeFilterId: 0        // 当前选中的筛选ID
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.subjects = []
    this.categories = []
    this._subjectCache = {}  // 按题目类型缓存科目列表：code/interview/公共 各有独立科目体系
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({ darkMode, fontScale })
  },

  /**
   * 点击复习卡片 → 弹出筛选弹窗
   */
  onGoWrong() {
    this.openFilter('wrong', false, '')
  },

  onGoCustomWrong() {
    this.openFilter('customWrong', true, '')
  },

  onGoFavorite() {
    this.openFilter('favorite', false, '')
  },

  onGoCustomFavorite() {
    this.openFilter('customFavorite', true, '')
  },

  /**
   * 代码题/面试题复习 —— 同样先选科目（各自独立的科目体系），再进刷题
   */
  onGoCodeWrong() {
    this.openFilter('wrong', false, 'code')
  },

  onGoCodeFavorite() {
    this.openFilter('favorite', false, 'code')
  },

  onGoInterviewFavorite() {
    this.openFilter('favorite', false, 'interview')
  },

  /**
   * 打开筛选弹窗
   * @param {string} mode     复习模式（wrong/favorite/customWrong/customFavorite）
   * @param {boolean} isCustom 是否自主题库（按分类筛选）
   * @param {string} quizType  题目类型：''=公共随机题库 / 'code' / 'interview'
   *
   * 优化：只展示「当前用户在该复习模式下实际有题」的分类，没有题的分类（例如从未做错的 Java）不再显示。
   * 做法：拿到全部候选分类后，对每个分类用与实际复习相同的筛选条件并发一次 size=1 的轻量列表请求，
   * 仅取 total，过滤出 total>0 的分类。极端异常时回退到展示全部候选。
   */
  openFilter(mode, isCustom, quizType) {
    const qt = quizType || ''
    const label = isCustom ? '分类' : (qt === 'code' ? '编程语言' : qt === 'interview' ? '岗位' : '科目')
    const allTab = { id: 0, name: '全部' }

    // 先弹窗 + 「全部」兜底展示，避免剪枝期间弹窗空白
    this.setData({
      showFilter: true,
      pendingMode: mode,
      pendingIsCustom: isCustom,
      pendingQuizType: qt,
      filterLabel: label,
      filterTabs: [allTab],
      activeFilterId: 0
    })

    const loadCandidates = isCustom ? this.loadCategories() : this.loadSubjects(qt)

    loadCandidates.then(() => {
      const candidates = isCustom
        ? this.categories.map(c => ({ id: Number(c.id), name: c.name }))
        : this.subjects.map(s => ({ id: Number(s.id), name: s.name }))

      if (!candidates || candidates.length === 0) {
        this.setData({ filterTabs: [allTab] })
        return
      }

      // 探测参数与实际复习口径一致：
      //   公共 it 题（qt=''）→ 不传 quizType（与 onStartReview 不带 quizType 一致）
      //   公共 code/interview → 传对应 quizType
      //   自定义 → 无 quizType
      const probeQuizType = isCustom ? undefined : (qt || undefined)
      const fetchFn = this._getProbeFn(mode, isCustom)

      const probe = (tab) =>
        fetchFn(1, 1, tab.id, probeQuizType)
          .then(res => ({ tab, total: (res && res.total) || 0 }))
          .catch(() => ({ tab, total: 0 }))

      Promise.all(candidates.map(probe)).then(results => {
        const kept = results.filter(r => r.total > 0).map(r => r.tab)
        this.setData({ filterTabs: [allTab].concat(kept) })
      }).catch(() => {
        // 回退：不过滤，全部展示
        this.setData({ filterTabs: [allTab].concat(candidates) })
      })
    }).catch(() => {
      this.setData({ filterTabs: [allTab] })
    })
  },

  /**
   * 根据 复习模式 + 是否自定义 取对应的列表探测接口
   * 公共错题→getWrongList / 公共收藏→getFavoriteList
   * 自定义错题→getCustomWrongList / 自定义收藏→getCustomFavoriteList
   */
  _getProbeFn(mode, isCustom) {
    if (isCustom) {
      return mode === 'customWrong' ? api.getCustomWrongList : api.getCustomFavoriteList
    }
    return mode === 'wrong' ? api.getWrongList : api.getFavoriteList
  },

  /**
   * 加载科目列表（按题目类型取各自独立的科目体系，结果按类型缓存）
   */
  loadSubjects(quizType) {
    const key = quizType || 'it'
    if (this._subjectCache && this._subjectCache[key]) {
      this.subjects = this._subjectCache[key]
      return Promise.resolve()
    }
    return api.getSubjectList(quizType).then(data => {
      this.subjects = data || []
      this._subjectCache = this._subjectCache || {}
      this._subjectCache[key] = this.subjects
    }).catch(() => {
      this.subjects = []
    })
  },

  loadCategories() {
    return api.getCustomCategoryList().then(data => {
      this.categories = (data && data.list) || []
    }).catch(() => {
      this.categories = []
    })
  },

  /**
   * 选择筛选标签
   */
  onSelectFilter(e) {
    const id = Number(e.currentTarget.dataset.id)
    this.setData({ activeFilterId: id })
  },

  /**
   * 开始复习
   */
  onStartReview() {
    const mode = this.data.pendingMode
    const filterId = this.data.activeFilterId || 0
    let url = '/pages/quiz/quiz?mode=' + mode
    // 代码题/面试题复习要带上题目类型，后端按 quiz_type + subject_id 联合筛选
    if (this.data.pendingQuizType) {
      url += '&quizType=' + this.data.pendingQuizType
    }
    if (this.data.pendingIsCustom) {
      url += '&categoryId=' + filterId
    } else {
      url += '&subjectId=' + filterId
    }
    this.setData({ showFilter: false })
    wx.navigateTo({ url: url })
  },

  /**
   * 关闭筛选弹窗
   */
  onCloseFilter() {
    this.setData({ showFilter: false })
  },

  /**
   * 空操作 - 用于 catchtap 阻止冒泡
   */
  noop() {},

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
