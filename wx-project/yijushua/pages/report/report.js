/**
 * 学习报告页
 * --------------------------------------------------
 * 数据来源：
 *   1. dailyStats (本地) — { 'YYYY-MM-DD': 当日题数 } → 热力图、连续打卡、最长连续
 *   2. reportStats (本地) — { subjects: { 科目名: { total, correct } },
 *                              hours: { 0..23: count } } → 科目正确率、最佳时段
 *
 * 设计语言：延续「我的」页涧石蓝 + 月白，独立的数据展示型布局
 */

const api = require('../../utils/api.js')
const dailyStats = require('../../utils/daily-stats.js')
const reminder = require('../../utils/reminder.js')

// 模块加载时读一次主题：保证首帧渲染就是当前主题，避免深色模式切页闪白
const _darkMode = wx.getStorageSync('darkMode') === true

function applyNavBar(dark) {
  // 日间沿用品牌涧石蓝导航栏（与 Hero 头部同色），夜间转深色。
  // 颜色在这里按主题动态设置，而不是写死在 report.json 里 ——
  // 页面配置里的静态值会在"窗口创建时"就被原生层画上去，
  // 深色模式下切页会先闪一下蓝/白，且无法跟随主题。
  wx.setNavigationBarColor({
    frontColor: dark ? '#ffffff' : '#ffffff',
    backgroundColor: dark ? '#1a1a1a' : '#3D6B7E'
  })
  // 同步原生窗口背景色：否则切页时原生层先按 app.json 的浅色画一帧
  var bg = dark ? '#1a1a1a' : '#f5f6f8'
  wx.setBackgroundColor({
    backgroundColor: bg,
    backgroundColorTop: bg,
    backgroundColorBottom: bg
  })
}

// 生成本地日期键（与 mine.js 一致，避免 toISOString 时区跨日）
function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

/**
 * 计算连续打卡天数（从今日往回数；今日未做题则从昨日开始）
 */
function calcStreak(history) {
  const now = new Date()
  let streak = 0
  for (let i = 0; i < 366; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const v = history[dateKey(d)] || 0
    if (v > 0) {
      streak++
    } else if (i === 0) {
      // 今日空白：跳过让昨日 streak 继续（与 mine 页一致）
      continue
    } else {
      break
    }
  }
  return streak
}

/**
 * 计算历史最长连续打卡
 */
function calcLongestStreak(history) {
  const keys = Object.keys(history).filter(k => (history[k] || 0) > 0).sort()
  if (keys.length === 0) return 0
  let longest = 1
  let cur = 1
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1])
    const now = new Date(keys[i])
    const diff = Math.round((now - prev) / 86400000)
    if (diff === 1) {
      cur++
      if (cur > longest) longest = cur
    } else {
      cur = 1
    }
  }
  return longest
}

/**
 * 构建热力图数据
 * @param {object} history  dailyStats 历史
 * @param {number} days     7 或 30
 * @returns {object} { grid, monthLabels, max, total, days }
 *
 * 布局规则：
 *   - 7 日：单行 7 格（最近 7 天横向排列，简洁直观）
 *   - 30 日：GitHub 经典列式（每周一列，周日→周六纵向 7 格）
 */
function buildHeatmap(history, days) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let max = 0
  let total = 0

  if (days === 7) {
    // ----- 7 日：横向单行 -----
    const cells = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = dateKey(d)
      const count = history[key] || 0
      if (count > max) max = count
      total += count
      cells.push({
        key,
        day: d.getDay(),
        month: d.getMonth() + 1,
        date: d.getDate(),
        isFuture: false,
        isToday: i === 0,
        inRange: true,
        count
      })
    }
    cells.forEach(c => { c.level = levelForCount(c.count, max) })
    // 单列（一周内），但渲染时用横向布局
    return { grid: [cells], monthLabels: [], max, total, days, layout: 'row' }
  }

  // ----- 30 日：GitHub 列式 -----
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - (days - 1))
  const dayOfWeek = startDate.getDay()
  const alignedStart = new Date(startDate)
  alignedStart.setDate(alignedStart.getDate() - dayOfWeek)

  const cells = []
  const cursor = new Date(alignedStart)
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()))

  while (cursor <= endDate) {
    const key = dateKey(cursor)
    const count = history[key] || 0
    const inRange = cursor >= startDate && cursor <= today
    // 统计口径只覆盖"近 N 天"范围内的日期：周一/周末对齐产生的前后填充日
    // 不计入 total / max，否则"共答、日均"会把窗口外的题量也算进去
    if (inRange) {
      if (count > max) max = count
      total += count
    }
    cells.push({
      key,
      day: cursor.getDay(),
      month: cursor.getMonth() + 1,
      date: cursor.getDate(),
      isFuture: cursor > today,
      isToday: dateKey(cursor) === dateKey(today),
      inRange,
      count
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  const cols = Math.ceil(cells.length / 7)
  const grid = []
  for (let c = 0; c < cols; c++) {
    const col = []
    for (let r = 0; r < 7; r++) {
      const idx = c * 7 + r
      if (idx < cells.length) {
        const cell = cells[idx]
        cell.level = levelForCount(cell.count, max)
        col.push(cell)
      } else {
        col.push(null)
      }
    }
    grid.push(col)
  }

  // 按周分组（每行 = 一周 日→六），用于日历式渲染
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    week.forEach(c => { c.level = levelForCount(c.count, max) })
    weeks.push(week)
  }

  // 月份标签
  const monthLabels = []
  let lastMonth = -1
  for (let c = 0; c < grid.length; c++) {
    const first = grid[c][0] || grid[c].find(x => x)
    if (first && first.month !== lastMonth) {
      monthLabels.push({ col: c, label: first.month + '月' })
      lastMonth = first.month
    }
  }

  return { grid, weeks, monthLabels, max, total, days, layout: 'grid' }
}

// 把题数映射成 0-4 级强度（GitHub 风格）
function levelForCount(count, max) {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio < 0.25) return 1
  if (ratio < 0.50) return 2
  if (ratio < 0.75) return 3
  return 4
}

/**
 * 构建科目正确率数据
 */
