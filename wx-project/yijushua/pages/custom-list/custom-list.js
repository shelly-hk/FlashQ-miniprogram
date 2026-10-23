/**
 * 自主题库列表页
 * --------------------------------------------------
 * 展示用户上传生成的所有题目，可直接查看答案解析
 * 支持删除、分类管理和分页浏览
 */

const api = require('../../utils/api.js')
const onboarding = require('../../utils/onboarding.js')

const PAGE_SIZE = 10

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
    list: [],
    total: 0,
    page: 1,
    totalPages: 1,
    loading: false,
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    darkLayerVisible: _darkMode,
    darkClipPath: 'circle(0px at 50% 50%)',
    themeAnimating: false,
    clipNoTransition: false,  // 短暂禁用过渡：circle ↔ inset(0) 形状切换瞬间用（避免扭曲插值）
    bgmEnabled: false,           // 背景音乐开关
    // 分类筛选
    categories: [],
    selectedCategoryId: 0,
    selectedCategoryName: '全部',
    showCategoryPanel: false,   // 分类面板展开/收起
    // 管理模式
    manageMode: false,
    selectedIds: {},      // { questionId: true }
    selectedCount: 0,
    allSelected: false,
    // 新手引导承接（custom-upload / custom-practice 两步）
    onboardingStep: null,
    onboardingStepIndex: 0,
    onboardingTotal: 5,
    onboardingClosing: false,
    onboardingSpotlight: null,
    onboardingBubblePlacement: 'bottom'
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    // 未登录时引导用户先登录
    const token = wx.getStorageSync('token')
    if (!token) {
      wx.showModal({
        title: '需要登录',
        content: '自主题库需要登录后使用，是否现在登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/mine/mine' })
          } else {
            wx.navigateBack()
          }
        }
      })
      return
    }
    this.loadCategories()
    this.loadList()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({
      darkMode,
      fontScale,
      darkLayerVisible: darkMode,
      // 深色稳定态用 inset(0) 矩形全覆盖（不用超大半径 circle，
      // 否则长列表滚动到下方时会露出浅色层，与刷题页/首页保持一致）
      darkClipPath: darkMode ? 'inset(0)' : 'circle(0px at 50% 50%)',
      // 入场直接跳到稳定态（无过渡）：circle↔inset 形状不同无法插值，
      // 启用过渡会让浏览器尝试插值并闪烁。扩散动画在 onToggleTheme 里实现。
      clipNoTransition: true,
      bgmEnabled: getApp().globalData.bgm.isEnabled()
    })
    wx.nextTick(() => this.setData({ clipNoTransition: false }))
    this.loadCategories()
    // 承接新手引导：若引导停留在 custom-list 页步骤，则展示高亮气泡
    this._syncOnboarding()
  },

  onHide() {
    this._clearOnboardingClosingTimer()
  },

  onUnload() {
    this._clearOnboardingClosingTimer()
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
   * 切换深色模式 — 从触摸点圆形扩散（与刷题页一致）
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
        this.setData({ darkClipPath: `circle(${maxRadius}px at ${x}px ${y}px)` })
      }, 30)
      setTimeout(() => {
        // 动画结束切回 inset(0) 矩形全覆盖：circle 与 inset 形状不同无法插值，
        // 必须无过渡瞬间切换；inset(0) 不受圆心/半径限制，长列表滚动不露浅色层
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
      this.setData({ categories: data.list || [] })
    }).catch(() => {})
  },

  /**
   * 展开/收起分类筛选面板
   */
  onToggleCategoryPanel() {
    this.setData({ showCategoryPanel: !this.data.showCategoryPanel })
  },

  /**
   * 切换分类筛选
   */
  onSelectCategory(e) {
    const id = Number(e.currentTarget.dataset.id) || 0
    const name = e.currentTarget.dataset.name || '全部'

    if (id === this.data.selectedCategoryId) {
      // 同一分类则仅收起面板
      this.setData({ showCategoryPanel: false })
      return
    }

    this.setData({
      selectedCategoryId: id,
      selectedCategoryName: name,
      showCategoryPanel: false,
      list: [],
      page: 1,
      totalPages: 1
    })
    this.loadList()
  },

  /**
   * 长按分类 — 弹出管理菜单（重命名/删除）
   */
  onLongPressCategory(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    const isDefault = e.currentTarget.dataset.isdefault

    // 默认分类不可删除/重命名
    if (isDefault) {
      wx.showToast({ title: '默认分类不可操作', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: ['重命名分类', '删除分类'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this._renameCategory(id, name)
        } else if (res.tapIndex === 1) {
          this._deleteCategory(id, name)
        }
      }
    })
  },

  /**
   * 重命名分类
   */
  _renameCategory(id, oldName) {
    wx.showModal({
      title: '重命名分类',
      placeholderText: '仅中文，不超过10个字',
      editable: true,
      content: oldName,
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) {
          wx.showToast({ title: '分类名称不能为空', icon: 'none' })
          return
        }
        if (name === oldName) return

        api.renameCustomCategory(id, name).then(() => {
          wx.showToast({ title: '重命名成功', icon: 'success' })
          this.loadCategories()
        }).catch((err) => {
          const msg = err && err.msg ? err.msg : '重命名失败'
          wx.showToast({ title: msg, icon: 'none' })
        })
      }
    })
  },

  /**
   * 删除分类（题目迁移到"其他"）
   */
  _deleteCategory(id, name) {
    wx.showModal({
      title: '删除分类',
      content: '删除分类「' + name + '」后，该分类下的题目将迁移到「其他」，确定继续？',
      confirmText: '确定删除',
      success: (res) => {
        if (!res.confirm) return

        api.deleteCustomCategory(id).then(() => {
          wx.showToast({ title: '已删除分类', icon: 'success' })
          // 如果删除的是当前选中的分类，回到全部
          if (this.data.selectedCategoryId === id) {
            this.setData({
              selectedCategoryId: 0,
              selectedCategoryName: '全部',
              list: [],
              page: 1,
              totalPages: 1
            })
            this.loadList()
          }
          this.loadCategories()
        }).catch((err) => {
          const msg = err && err.msg ? err.msg : '删除失败'
          wx.showToast({ title: msg, icon: 'none' })
        })
      }
    })
  },

  /**
   * 加载题目列表（分页）
   */
  loadList() {
    this.setData({ loading: true })

    const categoryId = this.data.selectedCategoryId || undefined

    api.getCustomQuestionList(this.data.page, PAGE_SIZE, undefined, categoryId).then(data => {
      const list = data.list || []
      const total = data.total || 0
      this.setData({
        list: list,
        total: total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        loading: false
      })
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 上一页
   */
  onPrevPage() {
    if (this.data.page <= 1 || this.data.loading) return
    this.setData({ page: this.data.page - 1, selectedIds: {}, selectedCount: 0, allSelected: false })
    this.loadList()
  },

  /**
   * 下一页
   */
  onNextPage() {
    if (this.data.page >= this.data.totalPages || this.data.loading) return
    this.setData({ page: this.data.page + 1, selectedIds: {}, selectedCount: 0, allSelected: false })
    this.loadList()
  },

  /**
   * 修改题目所属分类
   */
  onChangeCategory(e) {
    const questionId = e.currentTarget.dataset.id
    const questionIndex = e.currentTarget.dataset.index

    // 构建分类选项
    const categories = this.data.categories
    if (categories.length === 0) {
      wx.showToast({ title: '暂无分类', icon: 'none' })
      return
    }

    const itemList = categories.map(c => c.name + '（' + c.questionCount + '题）')

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        const selected = categories[res.tapIndex]
        if (!selected) return

        api.updateCustomQuestionCategory(questionId, selected.id).then(() => {
          // 更新列表中该题目的分类信息
          const list = this.data.list.map((item, idx) => {
            if (idx === questionIndex) {
              return Object.assign({}, item, { categoryId: selected.id, categoryName: selected.name })
            }
            return item
          })
          this.setData({ list: list })
          // 刷新分类列表中的题目数
          this.loadCategories()
          wx.showToast({ title: '已归入「' + selected.name + '」', icon: 'none' })
        }).catch(() => {
          wx.showToast({ title: '修改失败', icon: 'none' })
        })
      }
    })
  },

  /**
   * 新建分类
   */
  onCreateCategory() {
    wx.showModal({
      title: '新建分类',
      placeholderText: '仅中文，不超过10个字',
      editable: true,
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) {
          wx.showToast({ title: '分类名称不能为空', icon: 'none' })
          return
        }

        api.createCustomCategory(name).then(data => {
          wx.showToast({ title: '创建成功', icon: 'success' })
          this.loadCategories()
        }).catch((err) => {
          const msg = err && err.msg ? err.msg : '创建失败'
          wx.showToast({ title: msg, icon: 'none' })
        })
      }
    })
  },

  /**
   * 收藏/取消收藏单道题目
   */
  onToggleItemFavorite(e) {
    const id = Number(e.currentTarget.dataset.id)
    const index = Number(e.currentTarget.dataset.index)
    api.toggleCustomFavorite(id).then(res => {
      const list = this.data.list.map((item, idx) => {
        if (idx === index) {
          return Object.assign({}, item, { isFavorited: res.isFavorited })
        }
        return item
      })
      this.setData({ list })
      wx.showToast({ title: res.isFavorited ? '已收藏' : '已取消', icon: 'none' })
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  /**
   * 删除题目
   */
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index

    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定删除这道题？',
      success: (res) => {
        if (!res.confirm) return

        api.deleteCustomQuestion(id).then(() => {
          this.loadList()
          this.loadCategories()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(() => {
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  },

  /**
   * 跳转刷题
   */
  onPractice() {
    // 若新手引导停留在 custom-practice 步骤，用户点真实按钮也算完成；
    // 只完成步骤，不调用 _afterOnboardingChange（避免它的 setTimeout 与本跳转冲突，
    // 让首页在用户回到首页时通过 onShow → _syncOnboarding 自动承接 complete 步骤）
    if (this.data.onboardingStep && this.data.onboardingStep.id === 'custom-practice') {
      onboarding.completeCurrentStep()
      this.setData({ onboardingStep: null, onboardingSpotlight: null })
    }
    const categoryId = this.data.selectedCategoryId || 0
    const categoryName = encodeURIComponent(this.data.selectedCategoryName || '全部')
    wx.navigateTo({ url: '/pages/custom/custom?categoryId=' + categoryId + '&categoryName=' + categoryName })
  },

  /**
   * 跳转上传
   */
  onUpload() {
    // 若新手引导停留在 custom-upload 步骤，用户点真实按钮也算完成；
    // 只完成步骤并清理当前气泡，让用户专注完成上传流程；
    // custom-list 的 onShow 会在用户返回时自动承接 custom-practice 步骤
    if (this.data.onboardingStep && this.data.onboardingStep.id === 'custom-upload') {
      onboarding.completeCurrentStep()
      this.setData({ onboardingStep: null, onboardingSpotlight: null })
    }
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  /* ========== 新手引导承接（custom-upload / custom-practice 两步） ========== */

  /**
   * 同步新手引导状态：若当前页面对应步骤未完成，则展示高亮 + 气泡
   */
  _syncOnboarding() {
    const allSteps = onboarding.getAllSteps()
    const step = onboarding.getStepForPage('pages/custom-list/custom-list')
    let stepIndex = -1
    if (step) {
      const ids = allSteps.map(s => s.id)
      stepIndex = ids.indexOf(step.id)
    }
    this.setData({
      onboardingStep: step,
      onboardingStepIndex: stepIndex >= 0 ? stepIndex : 0,
      onboardingTotal: allSteps.length,
      onboardingSpotlight: null,
      onboardingBubblePlacement: 'bottom',
      onboardingClosing: false
    })
    // 若该步骤有高亮目标，等渲染完成后测量其位置
    if (step && step.target) {
      setTimeout(() => this._measureOnboardingTarget(step.target), 220)
    }
  },

  /**
   * 测量高亮目标的屏幕坐标，并根据 spotlight 位置动态决定气泡放上方还是下方
   */
  _measureOnboardingTarget(target) {
    const selMap = {
      'upload-btn': '.js-entry-upload',
      'practice-btn': '.js-entry-practice'
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

        let screenH = 800
        try {
          const info = wx.getWindowInfo && wx.getWindowInfo()
          if (info && info.windowHeight) screenH = info.windowHeight
        } catch (e) {}

        const spotCenterY = r.top + r.height / 2
        const isUpperHalf = spotCenterY < screenH / 2

        const pad = 6
        this.setData({
          onboardingSpotlight: {
            left: r.left - pad,
            top: r.top - pad,
            width: r.width + pad * 2,
            height: r.height + pad * 2
          },
          onboardingBubblePlacement: isUpperHalf ? 'bottom' : 'top'
        })
      })
  },

  /**
   * 点击引导气泡主按钮（"我知道了" / "完成引导" 等）
   */
  onOnboardingPrimary() {
    const step = this.data.onboardingStep
    if (!step) return
    onboarding.completeCurrentStep()
    this._afterOnboardingChange()
  },

  /**
   * 阻止引导蒙层的事件穿透
   */
  onOnboardingNoop() {},

  /**
   * 引导状态变更后的统一收尾：
   *  - 启动退出动画
   *  - 动画结束后判断是否还有本页步骤 → 继续承接；否则跳回首页承接 complete 步骤
   */
  _afterOnboardingChange() {
    this.setData({ onboardingClosing: true })
    this._clearOnboardingClosingTimer()
    this._onboardingClosingTimer = setTimeout(() => {
      this.setData({ onboardingClosing: false })
      const step = onboarding.getStepForPage('pages/custom-list/custom-list')
      if (step) {
        // 本页还有未完成的引导步骤，继续承接
        this._syncOnboarding()
      } else {
        // 本页引导已结束，关闭蒙层
        this.setData({
          onboardingStep: null,
          onboardingSpotlight: null
        })
        // 若整段引导尚未完成（complete 步骤在首页），自动跳回首页承接
        if (!onboarding.isFinished() && !onboarding.isSkipped()) {
          wx.switchTab({ url: '/pages/home/home' })
        }
      }
    }, 260)
  },

  /** 清理引导气泡退出动画定时器 */
  _clearOnboardingClosingTimer() {
    if (this._onboardingClosingTimer) {
      clearTimeout(this._onboardingClosingTimer)
      this._onboardingClosingTimer = null
    }
  },

  /* ========== 批量管理模式 ========== */

  /**
   * 进入管理模式
   */
  onEnterManage() {
    this.setData({ manageMode: true, selectedIds: {}, selectedCount: 0, allSelected: false })
  },

  /**
   * 退出管理模式
   */
  onExitManage() {
    this.setData({ manageMode: false, selectedIds: {}, selectedCount: 0, allSelected: false })
  },

  /**
   * 切换单个选中
   */
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
  },

  /**
   * 全选 / 取消全选（当前页）
   */
  onToggleAll() {
    if (this.data.allSelected) {
      this.setData({ selectedIds: {}, selectedCount: 0, allSelected: false })
    } else {
      const selectedIds = {}
      this.data.list.forEach(item => { selectedIds[item.id] = true })
      this.setData({ selectedIds, selectedCount: this.data.list.length, allSelected: true })
    }
  },

  /**
   * 批量归入分类
   */
  onBatchAssign() {
    const ids = Object.keys(this.data.selectedIds).map(id => Number(id))
    if (ids.length === 0) return

    const categories = this.data.categories
    if (categories.length === 0) {
      wx.showToast({ title: '暂无分类', icon: 'none' })
      return
    }

    const itemList = categories.map(c => c.name + '（' + c.questionCount + '题）')

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        const selected = categories[res.tapIndex]
        if (!selected) return

        wx.showLoading({ title: '处理中...' })

        let okCount = 0
        let failCount = 0
        const tasks = ids.map(id =>
          api.updateCustomQuestionCategory(id, selected.id)
            .then(() => { okCount++ })
            .catch(() => { failCount++ })
        )
        Promise.all(tasks).then(() => {
          wx.hideLoading()
          if (failCount === 0) {
            // 更新列表中已选题目的分类
            const list = this.data.list.map(item => {
              if (this.data.selectedIds[item.id]) {
                return Object.assign({}, item, { categoryId: selected.id, categoryName: selected.name })
              }
              return item
            })
            this.setData({ list, selectedIds: {}, selectedCount: 0, allSelected: false })
            this.loadCategories()
            wx.showToast({ title: '已归入「' + selected.name + '」', icon: 'none' })
          } else {
            wx.showToast({ title: '成功 ' + okCount + ' 道，失败 ' + failCount + ' 道', icon: 'none' })
            this.loadList()
          }
        })
      }
    })
  },

  /**
   * 批量收藏（只收藏未收藏的，已收藏的跳过）
   */
  onBatchFavorite() {
    const selectedIds = Object.keys(this.data.selectedIds).map(id => Number(id))
    if (selectedIds.length === 0) return

    // 过滤掉已收藏的题目，避免 toggle 反向取消
    const toFavorite = selectedIds.filter(id => {
      const item = this.data.list.find(q => q.id === id)
      return item && !item.isFavorited
    })

    if (toFavorite.length === 0) {
      wx.showToast({ title: '选中的题目都已收藏', icon: 'none' })
      return
    }

    wx.showLoading({ title: '收藏中...' })

    let successCount = 0
    let failCount = 0

    const tasks = toFavorite.map(id =>
      api.toggleCustomFavorite(id)
        .then(() => { successCount++ })
        .catch(() => { failCount++ })
    )

    Promise.all(tasks).then(() => {
      wx.hideLoading()

      if (failCount === 0) {
        wx.showToast({ title: '已收藏 ' + successCount + ' 道题', icon: 'none' })
      } else if (successCount === 0) {
        wx.showToast({ title: '收藏失败，请重试', icon: 'none' })
      } else {
        wx.showToast({ title: '成功 ' + successCount + ' 道，失败 ' + failCount + ' 道', icon: 'none' })
      }

      this.setData({ selectedIds: {}, selectedCount: 0, allSelected: false })
      this.loadList()
    })
  },

  /**
   * 批量删除（仅删除已选中的题目）
   */
  onBatchDelete() {
    const ids = Object.keys(this.data.selectedIds).map(id => Number(id))
    if (ids.length === 0) return

    wx.showModal({
      title: '确认删除',
      content: '将删除选中的 ' + ids.length + ' 道题，删除后不可恢复，确定继续？',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        let okCount = 0
        let failCount = 0
        const tasks = ids.map(id =>
          api.deleteCustomQuestion(id)
            .then(() => { okCount++ })
            .catch(() => { failCount++ })
        )
        Promise.all(tasks).then(() => {
          wx.hideLoading()
          this.setData({
            selectedIds: {}, selectedCount: 0, allSelected: false
          })
          this.loadList()
          this.loadCategories()
          if (failCount === 0) {
            wx.showToast({ title: '已删除', icon: 'success' })
          } else {
            wx.showToast({ title: '成功 ' + okCount + ' 道，失败 ' + failCount + ' 道', icon: 'none' })
          }
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
