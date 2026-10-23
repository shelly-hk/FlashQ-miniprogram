/**
 * 错题本页面
 * --------------------------------------------------
 * 功能：
 *   1. Tab切换：公共题库错题 / 自主题库错题
 *   2. 按科目/分类筛选（顶部标签：全部 + 各科目/分类）
 *   3. 分页展示（每页10条，底部可切换页码）
 *   4. 点击一道错题 → 展开查看题干、选项和正确答案
 *   5. 删除错题 / 收藏错题
 *   6. 批量管理模式（全选、收藏、删除）
 */

const api = require('../../utils/api.js')

// 进页面时就要用上的主题（模块加载时读一次，保证首帧渲染就是当前主题，
// 否则深色模式下切页会先渲染一帧浅色再翻深色 —— 就是那种"闪白一下"）
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

// 公共题库下的二级分类（错题本只暴露随机刷题与代码题库两种细分；面试题不进入错题本流程）
//   it   → 随机刷题科目体系（默认）
//   code → 代码题库
const PUBLIC_SUB_TABS = [
  { id: 'all', name: '全部' },
  { id: 'it', name: '随机刷题' },
  { id: 'code', name: '代码题库' }
]

Page({
  data: {
    activeTab: 'public',  // 'public' = 公共题库错题, 'custom' = 自主题库错题
    publicSubTabs: PUBLIC_SUB_TABS,  // 公共题库二级分类（细分随机/代码）
    activeQuizType: 'all', // 当前选中的二级分类（仅 public tab 生效）：'all'/'it'/'code'
    // 筛选标签
    filterTabs: [],       // [{id:0, name:'全部'}, {id:1, name:'科目1'}, ...]
    activeFilter: 0,      // 当前选中的筛选ID（0=全部）
    activeFilterName: '全部', // 当前筛选名称（展示在收起态筛选条上）
    showFilter: false,    // 筛选面板展开状态
    // 列表数据
    list: [],
    total: 0,
    page: 1,
    size: 10,
    loading: false,
    expandedId: null,
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    totalPages: 0,
    // 管理模式
    manageMode: false,
    selectedIds: {},
    selectedCount: 0,
    allSelected: false,
    // 当选中题目已全部收藏时为 true，批量按钮自动切换为「取消收藏」
    selectedAllFavorited: false
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.initPage()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({ darkMode, fontScale })
    // 首次 onShow 在 onLoad 之后触发，数据已由 initPage 加载，跳过
    if (this._loaded) {
      this.loadWrongList()
    }
    this._loaded = true
  },

  /**
   * 初始化页面：加载筛选标签 + 列表
   */
  initPage() {
    this.loadFilterTabs().then(() => {
      this.loadWrongList()
    })
  },

  /**
   * 加载筛选标签
   * 公共题库下：选了具体二级分类（随机/代码）时才加载对应科目；选「全部」时不展示科目筛选，
   * 因为跨题库汇总视图里科目与题目类型不一一对应，会出现 it 科目筛到 code 题的错位。
   *
   * 优化：只展示「当前用户实际有错题」的分类，没有错题的分类（例如从未做错的 Java）不再显示。
   * 做法：拿到全部候选分类后，对每个分类用与 loadWrongList 相同的筛选条件并发一次 size=1 的轻量列表请求，
   * 仅取 total，过滤出 total>0 的分类。极端异常时回退到展示全部候选。
   */
  loadFilterTabs() {
    const allTab = { id: 0, name: '全部' }
    const isPublic = this.data.activeTab === 'public'

    // 公共题库「全部」汇总：科目筛选意义不大，直接隐藏
    if (isPublic && this.data.activeQuizType === 'all') {
      this.setData({ filterTabs: [], activeFilter: 0, activeFilterName: '全部' })
      return Promise.resolve()
    }

    // 拉全部候选分类（公共按二级分类加载对应科目体系）
    const fetchCandidates = isPublic
      ? api.getSubjectList(this.data.activeQuizType)
          .then(data => (data || []).map(s => ({ id: s.id, name: s.name })))
      : api.getCustomCategoryList()
          .then(data => ((data && data.list) || []).map(c => ({ id: c.id, name: c.name })))

    return fetchCandidates.then(candidates => {
      // 先用「全部」兜底展示，避免剪枝期间筛选条空白
      this.setData({ filterTabs: [allTab], activeFilter: 0, activeFilterName: '全部' })

      if (!candidates || candidates.length === 0) {
        return  // 只有「全部」，无需探测
      }

      // 探测参数与 loadWrongList 保持一致（按当前二级分类筛选），确保 total 口径相同
      const quizType = isPublic ? this.data.activeQuizType : undefined
      const fetchFn = isPublic ? api.getWrongList : api.getCustomWrongList

      const probe = (tab) =>
        fetchFn(1, 1, tab.id, quizType)
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
      this.setData({ filterTabs: [allTab], activeFilter: 0, activeFilterName: '全部' })
    })
  },

  /**
   * 切换 Tab
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({
      activeTab: tab,
      activeQuizType: 'all',  // 切到自定义或回到公共都重置二级分类
      list: [],
      total: 0,
      page: 1,
      totalPages: 0,
      activeFilter: 0,
      activeFilterName: '全部',
      showFilter: false,
      filterTabs: [],
      expandedId: null,
      manageMode: false,
      selectedIds: {},
      selectedCount: 0,
      allSelected: false
    })
    this.initPage()
  },

  /**
   * 切换公共题库下的二级分类（随机刷题 / 代码题库 / 全部）
   */
  onQuizTypeChange(e) {
    const quizType = e.currentTarget.dataset.id
    if (quizType === this.data.activeQuizType) return

    this.setData({
      activeQuizType: quizType,
      list: [],
      total: 0,
      page: 1,
      totalPages: 0,
      activeFilter: 0,
      activeFilterName: '全部',
      showFilter: false,
      filterTabs: [],
      expandedId: null,
      manageMode: false,
      selectedIds: {},
      selectedCount: 0,
      allSelected: false
    })
    this.initPage()
  },

  /**
   * 展开 / 收起筛选面板（参考刷题页交互）
   */
  onToggleFilter() {
    this.setData({ showFilter: !this.data.showFilter })
  },

  /**
   * 切换筛选标签
   */
  onFilterChange(e) {
    const filterId = Number(e.currentTarget.dataset.id)
    const filterName = e.currentTarget.dataset.name
    if (filterId === this.data.activeFilter) return

    this.setData({
      activeFilter: filterId,
      activeFilterName: filterName || '全部',
      showFilter: false,
      list: [],
      total: 0,
      page: 1,
      totalPages: 0,
      expandedId: null,
      manageMode: false,
      selectedIds: {},
      selectedCount: 0,
      allSelected: false
    })
    this.loadWrongList()
  },

  /**
   * 加载错题列表（分页）
   */
  loadWrongList() {
    if (this.data.loading) return

    this.setData({ loading: true })

    const filterId = this.data.activeFilter || null
    const fetchFn = this.data.activeTab === 'public'
      ? api.getWrongList
      : api.getCustomWrongList

    // 公共题库错题本：二级分类为「全部」时跨题库汇总（传 'all' 展示全部，带类型标签）；
    // 选了具体分类（it/code）时按 quizType 精确筛选
    const quizType = this.data.activeTab === 'public' ? this.data.activeQuizType : undefined

    fetchFn(this.data.page, this.data.size, filterId, quizType).then(data => {
      const newList = (data.list || []).map(item => {
        item.optionsParsed = (item.options || []).map((text, index) => ({
          letter: String.fromCharCode(65 + index),
          text: text
        }))
        return item
      })

      const total = data.total || 0
      this.setData({
        list: newList,
        total: total,
        totalPages: Math.ceil(total / this.data.size),
        loading: false
      })
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 点击题目 → 展开/收起详情
   */
  onQuestionTap(e) {
    const id = e.currentTarget.dataset.id
    if (this.data.manageMode) return
    this.setData({
      expandedId: this.data.expandedId === id ? null : id
    })
  },

  /**
   * 收藏/取消收藏单道错题
   */
  onToggleFavorite(e) {
    const id = Number(e.currentTarget.dataset.id)
    const index = Number(e.currentTarget.dataset.index)
    const toggleFn = this.data.activeTab === 'public'
      ? api.toggleFavorite
      : api.toggleCustomFavorite
    toggleFn(id).then(res => {
      const isFavorited = res.isFavorited
      const list = this.data.list.map((item, idx) => {
        if (idx === index) {
          return Object.assign({}, item, { isFavorited: isFavorited })
        }
        return item
      })
      this.setData({ list })
      wx.showToast({ title: isFavorited ? '已收藏' : '已取消', icon: 'none' })
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  /**
   * 删除错题
   */
  onDeleteWrong(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: '提示',
      content: '确定从错题本中移除吗？',
      success: (res) => {
        if (!res.confirm) return

        const deleteFn = this.data.activeTab === 'public'
          ? api.deleteWrongQuestion
          : api.deleteCustomWrongQuestion

        deleteFn(id).then(() => {
          wx.showToast({ title: '已移除', icon: 'none' })
          this.loadWrongList()
        }).catch(() => {
          wx.showToast({ title: '移除失败', icon: 'none' })
        })
      }
    })
  },

  /**
   * 重新做题 → 跳转回刷题页
   */
  onPracticeAgain() {
    wx.switchTab({
      url: '/pages/home/home'
    })
  },

  /* ========== 分页 ========== */

  onPrevPage() {
    if (this.data.page <= 1 || this.data.loading) return
    this.setData({ page: this.data.page - 1, list: [], expandedId: null, manageMode: false, selectedIds: {}, selectedCount: 0, allSelected: false })
    this.loadWrongList()
  },

  onNextPage() {
    if (this.data.page >= this.data.totalPages || this.data.loading) return
    this.setData({ page: this.data.page + 1, list: [], expandedId: null, manageMode: false, selectedIds: {}, selectedCount: 0, allSelected: false })
    this.loadWrongList()
  },

  /* ========== 批量管理模式 ========== */

  /**
   * 进入/退出管理模式（toggle，与收藏页一致）
   */
  onToggleManage() {
    const next = !this.data.manageMode
    this.setData({
      manageMode: next,
      selectedIds: {},
      selectedCount: 0,
      allSelected: false,
      selectedAllFavorited: false,
      expandedId: null
    })
  },

  /**
   * 根据当前已选题目，计算「收藏」按钮应展示收藏还是取消收藏
   * 规则：若所有已选题目都已收藏，则切换为「取消收藏」状态
   */
  _updateBatchFavState() {
    const idStrs = Object.keys(this.data.selectedIds)
    if (idStrs.length === 0) {
      if (this.data.selectedAllFavorited) {
        this.setData({ selectedAllFavorited: false })
      }
      return
    }
    const allFavorited = idStrs.every(idStr => {
      const item = this.data.list.find(q => q.id === Number(idStr))
      return item && item.isFavorited
    })
    if (allFavorited !== this.data.selectedAllFavorited) {
      this.setData({ selectedAllFavorited: allFavorited })
    }
  },

  onToggleSelect(e) {
    const id = Number(e.currentTarget.dataset.id)
    const selectedIds = this.data.selectedIds
    if (selectedIds[id]) {
      delete selectedIds[id]
    } else {
      selectedIds[id] = true
    }
    const selectedCount = Object.keys(selectedIds).length
    const allSelected = selectedCount > 0 && selectedCount === this.data.list.length
    this.setData({ selectedIds, selectedCount, allSelected })
    this._updateBatchFavState()
  },

  onToggleAll() {
    if (this.data.allSelected) {
      this.setData({ selectedIds: {}, selectedCount: 0, allSelected: false, selectedAllFavorited: false })
    } else {
      const selectedIds = {}
      this.data.list.forEach(item => { selectedIds[item.id] = true })
      this.setData({ selectedIds, selectedCount: this.data.list.length, allSelected: true })
      this._updateBatchFavState()
    }
  },

  onBatchFavorite() {
    const selectedIds = Object.keys(this.data.selectedIds).map(id => Number(id))
    if (selectedIds.length === 0) return

    // 取消收藏模式：所有已选均已收藏 → 走取消收藏流程；否则走收藏流程
    const unfavoriteMode = this.data.selectedAllFavorited

    const targets = selectedIds.filter(id => {
      const item = this.data.list.find(q => q.id === id)
      if (!item) return false
      return unfavoriteMode ? item.isFavorited : !item.isFavorited
    })

    if (targets.length === 0) {
      wx.showToast({ title: unfavoriteMode ? '选中的题都未收藏' : '选中的题都已收藏', icon: 'none' })
      return
    }

    const actionLabel = unfavoriteMode ? '取消收藏' : '收藏'
    wx.showLoading({ title: actionLabel + '中...' })

    let successCount = 0
    let failCount = 0

    const toggleFn = this.data.activeTab === 'public'
      ? api.toggleFavorite
      : api.toggleCustomFavorite

    const tasks = targets.map(id =>
      toggleFn(id)
        .then(() => { successCount++ })
        .catch(() => { failCount++ })
    )

    Promise.all(tasks).then(() => {
      wx.hideLoading()

      if (failCount === 0) {
        wx.showToast({ title: '已' + actionLabel + ' ' + successCount + ' 道题', icon: 'none' })
      } else if (successCount === 0) {
        wx.showToast({ title: actionLabel + '失败，请重试', icon: 'none' })
      } else {
        wx.showToast({ title: '成功 ' + successCount + ' 道，失败 ' + failCount + ' 道', icon: 'none' })
      }

      this.setData({ selectedIds: {}, selectedCount: 0, allSelected: false, selectedAllFavorited: false })
      this.loadWrongList()
    })
  },

  onBatchDelete() {
    const ids = Object.keys(this.data.selectedIds)
    if (ids.length === 0) return

    wx.showModal({
      title: '确认移除',
      content: '将移除 ' + ids.length + ' 道错题，确定继续？',
      success: (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '移除中...' })

        const deleteFn = this.data.activeTab === 'public'
          ? api.deleteWrongQuestion
          : api.deleteCustomWrongQuestion

        let okCount = 0
        let failCount = 0
        const tasks = ids.map(id =>
          deleteFn(Number(id))
            .then(() => { okCount++ })
            .catch(() => { failCount++ })
        )
        Promise.all(tasks).then(() => {
          wx.hideLoading()
          if (failCount === 0) {
            wx.showToast({ title: '已移除', icon: 'success' })
          } else {
            wx.showToast({ title: '成功 ' + okCount + ' 道，失败 ' + failCount + ' 道', icon: 'none' })
          }
          this.loadWrongList()
        })
      }
    })
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