function buildSubjectAccuracy(subjects) {
  if (!subjects) return { list: [], max: 0, hasData: false }
  const entries = Object.keys(subjects)
    .map(name => {
      const s = subjects[name] || {}
      const total = s.total || 0
      const correct = s.correct || 0
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
      return { name: name, total: total, correct: correct, accuracy: accuracy }
    })
    .filter(s => s.total > 0)
    // 按正确率从高到低排序（海报「科目正确率 Top 4」与页面列表共用此顺序）；
    // 正确率相同按题量降序（样本多的更可信），再按名称保证稳定
    .sort((a, b) => (b.accuracy - a.accuracy) || (b.total - a.total) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  if (entries.length === 0) return { list: [], max: 0, hasData: false }

  // 取最大的 total 作为归一化基准（用于柱条横向宽度）
  const maxTotal = Math.max.apply(null, entries.map(s => s.total))

  // 颜色分级（按正确率）：从橙红到涧石蓝到碧绿
  entries.forEach(s => {
    if (s.accuracy >= 80) s.color = '#07c160'
    else if (s.accuracy >= 60) s.color = '#3D6B7E'
    else if (s.accuracy >= 40) s.color = '#fa8c16'
    else s.color = '#ee0a24'
    s.barWidth = Math.max(8, Math.round((s.total / maxTotal) * 100))
  })

  return { list: entries.slice(0, 8), max: maxTotal, hasData: true }
}

/**
 * 构建最佳时段分布（24 小时）
 */
function buildHourDistribution(hours) {
  if (!hours) return { buckets: [], peakHour: null, peakRange: null, total: 0, hasData: false }
  const buckets = []
  let total = 0
  let peakHour = -1
  let peakCount = 0
  for (let h = 0; h < 24; h++) {
    const count = hours[h] || 0
    total += count
    buckets.push({ hour: h, count: count })
    if (count > peakCount) {
      peakCount = count
      peakHour = h
    }
  }
  if (total === 0) return { buckets: [], peakHour: null, peakRange: null, total: 0, hasData: false }

  const maxBucket = Math.max.apply(null, buckets.map(b => b.count))
  buckets.forEach(b => {
    b.height = maxBucket > 0 ? Math.max(4, Math.round((b.count / maxBucket) * 100)) : 4
    b.isPeak = b.hour === peakHour
  })

  // 最佳时段标签（如 20:00 - 22:00）
  const peakRange = peakHour >= 0
    ? String(peakHour).padStart(2, '0') + ':00 - ' + String((peakHour + 2) % 24).padStart(2, '2') + ':00'
    : null
  // 实际正确格式化
  const peakRangeFmt = peakHour >= 0
    ? formatHourRange(peakHour)
    : null

  return { buckets, peakHour, peakRange: peakRangeFmt, total, hasData: true, maxBucket }
}

function formatHourRange(h) {
  const start = String(h).padStart(2, '0') + ':00'
  const endH = (h + 2) % 24
  const end = String(endH).padStart(2, '0') + ':00'
  return start + ' - ' + end
}

// 将 24 小时分组成 4 段统计（凌晨/上午/下午/晚上）
function summarizePeriod(buckets) {
  if (!buckets || buckets.length === 0) return []
  const ranges = [
    { name: '凌晨', icon: '🌙', start: 0, end: 6 },
    { name: '上午', icon: '☀️', start: 6, end: 12 },
    { name: '下午', icon: '🌤️', start: 12, end: 18 },
    { name: '晚上', icon: '🌃', start: 18, end: 24 }
  ]
  let total = 0
  ranges.forEach(r => {
    r.count = buckets.filter(b => b.hour >= r.start && b.hour < r.end).reduce((s, b) => s + b.count, 0)
    total += r.count
  })
  ranges.forEach(r => {
    r.pct = total > 0 ? Math.round((r.count / total) * 100) : 0
  })
  return ranges
}

/* ============================================================
 * 服务端响应适配器（已对接真实契约 2026-10-19）
 * ------------------------------------------------------------
 * 实测响应结构：
 *   subject-accuracy → { range, subjects: [{ subject_id, subject_name, total, correct, accuracy }] }
 *                       accuracy 为 0~1 浮点，前端按 correct/total 自算，忽略此字段
 *   time-distribution → { bucket, days, sections: [{ key, label, count, accuracy }], best_section }
 *                       bucket=hour 时 key 是 "0"~"23"；bucket=section 时 key 是 "morning"/"afternoon" 等
 *   summary → { user_id, streak_current, streak_longest, total_questions, total_correct, total_days, ... }
 *   heatmap → { days, end_date, cells: [{date, count, level}], legend }
 *   migrate → { merged, merged_days, merged_records, conflict_resolution, next_migrate_required }
 * ========================================================== */

// 服务端科目列表 → 本地 buildSubjectAccuracy 入参 { 科目名: { total, correct } }
// 实测：data.subjects = [{ subject_id, subject_name, total, correct, accuracy }]
function adaptServerSubjects(data) {
  const out = {}
  if (!data) return out
  const list = data.subjects || data.list || (Array.isArray(data) ? data : null)
  if (Array.isArray(list)) {
    list.forEach(item => {
      if (!item) return
      // 字段名兜底：subject_name（实测） / subjectName / name / subject
      const name = item.subject_name || item.subjectName || item.name || item.subject || '未分类'
      const total = Number(item.total != null ? item.total : item.totalCount) || 0
      const correct = Number(item.correct != null ? item.correct : item.correctCount) || 0
      const acc = out[name] || { total: 0, correct: 0 }
      acc.total += total
      acc.correct += correct
      out[name] = acc
    })
    return out
  }
  // 兜底形态：已经是 { 科目名: { total, correct } }
  if (typeof data === 'object') {
    Object.keys(data).forEach(name => {
      const v = data[name] || {}
      if (v && typeof v === 'object' && (v.total != null || v.correct != null)) {
        out[name] = {
          total: Number(v.total != null ? v.total : v.totalCount) || 0,
          correct: Number(v.correct != null ? v.correct : v.correctCount) || 0
        }
      }
    })
  }
  return out
}

// 服务端 sections 列表 → 本地 buildHourDistribution 入参 { 0..23: count }
// 实测：data.sections = [{ key: "0"|"1"|..., label, count, accuracy }]
function adaptServerHours(data) {
  const out = {}
  if (!data) return out
  // 优先取 sections（实测真实结构）
  const list = data.sections || data.buckets || (Array.isArray(data) ? data : null)
  if (Array.isArray(list)) {
    list.forEach(item => {
      if (!item) return
      // key 实测是字符串 "0"~"23"
      const h = parseInt(item.key != null ? item.key : (item.hour != null ? item.hour : item.h), 10)
      if (h >= 0 && h < 24) out[h] = Number(item.count) || 0
    })
    return out
  }
  // 兜底：对象形态 { "19": 12 }
  if (typeof data === 'object') {
    Object.keys(data).forEach(k => {
      const h = parseInt(k, 10)
      if (h >= 0 && h < 24) {
        const v = data[k]
        out[h] = Number(typeof v === 'number' ? v : (v && v.count)) || 0
      }
    })
  }
  return out
}

// 提取服务端 best_section，返回 label（如 "下午 12–18"），无则 null
// 实测：data.best_section = { key: "afternoon", label: "下午 12–18" }
function adaptServerBestSection(data) {
  if (!data || !data.best_section) return null
  const bs = data.best_section
  return bs.label || (typeof bs === 'string' ? bs : null)
}

// 计算当前查询区间（最近 N 天，本地与服务端保持一致）
function buildQueryRange(days) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { startDate: dateKey(start), endDate: dateKey(end) }
}

