/**
 * 收藏列表页面
 * --------------------------------------------------
 * 功能：
 *   1. Tab切换：公共题库收藏 / 自主题库收藏
 *   2. 按科目/分类筛选（顶部标签：全部 + 各科目/分类）
 *   3. 分页展示（每页10条，底部可切换页码）
 *   4. 点击题目 → 展开查看题干、选项和正确答案
 *   5. 取消收藏 → 从列表中移除
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

// 公共题库下的二级分类（题库细分）。'all'=全部汇总视图，其余对应 api 的 quizType
//   it       → 随机刷题科目体系（默认）
//   code     → 代码题库
//   interview→ 面试题库
const PUBLIC_SUB_TABS = [
  { id: 'all', name: '全部' },
  { id: 'it', name: '随机刷题' },
  { id: 'code', name: '代码题库' },
  { id: 'interview', name: '面试题库' }
]

Page({
  data: {
    activeTab: 'public',  // 'public' = 公共题库收藏, 'custom' = 自主题库收藏
    publicSubTabs: PUBLIC_SUB_TABS,  // 公共题库二级分类（细分随机/代码/面试）
    activeQuizType: 'all', // 当前选中的二级分类（仅 public tab 生效）：'all'/'it'/'code'/'interview'
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
    // 分页
    totalPages: 0,
    // 批量管理
    manageMode: false,    // 是否处于管理模式
    selectedIds: []       // 选中的题目ID列表
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
      this.loadList()
    }
    this._loaded = true
  },

  /**
   * 初始化页面：加载筛选标签 + 列表
   */
  initPage() {
    this.loadFilterTabs().then(() => {
      this.loadList()
    })
  },

  /**
   * 加载筛选标签（公共→科目列表，自定义→分类列表）
   * 公共题库下：选了具体二级分类（随机/代码/面试）时才加载对应科目；选「全部」时不展示科目筛选，
   * 因为跨题库汇总视图里科目与题目类型不一一对应，会出现 it 科目筛到 code 题的错位。
   *
   * 优化：只展示「当前用户实际有收藏题」的分类，没有收藏题的分类（例如从未收藏的 Java）不再显示。
   * 做法：拿到全部候选分类后，对每个分类用与 loadList 相同的筛选条件并发一次 size=1 的轻量列表请求，
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

    // 拉全部候选分类
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

      // 探测参数与 loadList 保持一致，确保 total 口径相同
      const quizType = isPublic ? this.data.activeQuizType : undefined
      const fetchFn = isPublic ? api.getFavoriteList : api.getCustomFavoriteList

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
   * 切换 Tab（公共/自定义）
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
      selectedIds: []
    })
    this.initPage()
  },

  /**
   * 切换公共题库下的二级分类（随机刷题 / 代码题库 / 面试题库 / 全部）
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
      selectedIds: []
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
   * 切换筛选标签（科目/分类）
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
      selectedIds: []
    })
    this.loadList()
  },

  /**
   * 加载收藏列表（分页）
   */
  loadList() {
    if (this.data.loading) return

    this.setData({ loading: true })

    const filterId = this.data.activeFilter || null  // 0 → null → 全部
    const fetchFn = this.data.activeTab === 'public'
      ? api.getFavoriteList
      : api.getCustomFavoriteList

    // 公共题库收藏夹：二级分类为「全部」时跨题库汇总（传 'all' 展示全部，带类型标签）；
    // 选了具体分类（it/code/interview）时按 quizType 精确筛选
    const quizType = this.data.activeTab === 'public' ? this.data.activeQuizType : undefined

    fetchFn(this.data.page, this.data.size, filterId, quizType).then(data => {
      const newList = (data.list || []).map(item => {
        item.optionsParsed = (item.options || []).map((text, index) => ({
          letter: String.fromCharCode(65 + index),
          text: text
        }))
        item._selected = false
        return item
      })

      const total = data.total || 0
      this.setData({
        list: newList,
        total: total,
        totalPages: Math.ceil(total / this.data.size),
        loading: false
      })
      // 若处于管理模式（如未来支持翻页保留），同步选中态
      if (this.data.manageMode) {
        this._syncSelection()
      }
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 点击题目 → 展开/收起
   */
  onQuestionTap(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      expandedId: this.data.expandedId === id ? null : id
    })
  },

  /**
   * 取消收藏（根据 Tab 调用不同的删除接口）
   */
  onRemoveFavorite(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: '提示',
      content: '确定取消收藏吗？',
      success: (res) => {
        if (!res.confirm) return

        const deleteFn = this.data.activeTab === 'public'
          ? api.deleteFavorite
          : api.deleteCustomFavorite

        deleteFn(id).then(() => {
          wx.showToast({ title: '已取消收藏', icon: 'none' })
          this.loadList()
        }).catch(() => {
          wx.showToast({ title: '操作失败', icon: 'none' })
        })
      }
    })
  },

  /* ========== 分页 ========== */

  /* ========== 批量管理 ========== */

  /**
   * 把 selectedIds 同步到列表项的 _selected 字段
   * （WXML 表达式不支持 .indexOf()，必须在 JS 端预算好）
   */
  _syncSelection() {
    const selectedIds = this.data.selectedIds || []
    const selectedSet = new Set()
    selectedIds.forEach(id => selectedSet.add(id))
    const list = this.data.list.map(item => Object.assign({}, item, {
      _selected: selectedSet.has(item.id)
    }))
    this.setData({ list })
  },

  /**
   * 进入/退出管理模式
   */
  onToggleManage() {
    const next = !this.data.manageMode
    this.setData({
      manageMode: next,
      selectedIds: [],
      expandedId: null
    })
    if (next) {
      // 进入管理模式：所有项默认未选
      this._syncSelection()
    }
  },

  /**
   * 选择/取消选择某条收藏（仅管理模式有效）
   */
  onSelectItem(e) {
    if (!this.data.manageMode) return
    const id = e.currentTarget.dataset.id
    const selected = this.data.selectedIds.slice()
    const idx = selected.indexOf(id)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(id)
    }
    this.setData({ selectedIds: selected })
    this._syncSelection()
  },

  /**
   * 全选/取消全选当前页
   */
  onSelectAll() {
    const allIds = this.data.list.map(item => item.id)
    const allSelected = allIds.length > 0 && this.data.selectedIds.length >= allIds.length
    this.setData({
      selectedIds: allSelected ? [] : allIds
    })
    this._syncSelection()
  },

  /**
   * 批量取消收藏
   */
  onBatchRemove() {
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '请先选择题目', icon: 'none' })
      return
    }

    const count = this.data.selectedIds.length
    wx.showModal({
      title: '提示',
      content: `确定取消收藏选中的 ${count} 道题吗？`,
      success: (res) => {
        if (!res.confirm) return

        const deleteFn = this.data.activeTab === 'public'
          ? api.deleteFavorite
          : api.deleteCustomFavorite

        const promises = this.data.selectedIds.map(id => deleteFn(id))
        Promise.all(promises).then(() => {
          wx.showToast({ title: `已取消 ${count} 道收藏`, icon: 'none' })
          this.setData({ manageMode: false, selectedIds: [] })
          this.loadList()
        }).catch(() => {
          wx.showToast({ title: '部分操作失败', icon: 'none' })
          this.loadList()
        })
      }
    })
  },

  /* ========== 分页 ========== */

  onPrevPage() {
    if (this.data.page <= 1 || this.data.loading) return
    this.setData({ page: this.data.page - 1, list: [], expandedId: null, manageMode: false, selectedIds: [] })
    this.loadList()
  },

  onNextPage() {
    if (this.data.page >= this.data.totalPages || this.data.loading) return
    this.setData({ page: this.data.page + 1, list: [], expandedId: null, manageMode: false, selectedIds: [] })
    this.loadList()
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
