/**
 * 排行榜页面
 * --------------------------------------------------
 * 功能：
 *   1. 展示做题排行榜 Top100
 *   2. 底部可切换"总排名"和"今日排名"
 *   3. 底部固定显示"我的排名"（已登录才显示）
 *
 * 核心接口：GET /api/rank/list?type=total|today
 * 返回 { list, myRank, myTotalCount, type }
 *   - list: 排行榜数组，每项含 nickNo, totalCount, rank
 *   - myRank: 我的排名（游客为 null）
 *   - myTotalCount: 我的题数
 */

const api = require('../../utils/api.js')
const { create: createSwipe } = require('../../utils/swipe-tab')

const _darkMode = wx.getStorageSync('darkMode') === true

function applyNavBar(dark) {
  wx.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#000000',
    backgroundColor: dark ? '#1a1a1a' : '#ffffff'
  })
  // 同步原生页面背景色，避免首次创建页面时原生层闪白
  var bg = dark ? '#1a1a1a' : '#f5f6f8'
  wx.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg
  })
}

Page({
  data: {
    rankList: [],        // 排行榜列表
    myRank: null,        // 我的排名信息
    myTotalCount: 0,     // 我的总题数
    isLogin: false,      // 是否已登录
    loading: false,      // 加载状态
    darkMode: _darkMode,     // 深色模式
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    darkLayerVisible: _darkMode,
    // 稳定深色态：半径需覆盖到榜单底部（Top100 ≈ 7000px 高），用 8000px 兜底
    darkClipPath: _darkMode ? 'circle(8000px at 50% 50%)' : 'circle(0px at 50% 50%)',
    // 扩散动画时长（秒）。按 maxRadius 等比例换算，使"扩散速度 px/s"与首页一致：
    // 首页半径约 1200px / 0.55s ≈ 2182 px/s；rank 半径可达 7000~8000px，
    // 同样 550ms 走完会显得"嗖"地一下。这里按速度反推时长，并限定 [0.55, 1.2]，
    // 既让长榜单放慢到与首页手感统一，又避免内容极长时拖太久。
    themeDur: 0.55,
    themeAnimating: false,
    bgmEnabled: false,           // 背景音乐开关
    swipeOffset: 0,
    swipeAnimating: false,
    rankType: 'total',   // 排行榜类型：total | today
    remainingLikes: 3    // 今日剩余点赞次数
  },

  onLoad() {
    applyNavBar(_darkMode)
    this.swipeMgr = createSwipe(this, 1)
    // 先确定登录态，避免紧接着的 onShow 因 isLogin 初始值 false 误判为"刚登录"而重复拉取
    this.setData({ isLogin: !!wx.getStorageSync('token') })
    this.loadRank()
  },

  onHide() {
    if (this.swipeMgr) this.swipeMgr.cleanup()
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
   * 强制提交 clip-path 起点帧（照抄首页 _commitClipStart）
   * —— dark-layer 常驻 DOM 后，clip-path 过渡是"从上一帧的值"插值的，
   * 用一次 selectorQuery 强制渲染层完成布局计算，确认起点落地后再下发终点。
   */
  _commitClipStart(cb) {
    let done = false
    const fire = () => {
      if (done) return
      done = true
      cb()
    }
    try {
      wx.createSelectorQuery()
        .select('.rank-page.dark-layer')
        .boundingClientRect()
        .exec(() => setTimeout(fire, 16))
    } catch (e) {
      setTimeout(fire, 16)
    }
    setTimeout(fire, 120)
  },

  /**
   * 测量 dark-layer 的内容高度与当前滚动位置
   * —— 排行榜内容可滚动且远超视口，clip-path 圆心与扩散半径必须按
   * "dark-layer 本地坐标"计算，否则长榜单时圆覆盖不到底部。
   *
   * dark-layer 是 light-layer（overflow-y:auto）的 absolute 子元素：
   *   1) 高度 = 内容高度（auto 高度随内容增长，min-height:100% 只是兜底）；
   *   2) 会随内容一起滚动，所以 rect.top = -scrollTop，一次查询同时拿两个值。
   * 浅→深时 dark-layer 可能还没渲染（wx:if），先以半径 0 挂载再量（不可见，不闪跳）。
   * 测量失败时 scrollTop 传 0、contentH 传 0（由调用方兜底）。
   */
  _measureLayer(cb) {
    let done = false
    const fire = (scrollTop, contentH) => {
      if (done) return
      done = true
      cb(scrollTop, contentH)
    }

    const run = () => {
      try {
        wx.createSelectorQuery()
          .select('.rank-page.dark-layer')
          .boundingClientRect()
          .exec(res => {
            const rect = res && res[0]
            if (rect && rect.height) {
              fire(rect.top < 0 ? -rect.top : 0, rect.height)
            } else {
              fire(0, 0)
            }
          })
      } catch (e) {
        fire(0, 0)
      }
    }

    if (this.data.darkLayerVisible) {
      run()
    } else {
      // 浅→深：dark-layer 尚未在 DOM 中，先以半径 0 渲染出来才能量到内容高度
      this.setData({
        darkLayerVisible: true,
        clipNoTransition: true,
        darkClipPath: 'circle(0px at 50% 50%)'
      }, () => setTimeout(run, 50))
      // 兜底：setData 回调 / 查询异常时也要保证动画一定开始（按固定大半径算）
      setTimeout(() => fire(0, 0), 400)
    }
  },

  /**
   * 切换深色模式 — 从触摸点圆形扩散
   */
  onToggleTheme(e) {
    if (this.data.themeAnimating) return

    const touch = (e && e.changedTouches && e.changedTouches[0]) ||
                  (e && e.touches && e.touches[0])
    const x = touch ? touch.clientX : 340
    const y = touch ? touch.clientY : 24

    const goingDark = !this.data.darkMode
    this.setData({ themeAnimating: true })

    // 立即同步 tab bar 深色模式
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncTheme(goingDark)
    }

    // 立即同步所有其他 tab 页的主题（避免切换时闪屏）
    getApp().syncThemeToAllPages(goingDark, this.route)

    // 先量到 dark-layer 的内容高度与滚动位置，再算扩散半径（异步）
    this._measureLayer((scrollTop, contentH) => {
      const sys = wx.getWindowInfo()
      // dark-layer 本地坐标系下的触摸点 Y（dark-layer 随内容滚动）
      const localY = y + scrollTop
      // 半径必须覆盖到内容底部；测量失败时用固定大值兜底（Top100 ≈ 1万px 以内）
      const safeContentH = contentH > 0 ? contentH : 12000

      const dx = Math.max(x, sys.windowWidth - x)
      const dy = Math.max(localY, safeContentH - localY)
      const maxRadius = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 80

      // 按首页扩散速度等比例换算本次时长，让长榜单的扩散视觉速度与首页一致：
      // 首页典型半径 ≈ 屏幕对角线 ~900px、过渡 0.55s → 速度 ≈ 1636 px/s。
      // 之前用 1200px 基准偏快 33%，且 1.2s 上限过低导致长榜单被截断、仍偏快；
      // 这里改成首页真实速度基准，并把上限放宽到 2.0s：
      //   maxRadius=1500 → ~0.92s；3000 → ~1.83s；≥3300 → 封顶 2.0s。
      // 下限仍是首页时长 0.55s（短内容时不短于首页）。
      const REF_RADIUS = 900
      const REF_DUR = 0.55
      const dur = Math.max(REF_DUR, Math.min((maxRadius / REF_RADIUS) * REF_DUR, 2.0))

      this._runThemeAnim(goingDark, x, localY, maxRadius, dur)
    })
  },

  /**
   * 执行扩散/收缩动画（圆心 x/localY、半径 maxRadius 均已按 dark-layer 本地坐标算好）
   * dur 为本次动画时长（秒），由调用方按 maxRadius 等比例换算，保证视觉扩散速度
   * 与首页一致；setTimeout 也基于 dur，确保动画跑完再解除 themeAnimating
   * （提前解除会让后续操作干扰扩散，可能出现"铺不到底"）。
   */
  _runThemeAnim(goingDark, x, localY, maxRadius, dur) {
    const waitMs = Math.round(dur * 1000) + 50
    // themeDur 必须放在"钉起点"那次 setData（带 clipNoTransition:true），配合随后的
    // _commitClipStart 强制帧，确保新 duration 在过渡真正启动之前就已落地到元素
    // computed style。若放在"移除 no-transition + 设终点"那批 setData，渲染层在
    // 启用过渡的瞬间可能仍用旧 duration —— 这正是浅→深（dark-layer 刚创建）一直偏快的根因。
    if (goingDark) {
      // 浅 → 深：先无过渡把圆心钉到触摸点（半径 0，视觉上仍是浅色），再开过渡扩散
      applyNavBar(true)
      this.setData({
        clipNoTransition: true,
        themeDur: dur,
        darkLayerVisible: true,
        darkMode: true,
        darkClipPath: `circle(0px at ${x}px ${localY}px)`
      })
      this._commitClipStart(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(${maxRadius}px at ${x}px ${localY}px)`
        })
        setTimeout(() => {
          this.setData({ themeAnimating: false })
          wx.setStorageSync('darkMode', true)
        }, waitMs)
      })
    } else {
      // 深 → 浅：先无过渡钉圆心，再开过渡收缩到触摸点
      applyNavBar(false)
      this.setData({
        clipNoTransition: true,
        themeDur: dur,
        darkMode: false,
        darkClipPath: `circle(${maxRadius}px at ${x}px ${localY}px)`
      })
      this._commitClipStart(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(0px at ${x}px ${localY}px)`
        })
        setTimeout(() => {
          this.setData({ darkLayerVisible: false, themeAnimating: false })
          wx.setStorageSync('darkMode', false)
        }, waitMs)
      })
    }
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    const token = wx.getStorageSync('token')

    // 先读取旧的登录状态（必须在 setData 之前，否则 this.data.isLogin 已被同步更新）
    const wasLogin = this.data.isLogin

    this.setData({
      darkMode,
      fontScale,
      darkLayerVisible: darkMode,
      darkClipPath: darkMode ? 'circle(8000px at 50% 50%)' : 'circle(0px at 50% 50%)',
      isLogin: !!token,
      bgmEnabled: getApp().globalData.bgm.isEnabled()
    })

    // 如果登录状态变化（如刚登录），刷新排行榜
    if (token && !wasLogin) {
      this.loadRank()
    }

    // 同步底部导航栏选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected(1)
      this.getTabBar().syncTheme(darkMode)
    }
  },

  /**
   * 加载排行榜
   * 调用接口：GET /api/rank/list?type=total|today
   * 公开接口，游客也能看排行榜
   */
  loadRank() {
    this.setData({ loading: true })

    api.getRankList(this.data.rankType).then(data => {
      this.setData({
        rankList: data.list || [],
        myRank: data.myRank || null,
        myTotalCount: data.myTotalCount || 0,
        remainingLikes: data.remainingLikes != null ? data.remainingLikes : 3,
        loading: false
      })
    }).catch(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 点赞
   */
  onLike(e) {
    if (!this.data.isLogin) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (this.data.remainingLikes <= 0) {
      wx.showToast({ title: '今日点赞次数已用完', icon: 'none' })
      return
    }

    const { userId, index } = e.currentTarget.dataset
    const item = this.data.rankList[index]

    if (!item || item.liked) return

    // 捕获发起点赞时的榜单类型与目标用户，回调中校验一致性，
    // 防止点赞期间切换榜单后旧 Promise 把数据写到新榜单对应位置
    const likeRankType = this.data.rankType
    const likeUserId = userId

    // 乐观更新：立即切换UI状态
    const newList = this.data.rankList.slice()
    newList[index] = Object.assign({}, item, { liked: true, likeCount: (item.likeCount || 0) + 1 })
    this.setData({
      rankList: newList,
      remainingLikes: this.data.remainingLikes - 1
    })

    api.likeRankUser(userId, likeRankType).then(data => {
      // 校验：榜单未切换、目标用户仍在该位置时才修正，否则忽略（切榜单会重新拉取）
      if (this.data.rankType !== likeRankType) return
      const current = this.data.rankList[index]
      if (!current || current.userId !== likeUserId) return
      const corrected = this.data.rankList.slice()
      corrected[index] = Object.assign({}, current, {
        likeCount: data.likeCount
      })
      this.setData({
        rankList: corrected,
        remainingLikes: data.remainingLikes != null ? data.remainingLikes : this.data.remainingLikes
      })
    }).catch((err) => {
      // 校验：榜单未切换、目标仍是同一用户时才回滚，否则不回滚（避免污染新榜单）
      if (this.data.rankType !== likeRankType) return
      const current = this.data.rankList[index]
      if (!current || current.userId !== likeUserId) return
      const rolled = this.data.rankList.slice()
      rolled[index] = Object.assign({}, current, { liked: false, likeCount: item.likeCount || 0 })
      this.setData({
        rankList: rolled,
        remainingLikes: this.data.remainingLikes + 1
      })
      const msg = err && err.msg ? err.msg : '点赞失败'
      wx.showToast({ title: msg, icon: 'none' })
    })
  },

  /**
   * 切换排行榜类型（总排名 / 今日排名）
   */
  switchRank(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.rankType) return
    if (this.data.loading) return
    this.setData({ rankType: type, rankList: [] })
    this.loadRank()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadRank()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  },

  /**
   * 滑动手势 — 委托给手势管理器
   */
  onSwipeStart(e)  { if (this.swipeMgr) this.swipeMgr.onTouchStart(e) },
  onSwipeMove(e)   { if (this.swipeMgr) this.swipeMgr.onTouchMove(e) },
  onSwipeEnd(e)    { if (this.swipeMgr) this.swipeMgr.onTouchEnd(e) },
  onSwipeCancel(e) { if (this.swipeMgr) this.swipeMgr.onTouchCancel(e) },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '一句刷排行榜 — 看看你排第几？',
      path: '/pages/rank/rank',    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '一句刷排行榜 — 看看你排第几？',
      query: '',    }
  }
})
