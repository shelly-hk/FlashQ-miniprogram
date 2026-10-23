/**
 * 我的页面
 * --------------------------------------------------
 * 功能：
 *   1. 登录 / 未登录状态切换
 *   2. 已登录 → 显示用户做题统计（总题数、今日、排名、错题、收藏）
 *   3. 菜单入口：错题本、收藏列表、关于
 *   4. 退出登录
 *
 * 登录流程（重点理解）：
 *   用户点「微信登录」
 *     → wx.login() 拿到临时凭证 code（有效期5分钟）
 *     → 把 code 发给我们的后端 POST /api/wx/login
 *     → 后端拿 code 去微信服务器换 openid，生成 token 返回
 *     → 前端把 token 存到本地缓存，以后每个请求自动带上
 */

const api = require('../../utils/api.js')
const { create: createSwipe } = require('../../utils/swipe-tab')
const dailyStats = require('../../utils/daily-stats.js')

const _darkMode = wx.getStorageSync('darkMode') === true

/* ============================================================
 * 仪表盘数据计算（纯前端，无需后端改动）
 * ------------------------------------------------------------
 * 输入：getUserInfo 返回的 6 个数字（totalCount/todayCount/rank/
 *       todayRank/wrongTotal/favoriteTotal）
 * 输出：等级、连续天数、升级路线等"看得见的进步"
 *
 * 本地存储键：dailyStats — { 'YYYY-MM-DD': 当日题数 }
 * 每次进入页面时基于 todayCount 快照刷新当日记录
 * ============================================================ */

// 等级阈值（题数 → 等级）
const LEVELS = [
  { min: 0,    name: '新手', icon: '🌱', color: '#A0D9E8' },
  { min: 50,   name: '学徒', icon: '🎯', color: '#7BC4D9' },
  { min: 200,  name: '能手', icon: '⭐', color: '#5EB3D9' },
  { min: 500,  name: '高手', icon: '💎', color: '#3D6B7E' },
  { min: 1000, name: '大师', icon: '🏆', color: '#f39c12' },
  { min: 2000, name: '宗师', icon: '👑', color: '#9b59b6' }
]
const LEVEL_MILESTONES = [0, 50, 200, 500, 1000, 2000]

// 生成本地日期键，避免 toISOString 的时区跨日问题
function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

// 根据累计题数推导等级对象
function pickLevel(total) {
  let lv = LEVELS[0]
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i].min) { lv = LEVELS[i]; idx = i }
  }
  return Object.assign({}, lv, { idx })
}

// 等级进度（到下一级的百分比与剩余题数）
function levelProgress(total) {
  const lv = pickLevel(total)
  const cur = LEVEL_MILESTONES[lv.idx]
  const next = LEVEL_MILESTONES[Math.min(lv.idx + 1, LEVEL_MILESTONES.length - 1)]
  if (lv.idx >= LEVEL_MILESTONES.length - 1) {
    return { pct: 100, remain: 0, next: null }
  }
  const span = Math.max(1, next - cur)
  const pct = Math.max(0, Math.min(100, Math.round(((total - cur) / span) * 100)))
  return { pct, remain: Math.max(0, next - total), next }
}

