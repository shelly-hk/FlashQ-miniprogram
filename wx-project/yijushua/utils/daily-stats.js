/**
 * 答题日历本地存储工具（dailyStats）
 * --------------------------------------------------
 * 存储结构：
 *   dailyStats      - { 'YYYY-MM-DD': 当日题数 }  热力图 / 连续打卡 / 日均的数据源
 *   dailyStatsLocal - { 'YYYY-MM-DD': 当日题数 }  本机答题埋点（recordDailyAnswer 实时 +1）
 *
 * 为什么需要两份：
 *   服务端 getUserInfo 的 todayCount 历史上有"跨天陈旧"问题 - today_count 只在答题时
 *   才重置，当天没答题会残留昨日数值。旧版本前端用 Math.max(本地, 服务端) 合并时，
 *   会把昨日题量写进今日，且每天向后传播（热力图虚高、连续打卡虚高）。
 *   服务端已修复为跨天返回 0；本模块在合并时按来源重算今日计数：
 *     今日真实计数 = max(服务端今日计数, 本机今日埋点)
 *   多设备答题取服务端、本机实时答题取埋点，旧版本写入的陈旧值会被自动覆盖（自愈）。
 */

// 生成本地日期键（避免 toISOString 的 UTC 时区跨日问题）
function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function readObj(key) {
  try {
    return wx.getStorageSync(key) || {}
  } catch (e) {
    return {}
  }
}

function writeObj(key, obj) {
  try {
    wx.setStorageSync(key, obj)
  } catch (e) {
    // 写入失败不影响主流程
  }
}

/**
 * 答题埋点：每答一题即把当日计数 +1（实时写入，确保历史日期不被漏录）
 */
function recordDailyAnswer() {
  const key = dateKey(new Date())
  const history = readObj('dailyStats')
  history[key] = (history[key] || 0) + 1
  writeObj('dailyStats', history)
  // 本机埋点元数据：标识"今日计数中来自本机实时答题"的部分
  const local = readObj('dailyStatsLocal')
  local[key] = (local[key] || 0) + 1
  writeObj('dailyStatsLocal', local)
}

/**
 * 合并服务端今日快照（todayCount），返回最新 history
 * @param {number} serverToday 服务端返回的今日答题数（0 = 今日未答题）
 *
 * 今日真实计数 = max(服务端今日计数, 本机今日埋点)：
 *   dailyStats[today] 只是这两个来源的"合并结果"（衍生值），
 *   每次都用来源重算，旧版本写入的跨天陈旧值会被自动覆盖（自愈），
 *   也不会把服务端昨日残留误当成今日数据。
 */
function mergeServerToday(serverToday) {
  const key = dateKey(new Date())
  const history = readObj('dailyStats')
  const localToday = readObj('dailyStatsLocal')[key] || 0
  const server = serverToday > 0 ? serverToday : 0
  const next = Math.max(server, localToday)
  if (next > 0) {
    history[key] = next
  } else {
    delete history[key]
  }
  writeObj('dailyStats', history)
  return history
}

module.exports = {
  dateKey,
  recordDailyAnswer,
  mergeServerToday
}
