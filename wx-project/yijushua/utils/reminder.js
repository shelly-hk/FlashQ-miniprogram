/**
 * 每日刷题提醒（微信订阅消息）
 * --------------------------------------------------
 * 本模块同时承担两件事：
 *   1) 本地 storage 状态：开关 / 提醒时间 / 已授权次数（与原版一致，离线可用、即时反馈）
 *   2) 静默同步到后端：让后端拿到「剩余可下发次数 / 提醒时间 / openid」，
 *      由后端定时任务调用微信 subscribeMessage.send 完成真正的消息下发。
 *
 * 设计要点（确保不影响原有功能）：
 *   - 对外 API 签名与返回值完全不变，原有调用方无需修改。
 *   - 后端同步只在「已登录（存在 token）」时触发，未登录走纯本地逻辑。
 *   - 同步失败一律静默（不抛错、不 toast），只把错误打到 console，保证用户操作流畅。
 *   - 后端不可用时，本地 storage 仍是唯一数据源，功能不中断。
 *
 * 接入步骤：
 *   1. 小程序后台 → 订阅消息 → 选用「刷题提醒」类目模板，拿到模板 ID；
 *   2. 把模板 ID 填到下面的 TEMPLATE_IDS；
 *   3. 后端配置 wx.reminder.template-id + enabled=true 即可定时下发。
 */

const api = require('./api.js')

// ========== 配置区 ==========
// 订阅消息模板 ID（小程序后台 → 订阅消息 → 我的模板）
// 模板：打卡提醒（模版编号 76018），需与后端 application.yaml 的 wx.reminder.template-id 保持一致
const TEMPLATE_IDS = [
  'uRswDZV9s8W5KQEPgl58AjkmLZjCP--tuJpX-EkLvpk'
]

// 默认提醒时间：每天 20:00
const DEFAULT_HOUR = 20
const DEFAULT_MINUTE = 0

// ========== 本地存储键 ==========
const KEY_ENABLED = 'dailyRemindEnabled'
const KEY_AUTH_COUNT = 'dailyRemindAuthCount'
const KEY_AUTH_AT = 'dailyRemindAuthAt'
const KEY_HOUR = 'dailyRemindHour'
const KEY_MINUTE = 'dailyRemindMinute'
// 用户最近一次手动操作（开启/关闭/改时间）的时间戳。
// 用于防止异步 syncFromServer 回调用滞后的服务端值覆盖用户刚做出的本地操作（竞态）。
const KEY_LAST_OP_AT = 'dailyRemindLastOpAt'
// 本地操作"保护窗口"：用户手动操作后 N 毫秒内，syncFromServer 不得覆盖本地 enabled。
const OP_PROTECT_MS = 5000

function pad2(n) {
  return String(n).padStart(2, '0')
}

// ========== 后端同步辅助 ==========
// 设计目标：所有同步失败一律静默，绝不影响用户的本地操作体验。

/**
 * 是否已登录（存在 token）。未登录时所有上报动作跳过，保持纯本地模式。
 * @returns {boolean}
 */
function hasLogin() {
  try {
    const t = wx.getStorageSync('token')
    return !!t
  } catch (e) {
    return false
  }
}

/**
 * 静默执行一次后端同步。仅登录态触发，失败仅打日志。
 * @param {() => Promise} task  返回 Promise 的函数（避免立刻执行）
 */
function safeSync(task) {
  if (!hasLogin()) return
  try {
    Promise.resolve(task()).then(() => {
      // 同步成功，无需任何提示
    }).catch(err => {
      // 同步失败：只记录日志，不打扰用户
      console.warn('[reminder] 后端同步失败（不影响本地使用）:', err && err.msg ? err.msg : err)
    })
  } catch (e) {
    console.warn('[reminder] 后端同步异常:', e)
  }
}

/**
 * 从服务端拉一次提醒状态，用权威值覆盖本地 storage 与展示。
 * 用于页面进入时把服务端的「累计授权次数 / 开关 / 时间」同步到本地展示。
 * 失败时静默保留本地值（不影响页面渲染）。
 * @param {(state)=>void} [onSynced]  同步成功后的回调，参数为标准 state 对象
 */