// 升级路线：返回完整等级数组，每项含状态、进度、副标题
// status: 'passed'（已超越）/ 'current'（当前）/ 'locked'（未达）
function buildLevelRoadmap(total) {
  const currentIdx = pickLevel(total).idx
  return LEVELS.map((lv, i) => {
    let status, subtitle, progress, remain
    if (i < currentIdx) {
      // 已超越的等级
      status = 'passed'
      subtitle = '已达成'
      progress = 100
      remain = 0
    } else if (i === currentIdx) {
      // 当前等级
      const next = LEVEL_MILESTONES[Math.min(i + 1, LEVEL_MILESTONES.length - 1)]
      const isMax = i >= LEVELS.length - 1
      if (isMax) {
        status = 'current'
        subtitle = '已达最高等级'
        progress = 100
        remain = 0
      } else {
        const span = Math.max(1, next - lv.min)
        progress = Math.max(0, Math.min(100, Math.round(((total - lv.min) / span) * 100)))
        remain = Math.max(0, next - total)
        status = 'current'
        subtitle = '当前等级'
      }
    } else {
      // 未解锁
      status = 'locked'
      remain = Math.max(0, lv.min - total)
      progress = 0
      subtitle = remain === 0 ? '即将解锁' : ('还需 ' + remain + ' 题')
    }
    return {
      idx: i,
      name: lv.name,
      icon: lv.icon,
      color: lv.color,
      min: lv.min,
      status,
      subtitle,
      progress,
      remain
    }
  })
}

// 把服务端 todayCount 快照合并进本地存储，返回最新 history
// 合并规则见 utils/daily-stats.js：今日计数按 max(服务端, 本机埋点) 重算，防跨天污染
function recordDailyHistory(todayCount) {
  return dailyStats.mergeServerToday(todayCount)
}

// 近 N 天柱状图数据
function buildWeekly(history, days) {
  const labels = ['日', '一', '二', '三', '四', '五', '六']
  const arr = []
  const now = new Date()
  let max = 1
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dateKey(d)
    const count = history[key] || 0
    if (count > max) max = count
    arr.push({
      key,
      label: labels[d.getDay()],
      count,
      isToday: i === 0
    })
  }
  // 柱高相对最大值做归一化（最小 8% 保证零数据可见）
  return {
    list: arr.map(it => Object.assign({}, it, {
      height: Math.max(8, Math.round((it.count / max) * 100))
    })),
    max
  }
}

// 连续学习天数（今日未做题时也算昨天起算，保留 streak 不破）
function calcStreak(history) {
  const now = new Date()
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const v = history[dateKey(d)] || 0
    if (v > 0) {
      streak++
    } else if (i === 0) {
      // 今日空白：跳过，让昨天的 streak 继续
      continue
    } else {
      break
    }
  }
  return streak
}

// 计算"日均题数"（最近 N 天，不含今日，避免自我拉高）
function calcDailyAvg(history, days) {
  const now = new Date()
  let sum = 0, hit = 0
  for (let i = 1; i <= days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dateKey(d)
    if (history[key] !== undefined) {
      sum += history[key] || 0
      hit++
    }
  }
  return hit > 0 ? Math.round(sum / hit) : 0
}

/**
 * 计算仪表盘所有衍生指标
 * @param {object} userInfo  来自 getUserInfo
 * @returns {object} dashboard 渲染所需数据
 */