Page({
  data: {
    range: 7,                  // 7 或 30
    heatmap: null,             // 热力图数据
    streak: 0,                 // 当前连续
    longestStreak: 0,          // 最长连续
    totalAnswers: 0,           // 区间内总题数
    grandTotal: 0,             // 历史总题数
    avgPerDay: 0,              // 区间日均
    subjects: null,            // 科目正确率列表
    hours: null,               // 24h 分布
    periods: [],               // 4 段时段统计
    peakRange: null,           // 最佳时段标签
    hasHeatmap: false,
    hasSubjectData: false,
    hasHourData: false,
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    loading: true,
    // 每日刷题提醒（订阅消息）
    remindEnabled: false,      // 本机是否已开启提醒
    remindTimeValue: '20:00',  // 用户设置的提醒时间（默认 20:00）
    todayDone: false,          // 今日是否已打卡
    // 海报
    showPoster: false,
    posterLoading: false,
    posterReady: false,
    posterImagePath: '',       // 预导出的 PNG 临时图（就绪后覆盖 canvas 显示，规避 canvas 图层错位 bug）
    posterExportFailed: false, // 导出失败标记：失败时撤掉 loading 直接展示 canvas 实况
    // 区间切换 tab
    ranges: [
      { value: 7,  label: '近 7 天' },
      { value: 30, label: '近 30 天' }
    ]
  },

  onLoad() {
    // 尽早设置导航栏 / 原生背景色，缩短深色模式切页时的白闪窗口
    applyNavBar(_darkMode)
    this.setData({ darkMode: _darkMode })
    // 注意：不在 onLoad 调用 refreshReminderState()，因为 onShow 紧接着会调一次，
    // 重复发起异步 syncFromServer 会放大"晚到响应覆盖用户操作"的竞态窗口。
    this.loadAll()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({ darkMode, fontScale })
    this.refreshReminderState()
    this.loadAll()
  },

  /**
   * 刷新「每日刷题提醒」状态
   * 策略：先用本地 storage 即时渲染（避免页面闪烁），再异步拉服务端权威值覆盖。
   * 今日是否打卡取自 dailyStats（loadAll 合并服务端快照后会再刷新一次）
   *
   * 竞态修复：发起同步前记录 _syncIssuedAt；用户手动操作开关/时间时会写入
   * _lastUserOpAt。若同步回调返回时 _lastUserOpAt 晚于本次发起时间，说明用户在
   * 同步期间手动改过开关，此时丢弃服务端返回的 enabled/timeValue，避免把刚关闭
   * 的开关又拨回"已开启"（这是"点击关闭瞬间又自动开启"的根因）。
   */
  refreshReminderState() {
    const renderLocal = () => {
      const state = reminder.getState()
      const history = wx.getStorageSync('dailyStats') || {}
      this.setData({
        remindEnabled: state.enabled,
        remindTimeValue: state.timeValue,
        todayDone: (history[dailyStats.dateKey(new Date())] || 0) > 0
      })
    }
    // 1) 本地优先：立刻渲染，避免页面等待接口
    renderLocal()
    // 2) 异步从服务端拉一次权威状态（开关 / 提醒时间 / 累计授权数），
    //    用服务端值覆盖本地展示并写回 storage 保持两端一致。
    //    未登录或后端不可用时静默回退本地值（reminder.syncFromServer 内部已处理）
    const issuedAt = Date.now()
    this._syncIssuedAt = issuedAt
    reminder.syncFromServer((state) => {
      // 仅当当前仍在 report 页时刷新；防止异步返回后页面已被销毁
      if (this._syncIssuedAt !== issuedAt) return
      if (!this.route) return
      // 同步期间用户手动改过开关/时间 → 丢弃服务端对开关字段的覆盖
      const userTouched = this._lastUserOpAt && this._lastUserOpAt > issuedAt
      const history = wx.getStorageSync('dailyStats') || {}
      this.setData({
        remindEnabled: userTouched ? this.data.remindEnabled : state.enabled,
        remindTimeValue: userTouched ? this.data.remindTimeValue : state.timeValue,
        todayDone: (history[dailyStats.dateKey(new Date())] || 0) > 0
      })
    })
  },

  /**
   * 每日刷题提醒开关
   * 注意：wx.requestSubscribeMessage 必须在用户点击事件里调用，
   * switch 的 change 事件属于用户手势，可以直接触发。
   */
  onRemindSwitch(e) {
    const next = !!e.detail.value
    // 记录用户手动操作时间，使进行中的 syncFromServer 丢弃对开关的覆盖（竞态修复）
    this._lastUserOpAt = Date.now()
    if (!next) {
      reminder.disable()
      this.setData({ remindEnabled: false })
      wx.showToast({ title: '已关闭每日提醒', icon: 'none' })
      return
    }
    // 先顺着用户操作保持开启态，授权失败时再回弹（见 _doRemindAuth 的 catch）
    this.setData({ remindEnabled: true })
    this._doRemindAuth(false)
  },

  /**
   * 修改每日提醒时间（默认 20:00，用户可自行调整）
   */
  onRemindTimeChange(e) {
    const parts = (e.detail.value || '').split(':')
    const time = reminder.setTime(parseInt(parts[0], 10), parseInt(parts[1], 10))
    this._lastUserOpAt = Date.now()
    this.setData({ remindTimeValue: time.value })
    wx.showToast({ title: '提醒时间已更新', icon: 'none' })
  },

  /**
   * 补充授权：一次性订阅每授权一次只能下发一条，用户可多次授权累积
   */
  onRemindAuthAgain() {
    this._doRemindAuth(true)
  },

  _doRemindAuth(isReauth) {
    // 记录本次发起授权的时间，用于在异步回调里判断用户是否在等待授权期间
    // 又手动操作过开关（修复"点开启后迅速点关闭，授权回调又把开关拨回 true"的竞态）。
    const authStartedAt = this._lastUserOpAt || Date.now()
    reminder.requestAuth()
      .then(() => {
        // 用户在等待微信授权弹窗期间可能已经手动关闭了开关，
        // 此时不应再把开关强制设为 true，保留用户的最新操作。
        if (this._lastUserOpAt && this._lastUserOpAt > authStartedAt) {
          return
        }
        this.setData({ remindEnabled: true })
        wx.showToast({ title: isReauth ? '已补充授权' : '提醒已开启', icon: 'success' })
      })
      .catch(err => {
        // 同样的守卫：用户在等待期间手动改过开关时，按用户最新操作为准，
        // 不再读 storage 覆盖（避免把刚关闭的开关又拨回去）。
        if (this._lastUserOpAt && this._lastUserOpAt > authStartedAt) {
          return
        }
        const state = reminder.getState()
        this.setData({ remindEnabled: state.enabled })
        const code = err && err.code
        if (code === 'MAIN_SWITCH_OFF') {
          wx.showModal({
            title: '需要开启订阅消息',
            content: '你已关闭本小程序的订阅消息通知，请到「小程序设置 - 订阅消息」中开启后再试',
            showCancel: false,
            confirmText: '我知道了'
          })
        } else if (code === 'REJECTED') {
          wx.showToast({ title: '已取消授权', icon: 'none' })
        } else {
          // NO_TEMPLATE（未配置模板）/ FAIL（调用微信失败）等其它情况
          // 对用户统一表现为「服务暂未开通」，避免暴露后台配置细节
          wx.showToast({ title: '服务暂未开通', icon: 'none' })
        }
      })
  },

  /**
   * 切换 7 / 30 天视图
   */
  onRangeTap(e) {
    const v = parseInt(e.currentTarget.dataset.value, 10)
    if (v === this.data.range) return
    this.setData({ range: v })
    this.loadAll()
  },

  /**
   * 加载所有报告数据
   * 策略：服务端聚合优先，本地 storage 兜底
   *   1) 先调 getUserInfo 同步今日快照（保留原有 dailyStats 合并逻辑）
   *   2) 并行拉取 服务端 科目正确率 + 时段分布 + 概要
   *   3) 任一服务端接口失败 → 该维度回退本地 reportStats
   *   4) 首次进入且本地存在 reportStats → 触发一次性幂等迁移到云端
   */
  loadAll() {
    // 同步刷新 dailyStats：把服务端 todayCount 快照合并进今日（防跨天陈旧值污染）
    api.getUserInfo().then(data => {
      if (data) dailyStats.mergeServerToday(data.todayCount || 0)
      this._loadServerReport()
    }).catch(() => {
      // 未登录或网络异常：仍可基于本地历史展示
      this._loadServerReport()
    })
  },

  /**
   * 拉服务端聚合数据 + 本地兜底
   * 通过 _rangeMigrating 控制幂等：本次进入页面只迁一次
   */
  _loadServerReport() {
    const range = this.data.range
    const { startDate, endDate } = buildQueryRange(range)
    const localReportStats = wx.getStorageSync('reportStats') || {}

    // 并行拉四个接口；任一失败用本地兜底
    const subjectP = api.getSubjectAccuracy(startDate, endDate)
      .then(d => ({ ok: true, data: d }))
      .catch(e => ({ ok: false, err: e }))
    const hourP = api.getTimeDistribution(range, 'hour')
      .then(d => ({ ok: true, data: d }))
      .catch(e => ({ ok: false, err: e }))
    const summaryP = api.getReportSummary()
      .then(d => ({ ok: true, data: d }))
      .catch(e => ({ ok: false, err: e }))
    // 热力图按日聚合（服务端是权威数据源：清缓存也不丢历史）
    const heatmapP = api.getReportHeatmap(range)
      .then(d => ({ ok: true, data: d }))
      .catch(e => ({ ok: false, err: e }))

    Promise.all([subjectP, hourP, summaryP, heatmapP]).then(([subRes, hourRes, sumRes, hmRes]) => {
      // 任一成功就视为登录态可用；全失败则纯本地兜底
      const anyOk = subRes.ok || hourRes.ok || sumRes.ok || hmRes.ok

      // ---- 科目正确率 ----
      // 实测响应：{ code, msg, data: { range, subjects: [...] } }
      // request() 已剥离外层 { code, msg, data }，直接拿到内层 data
      let subjectsMap
      if (subRes.ok) {
        subjectsMap = adaptServerSubjects(subRes.data)
      } else {
        subjectsMap = (localReportStats.subjects) || {}
      }
      const subjects = buildSubjectAccuracy(subjectsMap)

      // ---- 24h 分布 ----
      // 实测响应：{ code, msg, data: { bucket, days, sections: [...], best_section } }
      let hoursMap
      let serverBestSection = null
      if (hourRes.ok) {
        hoursMap = adaptServerHours(hourRes.data)
        serverBestSection = adaptServerBestSection(hourRes.data)
      } else {
        hoursMap = (localReportStats.hours) || {}
      }
      const hours = buildHourDistribution(hoursMap)
      const periods = summarizePeriod(hours.buckets)

      // ---- 热力图 + 连续打卡（服务端优先，本地兜底） ----
      // 数据源合并策略：
      //   - 服务端按日聚合是权威数据源（清缓存也不丢历史）
      //   - 本地 dailyStats 保留今日最新答题（应对刚答完题事务在途的极端情况）
      //   - 同一日期两端都有时取较大值，避免重复计数又防止丢失最新答题
      const localHistory = (wx.getStorageSync('dailyStats') || {})
      let history = Object.assign({}, localHistory)
      if (hmRes.ok && hmRes.data && Array.isArray(hmRes.data.cells)) {
        hmRes.data.cells.forEach(c => {
          if (!c || !c.date) return
          const serverCount = Number(c.count) || 0
          const localCount = Number(localHistory[c.date]) || 0
          history[c.date] = Math.max(history[c.date] || 0, serverCount, localCount)
        })
      }
      const hm = buildHeatmap(history, range)
      let streak = calcStreak(history)
      let longestStreak = calcLongestStreak(history)
      let grandTotal = Object.keys(history).reduce((s, k) => s + (history[k] || 0), 0)

      // 服务端 summary 字段（实测）：streak_current / streak_longest / total_questions / total_correct
      if (sumRes.ok && sumRes.data) {
        const s = sumRes.data
        const srvStreak = Number(s.streak_current != null ? s.streak_current : s.streak) || 0
        const srvLongest = Number(s.streak_longest != null ? s.streak_longest : s.longestStreak) || 0
        const srvTotal = Number(s.total_questions != null ? s.total_questions : (s.grandTotal != null ? s.grandTotal : s.totalCount)) || 0
        if (srvStreak > streak) streak = srvStreak
        if (srvLongest > longestStreak) longestStreak = srvLongest
        if (srvTotal > grandTotal) grandTotal = srvTotal
      }

      // 最佳时段：优先采纳服务端 best_section，缺失时用本地计算的 peakRange
      const peakRange = serverBestSection || hours.peakRange

      const avgPerDay = range > 0 ? Math.round(hm.total / range) : 0

      this.setData({
        heatmap: hm,
        streak,
        longestStreak,
        totalAnswers: hm.total,
        grandTotal,
        avgPerDay,
        subjects,
        hours,
        periods,
        peakRange,
        hasHeatmap: grandTotal > 0,
        hasSubjectData: subjects.hasData,
        hasHourData: hours.hasData,
        loading: false,
        // 调试用：标注本次渲染的数据源（便于上线后排查）
        _dataSource: anyOk ? 'server' : 'local'
      })

      // dailyStats 已在 loadAll 中合并服务端今日快照，这里只刷新"今日是否打卡"，
      // 不再发起一次完整的 syncFromServer（避免与 onShow 的同步叠加，放大竞态窗口）。
      const _history = wx.getStorageSync('dailyStats') || {}
      this.setData({
        todayDone: (_history[dailyStats.dateKey(new Date())] || 0) > 0
      })

      // 首次进入若本地仍有数据，触发一次性迁移到云端
      this._maybeMigrateLocal(localReportStats, history)
    })
  },

  /**
   * 一次性把本地累积的 reportStats / dailyStats 迁移到云端
   *   - 上次迁移时间戳记录在 storage 'reportMigratedAt'
   *   - 24h 内只尝试一次，避免频繁占用网络
   *   - 服务端幂等保证：重复迁移不会双倍计数
   */
  _maybeMigrateLocal(localReportStats, localDaily) {
    try {
      const now = Date.now()
      const last = wx.getStorageSync('reportMigratedAt') || 0
      if (now - last < 24 * 3600 * 1000) return   // 24h 内已尝试过
      // 只有本地确实有数据时才迁
      const hasReport = localReportStats && (
        (localReportStats.subjects && Object.keys(localReportStats.subjects).length > 0) ||
        (localReportStats.hours && Object.keys(localReportStats.hours).length > 0)
      )
      const hasDaily = localDaily && Object.keys(localDaily).length > 0
      if (!hasReport && !hasDaily) {
        wx.setStorageSync('reportMigratedAt', now)
        return
      }
      wx.setStorageSync('reportMigratedAt', now)
      api.migrateReportData({
        dailySnapshots: localDaily || {},
        subjectDaily: (localReportStats && localReportStats.subjects) || {},
        hours: (localReportStats && localReportStats.hours) || {},
        clientMigratedAt: now
      }).then(() => {
        // 迁移成功后清空本地冗余（保留兜底，避免误清后又需要回退）
        // 不主动清空——服务端聚合后本地仍可作为离线兜底
      }).catch(() => {
        // 迁移失败不影响展示；下次进入页面会再尝试
      })
    } catch (e) {
      // 迁移逻辑不应影响主流程
    }
  },

  /**
   * 切换深色模式（与 tab 页同步；本页非 tab，由 tab 页驱动）
   * 这里仅响应外部的主题变化（页面再次 onShow 时会重读本地存储）
   */
  onToggleTheme() {
    const next = !this.data.darkMode
    wx.setStorageSync('darkMode', next)
    this.setData({ darkMode: next })
    // 通知其他 tab 页（与全局保持一致）
    getApp().syncThemeToAllPages(next, this.route)
  },

  noop() {},

  /* ============================================================
   * 学习海报（Canvas 2D 自动生成）
   * ------------------------------------------------------------
   * 流程：
   *   1. 点击 FAB → 打开 modal → 下一帧把指标画到 Canvas 2D
   *   2. 绘制完成即预导出 PNG 临时文件（保存到相册 / 分享给好友共用，避免重复导出）
   *   3. 分享给好友：<button open-type="share"> 触发 onShareAppMessage，返回海报图片卡片
   *   4. 分享到朋友圈：微信仅支持右上角 ··· 菜单触发（onShareTimeline）
   * ============================================================ */

  onPosterTap() {
    if (this.data.posterLoading) return
    // 直接开 modal：遮罩自身已拦截触摸滚动，无需再把整页改成 position:fixed
    // （那会触发整页重排，正是点一下卡顿的来源）
    this.setData({ showPoster: true, posterLoading: true, posterReady: false, posterImagePath: '', posterExportFailed: false })
    // 等 modal 渲染出 canvas 节点后再绘制
    // 节点查询本身有重试机制兜底，这里只需让出 1~2 帧给 wx:if 完成插入
    setTimeout(() => this.drawPoster(), 30)
  },

  closePoster() {
    this.setData({ showPoster: false, posterReady: false, posterImagePath: '', posterExportFailed: false })
    // 释放海报相关缓存，下次打开重新绘制
    this._posterCanvas = null
    this._posterImagePath = null
    this._posterExporting = null
  },

  /**
   * 绘制海报到 Canvas 2D
   * 使用查询到的 CSS px 尺寸作为坐标系，乘以 dpr 写入像素缓冲
   */
  drawPoster() {
    if (!this.data.showPoster) return
    const query = wx.createSelectorQuery()
    query.select('#poster-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!this.data.showPoster) return
        const node = res && res[0] && res[0].node
        const cssW = res && res[0] && res[0].width
        const cssH = res && res[0] && res[0].height
        if (!node || !cssW || !cssH) {
          // 节点尚未就绪：重试一次，仍失败才提示
          this._posterRetry = (this._posterRetry || 0) + 1
          if (this._posterRetry <= 2) {
            setTimeout(() => this.drawPoster(), 150)
            return
          }
          this._posterRetry = 0
          this.setData({ posterLoading: false })
          wx.showToast({ title: '海报初始化失败', icon: 'none' })
          return
        }
        this._posterRetry = 0
        const canvas = node
        const ctx = canvas.getContext('2d')
        // dpr 上限 3：高清屏（pixelRatio 3）下预览与导出都保持锐利，避免海报发虚
        const dpr = Math.min((wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2, 3)
        /**
         * 缓冲区重分配（canvas.width 赋值）+ 绘制必须与合成器帧对齐：
         * 在布局未稳定时改尺寸，部分机型会把画布图层错位显示且不自愈
         * （表现为上半屏纯蓝、海报整体下移出框），所以放进 canvas 自己的 rAF 里执行
         */
        const startRender = () => {
          // 弹窗已关闭：跳过
          if (!this.data.showPoster) return
          canvas.width = Math.round(cssW * dpr)
          canvas.height = Math.round(cssH * dpr)
          ctx.scale(dpr, dpr)
          // 缓存 canvas 节点供保存使用
          this._posterCanvas = canvas
          // 等小程序头像徽标就绪再绘制（加载失败走矢量兜底），避免海报出现半成品
          this._loadPosterLogo(canvas).then(logo => {
            // 弹窗已关闭 / canvas 已换代：同样清理加载态，保证遮罩永远不会卡死
            if (!this.data.showPoster || this._posterCanvas !== canvas) {
              this.setData({ posterLoading: false })
              return
            }
            this._posterLogo = logo
            try {
              this.renderPoster(ctx, cssW, cssH)
              this.setData({ posterLoading: false, posterReady: true })
              // 预导出 PNG 临时文件：保存 / 分享共用。
              // 导出成功后用 <image> 覆盖 canvas 显示——canvasToTempFilePath 读的是
              // 像素缓冲（永远正确），即使个别机型 canvas 图层错位，用户看到的也是对的
              this.exportPoster()
                .then(path => {
                  if (this.data.showPoster) this.setData({ posterImagePath: path })
                })
                .catch(() => {
                  // 导出失败：撤掉 loading 直接展示 canvas 实况
                  if (this.data.showPoster) this.setData({ posterExportFailed: true })
                })
            } catch (e) {
              this.setData({ posterLoading: false })
              wx.showToast({ title: '海报绘制失败', icon: 'none' })
            }
          })
        }
        if (typeof canvas.requestAnimationFrame === 'function') {
          canvas.requestAnimationFrame(startRender)
        } else {
          startRender()
        }
      })
  },

  /**
   * 海报绘制（Canvas 2D）
   * ------------------------------------------------------------
   * 设计语言「蔚蓝编辑风」—— 取自小程序头像的明亮天蓝 + 白色 FQ 圆形徽标：
   *   · 三段蔚蓝渐变与顶部天光，呼应头像底色；
   *   · Hero 大数字背后的细线同心圆，复刻头像的圆形徽章构图；
   *   · 白色为信息主色，暖金只点缀连续打卡 / 最佳时段，克制不花哨；
   *   · 发丝线、玻璃面板、宽松留白，追求高级简约。
   * 坐标系：查询到的 CSS px；字号与间距按 u = w/292 等比缩放，
   * 主要区块纵向锚点取 h 的比例，适配不同屏幕与弹窗宽度。
   */
  renderPoster(ctx, w, h) {
    const u = w / 292
    const pad = Math.round(w * 0.075)
    const cx = w / 2

    // ---------- 调色板 ----------
    const C_GOLD = '#F5C26B'                      // 唯一暖色 accent
    const C_DEEP = '#2C5FA8'                      // 徽点序号 / 兜底徽标底色
    const W1 = 'rgba(255,255,255,0.94)'           // 主信息
    const W2 = 'rgba(255,255,255,0.64)'           // 次信息
    const W3 = 'rgba(255,255,255,0.44)'           // 弱信息 / 说明
    const LINE = 'rgba(255,255,255,0.16)'         // 发丝线
    const TRACK = 'rgba(255,255,255,0.13)'        // 柱条底轨
    const GLASS_FILL = 'rgba(255,255,255,0.09)'   // 玻璃面板填充
    const GLASS_LINE = 'rgba(255,255,255,0.17)'   // 玻璃面板描边
    const FONT = '"PingFang SC", -apple-system, sans-serif'
    const NUM_FONT = '"DIN Alternate", "Helvetica Neue", -apple-system, sans-serif'
    // 正确率分级色：高明度浅色系，保证蔚蓝底上的可读性与精致感
    const accuracyColor = a => a >= 80 ? '#9FE7C4' : a >= 60 ? '#FFD98D' : a >= 40 ? '#FFB877' : '#FF9D9D'

    // ---------- 0. 背景：三段蔚蓝渐变（顶浅底深，呼应小程序头像） ----------
    const bg = ctx.createLinearGradient(0, 0, w * 0.25, h)
    bg.addColorStop(0, '#8CC3EB')
    bg.addColorStop(0.55, '#4F92D6')
    bg.addColorStop(1, '#2C5FA8')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // 顶部天光：头像式的明亮散射，提亮上半部
    const glow = ctx.createRadialGradient(w * 0.84, -h * 0.05, 0, w * 0.84, -h * 0.05, w * 0.95)
    glow.addColorStop(0, 'rgba(255,255,255,0.30)')
    glow.addColorStop(0.45, 'rgba(255,255,255,0.07)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h * 0.6)

    // 底部压暗：稳住重心，避免画面发飘
    const shade = ctx.createLinearGradient(0, h * 0.55, 0, h)
    shade.addColorStop(0, 'rgba(13,44,96,0)')
    shade.addColorStop(1, 'rgba(13,44,96,0.30)')
    ctx.fillStyle = shade
    ctx.fillRect(0, h * 0.55, w, h * 0.45)

    ctx.textBaseline = 'alphabetic'

    // ---------- 1. 品牌行：小程序头像徽标 + 名称 + 期间 ----------
    const logoCy = Math.round(h * 0.059)
    const logoR = Math.round(w * 0.043)
    const logoCx = pad + logoR
    // 白色细环 + 圆形裁切头像（小程序特色识别点）
    ctx.beginPath()
    ctx.arc(logoCx, logoCy, logoR + 1.5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.save()
    ctx.beginPath()
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2)
    ctx.clip()
    let logoDrawn = false
    if (this._posterLogo) {
      try {
        ctx.drawImage(this._posterLogo, logoCx - logoR, logoCy - logoR, logoR * 2, logoR * 2)
        logoDrawn = true
      } catch (e) {
        logoDrawn = false
      }
    }
    if (!logoDrawn) {
      // 兜底：蔚蓝圆 + 白色 FQ 字标（与头像同构图）
      ctx.fillStyle = '#3E9BE0'
      ctx.fillRect(logoCx - logoR, logoCy - logoR, logoR * 2, logoR * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold ' + Math.round(logoR * 1.1) + 'px ' + FONT
      ctx.textAlign = 'center'
      ctx.fillText('FQ', logoCx, logoCy + logoR * 0.38)
    }
    ctx.restore()

    const brandX = logoCx + logoR + 9
    ctx.textAlign = 'left'
    ctx.fillStyle = W1
    ctx.font = 'bold ' + Math.round(12.5 * u) + 'px ' + FONT
    ctx.fillText('一句刷', brandX, logoCy + 1)
    ctx.fillStyle = W3
    ctx.font = Math.round(8.5 * u) + 'px ' + FONT
    this._fillTracked(ctx, 'STUDY REPORT', brandX, logoCy + 13, 1.6)

    // 右上：期间药丸（暖金描边，与 Hero 数字同色系）
    ctx.font = Math.round(9 * u) + 'px ' + FONT
    const pillText = '近 ' + (this.data.range || 7) + ' 天'
    const pillTW = ctx.measureText(pillText).width
    const pillH = Math.round(17 * u)
    const pillW = pillTW + Math.round(14 * u)
    const pillX = w - pad - pillW
    const pillY = logoCy - pillH / 2
    this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fillStyle = 'rgba(245,194,107,0.16)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(245,194,107,0.85)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = C_GOLD
    ctx.textAlign = 'center'
    ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH * 0.68)
    ctx.textAlign = 'left'

    // ---------- 2. Hero：连续打卡大数字 ----------
    const heroCy = Math.round(h * 0.2545)
    // 细线同心圆：复刻小程序头像的圆形徽章构图（海报的签名式元素）
    ctx.strokeStyle = 'rgba(255,255,255,0.11)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, heroCy, w * 0.26, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.055)'
    ctx.beginPath(); ctx.arc(cx, heroCy, w * 0.335, 0, Math.PI * 2); ctx.stroke()

    // 小型标签（字距拉开，编辑感）
    ctx.fillStyle = W2
    ctx.font = Math.round(9 * u) + 'px ' + FONT
    this._fillTrackedCenter(ctx, '连续打卡 · DAYS STREAK', cx, heroCy - Math.round(46 * u), Math.round(2 * u))

    // 大数字 + 单位
    const streakNum = String(this.data.streak || 0)
    const bigSize = Math.round(80 * u)
    const numBase = heroCy + Math.round(30 * u)
    ctx.fillStyle = C_GOLD
    ctx.font = 'bold ' + bigSize + 'px ' + NUM_FONT
    const numW = ctx.measureText(streakNum).width
    ctx.textAlign = 'left'
    ctx.fillText(streakNum, cx - numW / 2, numBase)
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    ctx.font = Math.round(18 * u) + 'px ' + FONT
    ctx.fillText('天', cx + numW / 2 + 5, numBase - Math.round(bigSize * 0.12))

    // ---------- 3. KPI 三栏（玻璃面板） ----------
    const kpiY = Math.round(h * 0.359)
    const kpiH = Math.round(34 * u)
    const kpiX = Math.round(pad * 0.6)
    const kpiW = w - kpiX * 2
    this._roundRect(ctx, kpiX, kpiY, kpiW, kpiH, Math.round(10 * u))
    ctx.fillStyle = GLASS_FILL
    ctx.fill()
    ctx.strokeStyle = GLASS_LINE
    ctx.lineWidth = 1
    ctx.stroke()

    const kpis = [
      { label: '累计题数', value: String(this.data.grandTotal || 0), unit: '道' },
      { label: '最长连续', value: String(this.data.longestStreak || 0), unit: '天' },
      { label: '日均', value: String(this.data.avgPerDay || 0), unit: '题' }
    ]
    const valSize = Math.round(21 * u)
    const valBase = kpiY + Math.round(kpiH * 0.56)
    kpis.forEach((c, i) => {
      const ccx = kpiX + kpiW * (i + 0.5) / 3
      // 数值（粗体 DIN）+ 小单位，组合居中
      ctx.font = 'bold ' + valSize + 'px ' + NUM_FONT
      const valW = ctx.measureText(c.value).width
      ctx.font = Math.round(9 * u) + 'px ' + FONT
      const unitW = ctx.measureText(c.unit).width
      const startX = ccx - (valW + 3 + unitW) / 2
      ctx.textAlign = 'left'
      ctx.font = 'bold ' + valSize + 'px ' + NUM_FONT
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(c.value, startX, valBase)
      ctx.font = Math.round(9 * u) + 'px ' + FONT
      ctx.fillStyle = W2
      ctx.fillText(c.unit, startX + valW + 3, valBase)
      // 标签
      ctx.textAlign = 'center'
      ctx.fillStyle = W2
      ctx.fillText(c.label, ccx, kpiY + kpiH - Math.round(7 * u))
      // 列分隔发丝线
      if (i < 2) {
        ctx.strokeStyle = GLASS_LINE
        ctx.lineWidth = 1
        ctx.beginPath()
        const sepX = kpiX + kpiW * (i + 1) / 3
        ctx.moveTo(sepX, kpiY + Math.round(8 * u))
        ctx.lineTo(sepX, kpiY + kpiH - Math.round(8 * u))
        ctx.stroke()
      }
    })

    // ---------- 4. 科目正确率 Top 4（按正确率从高到低） ----------
    const subjY = Math.round(h * 0.482)
    ctx.textAlign = 'left'
    ctx.fillStyle = W1
    ctx.font = 'bold ' + Math.round(13.5 * u) + 'px ' + FONT
    ctx.fillText('科目正确率', pad, subjY)

    const list = (this.data.subjects && this.data.subjects.list) || []
    const top = list.slice(0, 4)
    const rowH = Math.round(30 * u)
    const dotR = Math.round(8 * u)
    // 奖牌色：金银铜 + 普通灰白
    const medalColors = ['#F5C26B', '#DCE4EE', '#D89A6E', 'rgba(255,255,255,0.42)']
    // 右上标注：科目总数超过 4 科时只画前 4 科，标「前 4 科」；
    // 4 科及以内全部展示，标「共 N 科」（N = 实际科目数）
    const topLabel = list.length > 4 ? ('前 ' + top.length + ' 科') : ('共 ' + list.length + ' 科')
    ctx.textAlign = 'right'
    ctx.fillStyle = W3
    ctx.font = Math.round(8.5 * u) + 'px ' + FONT
    ctx.fillText(topLabel, w - pad, subjY)
    ctx.textAlign = 'left'

    top.forEach((s, i) => {
      const rowY = subjY + Math.round(14 * u) + i * rowH
      // 排名徽点（前三名金银铜）
      ctx.beginPath()
      ctx.arc(pad + dotR, rowY - Math.round(4.5 * u), dotR, 0, Math.PI * 2)
      ctx.fillStyle = medalColors[i] || medalColors[3]
      ctx.fill()
      ctx.fillStyle = i < 3 ? C_DEEP : 'rgba(255,255,255,0.85)'
      ctx.font = 'bold ' + Math.round(9 * u) + 'px ' + NUM_FONT
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), pad + dotR, rowY - Math.round(1.5 * u))
      ctx.textAlign = 'left'
      // 科目名
      ctx.fillStyle = W1
      ctx.font = Math.round(11.5 * u) + 'px ' + FONT
      const name = s.name.length > 8 ? s.name.slice(0, 8) + '…' : s.name
      const nameX = pad + dotR * 2 + Math.round(9 * u)
      ctx.fillText(name, nameX, rowY)
      // 百分比（右对齐，粗体 DIN，按正确率取色）
      const pctStr = s.accuracy + '%'
      const pctColor = accuracyColor(s.accuracy)
      ctx.font = 'bold ' + Math.round(13.5 * u) + 'px ' + NUM_FONT
      ctx.fillStyle = pctColor
      ctx.textAlign = 'right'
      const pctW = ctx.measureText(pctStr).width
      ctx.fillText(pctStr, w - pad, rowY + 1)
      ctx.textAlign = 'left'
      // 柱条：发丝底轨 + 正确率填充
      const barY = rowY + Math.round(7 * u)
      const barX = nameX
      const barW = Math.max(24, (w - pad) - pctW - Math.round(10 * u) - barX)
      const barH = Math.max(2.5, Math.round(2.5 * u))
      this._roundRect(ctx, barX, barY, barW, barH, barH / 2)
      ctx.fillStyle = TRACK
      ctx.fill()
      this._roundRect(ctx, barX, barY, Math.max(barH, barW * s.accuracy / 100), barH, barH / 2)
      ctx.fillStyle = pctColor
      ctx.fill()
    })

    // ---------- 5. 最佳答题时段（金边玻璃卡） ----------
    if (this.data.peakRange) {
      // 卡片纵坐标：跟随科目区块之后；若空间不足则上移，保证不与底部品牌区重叠
      const cardY = Math.min(
        subjY + Math.round(14 * u) + top.length * rowH + Math.round(10 * u),
        h - Math.round(40 * u) - Math.round(38 * u) - Math.round(8 * u)
      )
      const cardH = Math.round(38 * u)
      const cardX = Math.round(pad * 0.6)
      const cardW = w - cardX * 2
      this._roundRect(ctx, cardX, cardY, cardW, cardH, Math.round(10 * u))
      ctx.fillStyle = GLASS_FILL
      ctx.fill()
      ctx.strokeStyle = 'rgba(245,194,107,0.42)'
      ctx.lineWidth = 1
      ctx.stroke()
      // 左：标签 + 说明
      ctx.textAlign = 'left'
      ctx.fillStyle = W1
      ctx.font = 'bold ' + Math.round(12 * u) + 'px ' + FONT
      ctx.fillText('🏆 最佳答题时段', cardX + Math.round(16 * u), cardY + Math.round(16 * u))
      ctx.fillStyle = W3
      ctx.font = Math.round(8.5 * u) + 'px ' + FONT
      ctx.fillText('效率最高', cardX + Math.round(16 * u), cardY + Math.round(29 * u))
      // 右：金色时段值
      ctx.fillStyle = C_GOLD
      ctx.font = 'bold ' + Math.round(15 * u) + 'px ' + NUM_FONT
      ctx.textAlign = 'right'
      ctx.fillText(this.data.peakRange, cardX + cardW - Math.round(16 * u), cardY + Math.round(24 * u))
      ctx.textAlign = 'left'
    }

    // ---------- 6. 底部品牌区（「一句刷」+ 日期戳） ----------
    const footLineY = h - Math.round(40 * u)
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad, footLineY)
    ctx.lineTo(w - pad, footLineY)
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.80)'
    ctx.font = 'bold ' + Math.round(10.5 * u) + 'px ' + FONT
    ctx.fillText('一句刷', cx, h - Math.round(25 * u))

    const date = new Date()
    const dateStr = date.getFullYear() + '.' +
                    String(date.getMonth() + 1).padStart(2, '0') + '.' +
                    String(date.getDate()).padStart(2, '0')
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = Math.round(8 * u) + 'px ' + FONT
    ctx.fillText('让坚持成为习惯 · ' + dateStr, cx, h - Math.round(10 * u))
  },

  /**
   * 圆角矩形辅助
   */
  _roundRect(ctx, x, y, w, h, r) {
    if (w < r * 2) r = w / 2
    if (h < r * 2) r = h / 2
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  /**
   * 加载小程序头像（海报品牌徽标）
   * 本地资源通常 <50ms 加载完成；250ms 未就绪则用矢量兜底，不阻塞海报渲染
   * 之前 600ms 超时是用户感知卡顿的主因之一：海报要等 logo 走完整个超时才会绘制完成
   * @returns {Promise<Image|null>}
   */
  _loadPosterLogo(canvas) {
    return new Promise(resolve => {
      let done = false
      const finish = img => { if (!done) { done = true; resolve(img || null) } }
      try {
        const img = canvas.createImage()
        img.onload = () => finish(img)
        img.onerror = () => finish(null)
        img.src = '/assets/app-logo.jpg'
      } catch (e) {
        finish(null)
      }
      setTimeout(() => finish(null), 250)
    })
  },

  /**
   * 测量带字距文字的总宽度
   */
  _measureTracked(ctx, text, tracking) {
    let total = 0
    for (let i = 0; i < text.length; i++) {
      total += ctx.measureText(text[i]).width + tracking
    }
    return total - tracking
  },

  /**
   * 绘制带字距的文字（以 x 为左起点，调用前需保证 textAlign 为 left）
   * @returns {number} 整段文字宽度
   */
  _fillTracked(ctx, text, x, y, tracking) {
    let cursor = x
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cursor, y)
      cursor += ctx.measureText(text[i]).width + tracking
    }
    return cursor - tracking - x
  },

  /**
   * 绘制带字距的居中文字（以 cx 为水平中心）
   */
  _fillTrackedCenter(ctx, text, cx, y, tracking) {
    this._fillTracked(ctx, text, cx - this._measureTracked(ctx, text, tracking) / 2, y, tracking)
  },

  /**
   * 取得海报临时图路径（优先复用预导出结果，避免重复导出）
   */
  getPosterImage() {
    if (this._posterImagePath) return Promise.resolve(this._posterImagePath)
    return this.exportPoster()
  },

  /**
   * 导出海报 PNG 到临时文件（保存到相册 / 分享给好友共用）
   * @returns {Promise<string>} 临时文件路径
   */
  exportPoster() {
    const canvas = this._posterCanvas
    if (!canvas) return Promise.reject(new Error('canvas not ready'))
    // 已在导出中：复用同一次导出
    if (this._posterExporting) return this._posterExporting
    const task = this._doExport(canvas).catch(() => {
      // 个别机型在首帧 / 动画期间导出会失败，稍作延迟重试一次
      return new Promise((resolve, reject) => {
        setTimeout(() => this._doExport(canvas).then(resolve, reject), 300)
      })
    })
    this._posterExporting = task
    const done = () => { this._posterExporting = null }
    task.then(done, done)
    return task
  },

  _doExport(canvas) {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: canvas,
        fileType: 'png',
        // 显式指定导出尺寸（物理像素）：规避部分机型不传参时导出空图 / 尺寸异常
        destWidth: canvas.width,
        destHeight: canvas.height,
        success: (res) => {
          // 弹窗已关闭则不缓存，避免把过期临时图用于分享
          if (this.data.showPoster) this._posterImagePath = res.tempFilePath
          resolve(res.tempFilePath)
        },
        fail: (err) => reject(err || new Error('canvasToTempFilePath fail'))
      })
    })
  },

  /**
   * 保存海报到手机相册
   */
  savePoster() {
    console.log('[savePoster] clicked, posterReady=', this.data.posterReady, 'hasCanvas=', !!this._posterCanvas, 'hasPrivacyHandler=', !!wx.onNeedPrivacyAuthorization)
    if (!this.data.posterReady || !this._posterCanvas) {
      wx.showToast({ title: '海报尚未就绪', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...', mask: true })
    this.getPosterImage()
      .then(filePath => {
        console.log('[savePoster] poster exported, filePath=', filePath)
        this.saveImageWithAuth(filePath)
      })
      .catch((e) => {
        console.error('[savePoster] export failed', e)
        wx.hideLoading()
        const em = (e && e.errMsg) || (e && e.message) || String(e)
        wx.showModal({
          title: '导出海报失败',
          content: em,
          showCancel: false,
          confirmText: '我知道了'
        })
      })
  },

  /**
   * 保存到相册（含相册权限引导）
   */
  saveImageWithAuth(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        wx.hideLoading()
        wx.showModal({
          title: '已保存到相册',
          content: '快去朋友圈晒一晒你的学习成果吧~',
          confirmText: '我知道了',
          showCancel: false
        })
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        console.error('[savePoster] saveImageToPhotosAlbum FAIL', err)
        if (msg.indexOf('cancel') !== -1) {
          // 用户主动取消，不打扰
          wx.hideLoading()
          return
        }
        // 面向用户只提示保存失败；具体原因（如隐私 scope 审核中）打在 console 供开发排查
        wx.hideLoading()
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    })
  },

  /**
   * 分享给好友 / 群（modal 内「分享给好友」按钮 or 右上角 ··· 转发均走这里）
   * 海报已生成时直接分享海报图片卡片，否则分享小程序链接
   */
  onShareAppMessage() {
    const streak = this.data.streak || 0
    const total = this.data.grandTotal || 0
    let title = '我的学习报告 — 一句刷'
    if (streak > 0 && total > 0) {
      title = '我已连续打卡 ' + streak + ' 天，累计 ' + total + ' 题，快来看看你的学习报告'
    } else if (total > 0) {
      title = '我在「一句刷」已刷 ' + total + ' 题，一起加入吧'
    }
    const share = {
      title: title,
      path: '/pages/home/home?from=report'
    }
    // 海报弹窗打开中且临时图已就绪：分享海报图片（好友/群直接看到海报）
    if (this.data.showPoster && this._posterImagePath) {
      share.imageUrl = this._posterImagePath
    }
    return share
  },

  /**
   * 分享到朋友圈（用户从右上角菜单触发）
   */
  onShareTimeline() {
    const streak = this.data.streak || 0
    const total = this.data.grandTotal || 0
    let title = '来「一句刷」生成你的学习报告'
    if (streak > 0) {
      title = '🔥 连续打卡 ' + streak + ' 天 · 累计 ' + total + ' 题，坚持看得见'
    } else if (total > 0) {
      title = '已在「一句刷」累计刷题 ' + total + ' 道，我的学习报告'
    }
    return {
      title: title,
      query: 'from=report'
    }
  }
})