function syncFromServer(onSynced) {
  if (!hasLogin()) {
    if (typeof onSynced === 'function') onSynced(getState())
    return
  }
  api.getReminderState().then(s => {
    if (!s) return
    try {
      // 服务端字段映射回本地 storage（保持两端一致）
      // 关键：enabled 的覆盖受"本地最近操作保护窗口"约束。
      // 场景：用户刚点关闭（disable 已写本地 false + 异步 POST），但更早发出的本次 GET
      // 晚于用户操作返回，服务端可能尚未处理完 POST 而仍返回 enabled:true。
      // 此时若无条件回写，会把刚关闭的开关又拨回"已开启"——这是"关闭瞬间又自动开启"的根因。
      // 解决：本地最近 OP_PROTECT_MS 内有手动操作时，跳过 enabled 覆盖，保留用户的最新操作。
      const lastOpAt = Number(wx.getStorageSync(KEY_LAST_OP_AT)) || 0
      const withinProtect = lastOpAt > 0 && (Date.now() - lastOpAt) < OP_PROTECT_MS
      if (typeof s.enabled === 'boolean' && !withinProtect) {
        wx.setStorageSync(KEY_ENABLED, s.enabled)
      }
      if (typeof s.remainCount === 'number') wx.setStorageSync(KEY_AUTH_COUNT, s.remainCount)
      if (typeof s.remindHour === 'number') wx.setStorageSync(KEY_HOUR, s.remindHour)
      if (typeof s.remindMinute === 'number') wx.setStorageSync(KEY_MINUTE, s.remindMinute)
    } catch (e) {
      // 写本地失败忽略
    }
    if (typeof onSynced === 'function') onSynced(getState())
  }).catch(err => {
    console.warn('[reminder] 拉取服务端提醒状态失败（使用本地兜底）:', err && err.msg ? err.msg : err)
    if (typeof onSynced === 'function') onSynced(getState())
  })
}

/**
 * 读取用户设置的提醒时间
 * @returns {{hour: number, minute: number, value: string, text: string}}
 */
function getTime() {
  let hour = DEFAULT_HOUR
  let minute = DEFAULT_MINUTE
  try {
    const rawH = wx.getStorageSync(KEY_HOUR)
    const rawM = wx.getStorageSync(KEY_MINUTE)
    // 注意：storage 为空时 getStorageSync 返回 ''，Number('') 是 0，不能直接转
    if (rawH !== '' && rawH !== null && rawH !== undefined) {
      const h = Number(rawH)
      if (h >= 0 && h <= 23) hour = h
    }
    if (rawM !== '' && rawM !== null && rawM !== undefined) {
      const m = Number(rawM)
      if (m >= 0 && m <= 59) minute = m
    }
  } catch (e) {
    // 读取失败用默认 20:00
  }
  const value = pad2(hour) + ':' + pad2(minute)
  return { hour, minute, value, text: '每天 ' + value }
}

/**
 * 保存用户自定义的提醒时间
 * @param {number} hour   0-23
 * @param {number} minute 0-59
 * @returns {{hour: number, minute: number, value: string, text: string}}
 */
function setTime(hour, minute) {
  const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0))
  const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0))
  try {
    wx.setStorageSync(KEY_HOUR, h)
    wx.setStorageSync(KEY_MINUTE, m)
  } catch (e) {
    // 写入失败时仍返回本次选择值
  }
  // 静默同步到后端（失败不影响本地写入结果）
  safeSync(() => api.setReminderTime(h, m))
  const value = pad2(h) + ':' + pad2(m)
  return { hour: h, minute: m, value, text: '每天 ' + value }
}

/**
 * 模板 ID 是否已配置
 */
function isConfigured() {
  return TEMPLATE_IDS.length > 0 && !!TEMPLATE_IDS[0]
}

/**
 * 读取本地授权状态
 * @returns {{enabled: boolean, authCount: number, authAt: number, configured: boolean,
 *            hour: number, minute: number, timeValue: string, timeText: string}}
 */
function getState() {
  let enabled = false
  let authCount = 0
  let authAt = 0
  try {
    enabled = wx.getStorageSync(KEY_ENABLED) === true
    authCount = Number(wx.getStorageSync(KEY_AUTH_COUNT)) || 0
    authAt = Number(wx.getStorageSync(KEY_AUTH_AT)) || 0
  } catch (e) {
    // 读取失败按未开启处理
  }
  const time = getTime()
  return {
    enabled,
    authCount,
    authAt,
    configured: isConfigured(),
    hour: time.hour,
    minute: time.minute,
    timeValue: time.value,
    timeText: time.text
  }
}

/**
 * 写入已授权状态并累积可下发次数
 * @param {number} acceptedCount 本次被允许的模板数
 */