function computeDashboard(userInfo) {
  if (!userInfo) return null

  const totalCount  = userInfo.totalCount  || 0
  const todayCount  = userInfo.todayCount  || 0
  const wrongTotal  = userInfo.wrongTotal  || 0
  const favoriteTotal = userInfo.favoriteTotal || 0
  const rank        = userInfo.rank
  const todayRank   = userInfo.todayRank

  // ① 等级
  const level = pickLevel(totalCount)
  const lvProg = levelProgress(totalCount)

  // ② 本地历史 → 连续天数 / 周轨迹 / 日均
  const history = recordDailyHistory(todayCount)
  const streak  = calcStreak(history)
  const weekly  = buildWeekly(history, 7)
  const dailyAvg = calcDailyAvg(history, 7)

  // ③ 今日表现：是否破纪录（超过最近 6 天峰值）
  const recentMax = Math.max.apply(null, weekly.list.slice(0, 6).map(d => d.count))
  const isRecord  = todayCount > 0 && todayCount > recentMax
  const todayVsAvg = dailyAvg > 0 ? +(todayCount / dailyAvg).toFixed(1) : 0

  // ④ 排名趋势：今日榜 vs 总榜（值越小越好）
  let rankTrend = 'flat', rankDelta = 0
  if (rank > 0 && todayRank > 0) {
    if (todayRank < rank)      { rankTrend = 'up';   rankDelta = rank - todayRank }
    else if (todayRank > rank) { rankTrend = 'down'; rankDelta = todayRank - rank }
  }
  // 击败百分比（粗估）：rank=1 → 99%，rank=10 → 90%
  const rankBeat = rank > 0
    ? Math.max(5, Math.min(99, 100 - rank))
    : null

  return {
    // 原始数字
    totalCount, todayCount, wrongTotal, favoriteTotal,
    rank: rank > 0 ? rank : '-',
    todayRank: todayRank > 0 ? todayRank : '-',
    // 等级
    level, lvProg,
    // 升级路线（点击等级徽章弹出）
    levelRoadmap: buildLevelRoadmap(totalCount),
    // 连续学习
    streak,
    // 今日表现（KPI 标签用；weekly/dailyAvg 仅作内部计算，不导出）
    todayVsAvg, isRecord,
    // 排名
    rankTrend, rankDelta, rankBeat
  }
}

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
    isLogin: false,       // 是否已登录
    userInfo: null,       // 用户统计信息
    dashboard: null,      // 学习洞察仪表盘数据
    levelModalVisible: false,  // 升级路线弹窗开关
    loginConsentVisible: false,  // 登录协议确认弹窗开关
    logging: false,       // 是否正在登录中（防止重复点击）
    configInfo: null,     // 应用配置（备案信息等）
    darkMode: _darkMode,      // 深色模式
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    // 浅色层不挂 dark 类（照抄首页：浅色层永远继承 .mine-page 的日间变量，恒浅）。
    // 夜间配色规则 .mine-page.dark .xxx 天然只作用于挂了 dark 类的深色层。
    // 稳定态与首页保持一致：circle(3000px) 全覆盖（深色层常驻、只靠 clip-path 显隐，
    // 不做 visibility / inset 形状切换，避免形状插值导致的闪屏）。
    darkClipPath: _darkMode ? 'circle(3000px at 50% 50%)' : 'circle(0px at 50% 50%)',
    themeAnimating: false,
    clipNoTransition: false,  // 短暂禁用过渡：用于无过渡地把 clip-path 圆心钉到触摸点
    pressedKey: '',       // 按压反馈：驱动深色层副本显示按压效果（深色层 pointer-events:none，hover 无法触发）
    bgmEnabled: false,          // 背景音乐开关
    swipeOffset: 0,
    swipeAnimating: false,
    showAvatarSheet: false,    // 头像选择弹窗
    showNicknameModal: false,  // 昵称编辑弹窗
    tempNickName: '',          // 临时昵称（编辑中）
    showPrivacy: false         // 隐私授权弹窗
  },

  /**
   * 页面加载时触发（只执行一次）
   * 如果已登录，直接拉取用户信息
   */
  onLoad() {
    applyNavBar(_darkMode)
    this.swipeMgr = createSwipe(this, 2)
    this.checkLogin()
    this.loadConfig()
  },

  onHide() {
    if (this.swipeMgr) this.swipeMgr.cleanup()
  },

  /**
   * 页面每次显示时触发
   * 从其他页面切回来时，重新检查登录状态和统计数据
   * （比如在刷题页做了几道题，回来要刷新数字）
   */
  onShow() {
    this.checkLogin()
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({
      darkMode,
      fontScale,
      // 稳定态与首页一致：深色时用大半径圆形全覆盖，避免 inset ↔ circle 形状切换引发闪屏。
      // clipNoTransition 必需：进入页面就地复位 clip-path 时必须禁用过渡，
      // 否则会从其他页面残留的 clip-path（如 inset(0)）插值到 circle(3000px)，
      // 两种形状类型无法平滑插值 → 复位瞬间闪一帧。
      clipNoTransition: true,
      darkClipPath: darkMode ? 'circle(3000px at 50% 50%)' : 'circle(0px at 50% 50%)',
      // 复位主题切换动画锁：若上次扩散动画未走完就离开页面，
      // 回来后 themeAnimating 仍为 true 会导致再也无法切换主题
      themeAnimating: false,
      pressedKey: '',
      bgmEnabled: getApp().globalData.bgm.isEnabled()
    })
    // 复位落地后立刻恢复过渡能力（此后无 clip-path 变化，不会触发动画）
    wx.nextTick(() => this.setData({ clipNoTransition: false }))
    // 同步底部导航栏选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected(2)
      this.getTabBar().syncTheme(darkMode)
    }

    // 注册隐私授权弹窗处理器（tab 页每次显示都要重新注册，确保当前页面的 handler 生效）
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization(resolve => {
        this.setData({ showPrivacy: true })
        this._privacyResolve = resolve
      })
    }
  },

  /**
   * 检查登录状态
   * 有 token = 已登录 → 拉取用户统计
   * 无 token = 游客 → 显示登录按钮
   */
  checkLogin() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.setData({ isLogin: true })
      this.loadUserInfo()
    } else {
      this.setData({ isLogin: false, userInfo: null })
    }
  },

  /**
   * ① 点击登录 → 先弹「登录即同意协议」确认框
   * 用户可先在弹窗里点《用户协议》《隐私政策》跳转阅读，
   * 从协议页返回后弹窗仍保持展开，可继续登录
   */
  onLoginTap() {
    if (this.data.logging) return  // 防止重复点击
    this.setData({ loginConsentVisible: true })
  },

  /**
   * 关闭登录协议确认弹窗（取消登录）
   */
  onCloseLoginConsent() {
    this.setData({ loginConsentVisible: false })
  },

  /**
   * 弹窗内跳转协议页（用户协议 / 隐私政策）
   * 注意：不关闭弹窗 —— 从协议页返回后用户可直接点「同意并登录」继续
   */
  onLoginConsentAgreement(e) {
    const type = e.currentTarget.dataset.type
    wx.navigateTo({ url: '/pages/agreement/agreement?type=' + type })
  },

  /**
   * ② 同意协议并登录
   */
  onAgreeAndLogin() {
    this.setData({ loginConsentVisible: false })
    this.doWxLogin()
  },

  /**
   * ③ 执行微信登录（整个登录流程的核心）
   * wx.login() 拿 code → 发给后端换 token → 存本地缓存
   */
  doWxLogin() {
    if (this.data.logging) return  // 防止重复点击
    this.setData({ logging: true })

    // 第一步：调用 wx.login() 拿到临时登录凭证 code
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          wx.showToast({ title: '获取凭证失败', icon: 'none' })
          this.setData({ logging: false })
          return
        }

        // 第二步：把 code 发给后端，换取 token
        api.wxLogin(loginRes.code).then(data => {
          // 登录成功！把 token 存到本地缓存
          wx.setStorageSync('token', data.token)
          // 登录后清空游客答题计数（已迁移到云端账号）
          try { wx.removeStorageSync('guestAnswerCount') } catch (e) {}

          this.setData({
            isLogin: true,
            logging: false,
            dashboard: null
          })

          // 拉取用户统计信息
          this.loadUserInfo()

          wx.showToast({
            title: data.isNew ? '欢迎加入！' : '登录成功',
            icon: 'success'
          })
        }).catch(() => {
          this.setData({ logging: false })
        })
      },
      fail: () => {
        wx.showToast({ title: '微信登录失败', icon: 'none' })
        this.setData({ logging: false })
      }
    })
  },

  /**
   * ② 获取用户做题统计
   * 调用接口：GET /api/user/info（需登录）
   *
   * 注意：任何错误（含 401）都不清除 isLogin。
   *       因为「登录成功」后立即调用本方法，若此时因后端延迟返回 401，
   *       之前会把 isLogin 改回 false，导致「退出登录」按钮一闪而过。
   *       现在 401 时仅清空 dashboard，保留 isLogin，让 logout-btn 继续可见，
   *       用户可主动退出；token 已被 api.js 清除，下次进入页面 checkLogin 会自动切回游客。
   */
  loadUserInfo() {
    api.getUserInfo().then(data => {
      // 计算仪表盘所有衍生指标
      const dashboard = computeDashboard(data)
      this.setData({ userInfo: data, dashboard })
      // 连续打卡服务端兜底：本地 dailyStats 可能缺历史记录（换设备/清缓存/埋点上线前），
      // 导致 calcStreak 偏小。与 report.js 同策略：本地优先，服务端 streak_current 取较大值
      api.getReportSummary().then(s => {
        if (!s) return
        const srvStreak = Number(s.streak_current != null ? s.streak_current : s.streak) || 0
        const cur = this.data.dashboard
        if (srvStreak > 0 && cur && srvStreak > (cur.streak || 0)) {
          this.setData({ 'dashboard.streak': srvStreak })
        }
      }).catch(() => {
        // 服务端概要失败时维持本地计算结果
      })
    }).catch(() => {
      // 不清除 isLogin；仅清空仪表盘数据，避免显示陈旧统计
      // api.js 已在 401 时清除 token 并弹出「登录已失效」提示
      if (this.data.dashboard) {
        this.setData({ dashboard: null })
      }
    })
  },

  /**
   * ③ 获取应用配置（备案信息等）
   * 公开接口，无需登录
   */
  loadConfig() {
    api.getConfigInfo().then(data => {
      this.setData({ configInfo: data })
    }).catch(() => {
      // 备案信息加载失败不影响主流程
    })
  },

  /**
   * ④ 退出登录
   */
  onLogoutTap() {
    // 按压反馈（深色层副本由 pressedKey 驱动）
    this._flashPressed('logout')
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token')
          this.setData({
            isLogin: false,
            userInfo: null,
            dashboard: null
          })
          wx.showToast({ title: '已退出登录', icon: 'none' })
        }
      }
    })
  },

  /**
   * ⑤ 点击菜单项
   * 错题本、收藏列表需要登录才能访问
   */
  onMenuTap(e) {
    const type = e.currentTarget.dataset.type

    // 需要登录的功能：游客点击时引导登录
    if (!this.data.isLogin) {
      wx.showModal({
        title: '需要登录',
        content: '此功能需要登录后使用，是否现在登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.onLoginTap()
          }
        }
      })
      return
    }

    // 已登录，根据类型跳转
    if (type === 'wrong') {
      wx.navigateTo({ url: '/pages/wrong/wrong' })
    } else if (type === 'favorite') {
      wx.navigateTo({ url: '/pages/favorite/favorite' })
    } else if (type === 'custom-list') {
      wx.navigateTo({ url: '/pages/custom-list/custom-list' })
    } else if (type === 'upload') {
      wx.navigateTo({ url: '/pages/upload/upload' })
    }
  },

  /**
   * ⑤ 跳转关于页面
   */
  onAboutTap() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  /**
   * ⑥ 跳转设置页面
   */
  onSettingsTap() {
    // 按压反馈（深色层副本由 pressedKey 驱动）
    this._flashPressed('settings')
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  /**
   * ⑦ 跳转学习报告页
   */
  onReportTap() {
    this._flashPressed('report')
    wx.navigateTo({ url: '/pages/report/report' })
  },

  /**
   * 按压反馈：点亮后延时释放，让「缩小 → 回弹」完整可见
   * （深色层 pointer-events:none，hover-class 无法在其上触发，故由 JS 同步）
   */
  _flashPressed(key) {
    this.setData({ pressedKey: key })
    setTimeout(() => {
      this.setData({ pressedKey: '' })
    }, 250)
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
   * 强制渲染层提交当前 clip-path 起点，再回调开启扩散动画
   * （与首页同一实现：确认起点已落地后再下发终点，避免圆心从屏幕中心飘过来）
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
        .select('.dark-layer')
        .boundingClientRect()
        .exec(() => setTimeout(fire, 16))
    } catch (e) {
      setTimeout(fire, 16)
    }
    // 兜底：极端情况下查询回调没回来，也要保证动画一定开始
    setTimeout(fire, 120)
  },

  /**
   * 切换深色模式 — 从触摸点圆形扩散（照抄首页实现，避免闪屏）
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

    // 立即同步 tab bar 深色模式
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncTheme(goingDark)
    }

    // 立即同步所有其他 tab 页的主题（避免切换时闪屏）
    getApp().syncThemeToAllPages(goingDark, this.route)

    if (goingDark) {
      // 浅 → 深：深色层从触摸点扩散
      // ① 先无过渡把圆心钉到触摸点（半径 0，视觉上仍是浅色，无闪跳）
      applyNavBar(true)
      this.setData({
        clipNoTransition: true,
        darkMode: true,
        darkClipPath: `circle(0px at ${x}px ${y}px)`
      })
      // ② 起点提交后再开过渡扩散，圆心就是触摸点
      this._commitClipStart(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(${maxRadius}px at ${x}px ${y}px)`
        })
        setTimeout(() => {
          // 收尾切回稳定态：扩散半径只覆盖一屏，而深色层高度=整页内容高度，
          // 不切回就会在往下滚动时露出浅色层。circle(3000px at 50% 50%) 与 onShow
          // 的稳定态完全一致，且形状仍是 circle（不做形状插值），用无过渡瞬间切换。
          this.setData({
            clipNoTransition: true,
            darkClipPath: 'circle(3000px at 50% 50%)'
          })
          // 解除 no-transition、恢复毛玻璃、解锁动画，统一放到下一帧：
          // 避免「clip-path 跳变」与「backdrop-filter 重新光栅化」挤在同一帧，
          // 中低端 Android 上会因整层重绘而闪一帧。
          wx.nextTick(() => {
            this.setData({ clipNoTransition: false, themeAnimating: false })
          })
          wx.setStorageSync('darkMode', true)
        }, 580)
      })
    } else {
      // 深 → 浅：深色层收缩到触摸点
      // ① 同样先无过渡钉圆心：直接过渡会从上一个稳定态的圆心插值，收缩圆心会偏
      applyNavBar(false)
      this.setData({
        clipNoTransition: true,
        darkMode: false,
        darkClipPath: `circle(${maxRadius}px at ${x}px ${y}px)`
      })
      // ② 起点提交后再开过渡收缩到触摸点
      this._commitClipStart(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(0px at ${x}px ${y}px)`
        })
        setTimeout(() => {
          this.setData({ themeAnimating: false })
          wx.setStorageSync('darkMode', false)
        }, 580)
      })
    }
  },

  /* -------------------- 头像 & 昵称编辑 -------------------- */

  /**
   * 点击头像 → 弹出头像选择面板
   */
  onAvatarTap() {
    if (!this.data.isLogin) return
    this.setData({ showAvatarSheet: true })
  },

  /**
   * 关闭头像选择面板
   */
  closeAvatarSheet() {
    this.setData({ showAvatarSheet: false })
  },

  /**
   * 点击等级徽章 — 打开升级路线弹窗
   */
  onLevelTap() {
    if (!this.data.dashboard) return
    this.setData({ levelModalVisible: true })
  },

  /**
   * 关闭升级路线弹窗
   */
  closeLevelModal() {
    this.setData({ levelModalVisible: false })
  },

  /**
   * 微信头像选择（button open-type="chooseAvatar" 触发）
   */
  onChooseAvatar(e) {
    const filePath = e.detail.avatarUrl
    if (!filePath) return
    this.setData({ showAvatarSheet: false })
    this.doUploadAvatar(filePath)
  },

  /**
   * 从相册选择
   */
  chooseFromAlbum() {
    this.setData({ showAvatarSheet: false })
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        this.doUploadAvatar(filePath)
      }
    })
  },

  /**
   * 拍照上传
   */
  chooseFromCamera() {
    this.setData({ showAvatarSheet: false })
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        this.doUploadAvatar(filePath)
      }
    })
  },

  /**
   * 上传头像到服务器（内部方法）
   */
  doUploadAvatar(filePath) {
    wx.showLoading({ title: '上传中...' })
    api.uploadAvatar(filePath).then(data => {
      wx.hideLoading()
      // 用新对象触发渲染，避免引用未变导致视图不更新
      const avatarUrl = data.avatarUrl || data.avatar
      // Object.assign 保留统计等其他字段，避免 userInfo 为 null 时丢失全部数据
      const userInfo = Object.assign({}, this.data.userInfo || {}, { avatar: avatarUrl })
      this.setData({ userInfo })
      wx.showToast({ title: '头像更新成功', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '头像上传失败', icon: 'none' })
    })
  },

  /**
   * 点击昵称 → 打开编辑弹窗
   */
  onNicknameTap() {
    if (!this.data.isLogin) return
    // userInfo 可能尚未加载完成，此时不应进入编辑（避免保存时丢失统计字段）
    if (!this.data.userInfo) {
      wx.showToast({ title: '资料加载中，请稍后', icon: 'none' })
      return
    }
    this.setData({
      showNicknameModal: true,
      tempNickName: (this.data.userInfo && this.data.userInfo.nickNo) || ''
    })
  },

  /**
   * 昵称输入（input type="nickname" 快捷填充）
   */
  onNicknameInput(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  /**
   * 昵称输入失焦（捕获 type="nickname" 快捷填充的最终值）
   */
  onNicknameBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNickName: e.detail.value })
    }
  },

  /**
   * 保存昵称
   */
  saveNickname() {
    const nickName = (this.data.tempNickName || '').trim()
    if (!nickName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    if (nickName.length > 8) {
      wx.showToast({ title: '昵称最多8个字', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    api.updateProfile(nickName).then(data => {
      wx.hideLoading()
      // 用 Object.assign 在原 userInfo 基础上更新昵称，保留头像、统计等其他字段
      const userInfo = Object.assign({}, this.data.userInfo || {}, { nickNo: nickName })
      this.setData({ userInfo, showNicknameModal: false })
      wx.showToast({ title: '昵称修改成功', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '昵称修改失败', icon: 'none' })
    })
  },

  /**
   * 关闭昵称编辑弹窗
   */
  closeNicknameModal() {
    this.setData({ showNicknameModal: false })
  },

  /* -------------------- 工具方法 -------------------- */

  /**
   * 空操作 — 用于 catchtap 阻止事件冒泡
   */
  noop() {},

  /* -------------------- 隐私授权 -------------------- */

  /**
   * 同意隐私协议（button open-type="agreePrivacyAuthorization" 触发）
   */
  handleAgreePrivacy() {
    this._privacyResolve && this._privacyResolve({ buttonId: 'agree-btn', event: 'agree' })
    this.setData({ showPrivacy: false })
  },

  /**
   * 拒绝隐私协议
   */
  handleDisagreePrivacy() {
    this._privacyResolve && this._privacyResolve({ event: 'disagree' })
    this.setData({ showPrivacy: false })
  },

  /**
   * 打开隐私协议全文
   */
  onOpenPrivacyContract() {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract()
    } else {
      wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
    }
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
      title: '一句刷 — 海量题库，随时随地刷起来',
      path: '/pages/home/home',    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '一句刷 — 海量题库，随时随地刷起来',
      query: '',    }
  }
})