function markAccepted(acceptedCount) {
  const state = getState()
  try {
    wx.setStorageSync(KEY_ENABLED, true)
    wx.setStorageSync(KEY_AUTH_COUNT, state.authCount + Math.max(1, acceptedCount))
    wx.setStorageSync(KEY_AUTH_AT, Date.now())
    // 记录手动操作时间，进入"保护窗口"（与 disable 对称）
    wx.setStorageSync(KEY_LAST_OP_AT, Date.now())
  } catch (e) {
    // 写入失败不影响主流程
  }
  // 静默同步到后端：把本次新增的授权额度上报，后端 remain_count 同步累加
  safeSync(() => api.reportReminderAuth(Math.max(1, acceptedCount)))
}

/**
 * 关闭提醒（仅关闭本地开关；已下发到后端的授权无法撤回）
 */
function disable() {
  try {
    wx.setStorageSync(KEY_ENABLED, false)
    // 记录本次手动操作时间，进入"保护窗口"，
    // 阻止晚到的 syncFromServer 把开关又同步回 true（竞态修复）
    wx.setStorageSync(KEY_LAST_OP_AT, Date.now())
  } catch (e) {
    // ignore
  }
  // 静默同步到后端（不清空后端已累积的额度，方便重新开启后继续下发）
  safeSync(() => api.disableReminder())
}

/**
 * 发起订阅消息授权（必须在用户点击事件中调用）
 * @returns {Promise<{accepted: string[]}>}
 *   reject 情况：
 *     { code: 'NO_TEMPLATE' }            未配置模板 ID
 *     { code: 'MAIN_SWITCH_OFF', ... }   用户关闭了小程序订阅消息总开关
 *     { code: 'REJECTED' }               用户点了"取消"
 *     { code: 'FAIL', err }              其它失败
 */
function requestAuth() {
  // 记录发起授权时的时间戳，用于在微信异步回调里识别"用户在等待弹窗期间是否
  // 又操作过开关"。如果用户在此期间点过关闭（storage enabled 已是 false 且
  // KEY_LAST_OP_AT 晚于 reqStartedAt），则只累计授权次数，不再把开关改回 true。
  const reqStartedAt = Date.now()
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      reject({ code: 'NO_TEMPLATE' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: TEMPLATE_IDS,
      success(res) {
        const accepted = TEMPLATE_IDS.filter(id => res[id] === 'accept')
        if (accepted.length > 0) {
          // 检查用户是否在等待微信弹窗期间手动关闭了开关
          let userClosedDuringWait = false
          try {
            const lastOpAt = Number(wx.getStorageSync(KEY_LAST_OP_AT)) || 0
            const currentEnabled = wx.getStorageSync(KEY_ENABLED) === true
            // 当前已是关闭态，且最近一次手动操作晚于本次发起授权 → 用户在等待期间点过关闭
            userClosedDuringWait = !currentEnabled && lastOpAt > reqStartedAt
          } catch (e) {
            // 读取失败按未关闭处理
          }
          if (userClosedDuringWait) {
            // 尊重用户的关闭操作：只累计授权次数（额度仍归用户所有，下次开启可直接用），
            // 不写 enabled=true，避免把刚关闭的开关又同步回开启。
            try {
              const cnt = Number(wx.getStorageSync(KEY_AUTH_COUNT)) || 0
              wx.setStorageSync(KEY_AUTH_COUNT, cnt + accepted.length)
              wx.setStorageSync(KEY_AUTH_AT, Date.now())
            } catch (e) {
              // ignore
            }
            // 额度上报照常（后端 remain_count 累加），失败静默
            safeSync(() => api.reportReminderAuth(accepted.length))
            resolve({ accepted })
          } else {
            markAccepted(accepted.length)
            resolve({ accepted })
          }
        } else {
          reject({ code: 'REJECTED', result: res })
        }
      },
      fail(err) {
        const errCode = err && err.errCode
        // 20004：用户在小程序设置里关掉了订阅消息总开关
        if (errCode === 20004) {
          reject({ code: 'MAIN_SWITCH_OFF', err })
        } else {
          reject({ code: 'FAIL', err })
        }
      }
    })
  })
}

module.exports = {
  TEMPLATE_IDS,
  isConfigured,
  getState,
  getTime,
  setTime,
  requestAuth,
  disable,
  // 新增：从服务端同步状态（页面 onShow 调用一次即可）
  syncFromServer
}
