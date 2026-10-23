/**
 * 新手引导状态管理器
 * ============================================================
 * 设计目标
 * ------------------------------------------------------------
 * - 跨页面：引导可在 home / quiz-setup / quiz 多页流转，状态全局持久化
 * - 断点续传：用户中途退出后，下次回到对应页面会自动继续未完成步骤
 * - 召回入口：任何时候都能从「我的」或「首页」重新打开引导
 * - 流程闭环：每一步只聚焦 1-2 个核心动作，完成即推进，跳过即结束
 *
 * 存储键：onboarding_v2
 * 存储结构：
 *   {
 *     version: 'v2',
 *     startedAt: 1730000000000,
 *     currentStep: 2,          // 当前所在步骤（STEPS 索引）
 *     completedSteps: [0, 1],  // 已完成步骤的 id 数组
 *     skipped: false,          // 是否跳过整段引导
 *     finished: false          // 是否已完成全部步骤
 *   }
 * ============================================================
 */

// 引导步骤定义：严格按新用户首次操作路径设计
// 每步聚焦 1-2 个核心动作，文案短且可执行
const STEPS = [
  {
    id: 'welcome',
    page: 'pages/home/home',
    target: null,            // 无高亮目标 → 居中卡片
    icon: '👋',
    title: '欢迎使用一句刷',
    desc: '1 分钟跟完，掌握自主题库核心玩法。',
    expectation: '之后可在「首页 → 新手引导」重新打开',
    primaryText: '开始引导',
    secondaryText: '跳过',
    secondarySkip: true      // 点次要按钮 = 整段跳过
  },
  {
    id: 'home-custom',
    page: 'pages/home/home',
    target: 'custom-quiz',   // 高亮「自主题库」入口卡片（首页宫格第 2 行右侧）
    icon: '📚',
    title: '第一步：打开「自主题库」',
    desc: '在首页宫格右下角找到紫色的「自主题库」卡片并点开。',
    expectation: '下一屏展示已有题库与新建入口',
    primaryText: '好的，我去点',
    completeOnTargetTap: true  // 点击高亮目标才算完成（实时反馈）
  },
  {
    id: 'custom-upload',
    page: 'pages/custom-list/custom-list',
    target: 'upload-btn',     // 高亮「去上传」按钮
    icon: '📤',
    title: '第二步：上传资料生成题库',
    desc: '点「去上传」提交 PDF/Word/文本，系统自动生成专属题库。',
    expectation: '上传完成后回到本页即可刷题',
    primaryText: '我知道了'
  },
  {
    id: 'custom-practice',
    page: 'pages/custom-list/custom-list',
    target: 'practice-btn',   // 高亮「开始刷题」按钮
    icon: '🎯',
    title: '第三步：开始刷题',
    desc: '题库就绪后点「开始刷题」进入自主题库的答题模式。',
    expectation: '答题、错题、收藏与随机刷题体验一致',
    primaryText: '完成引导'
  },
  {
    id: 'complete',
    page: 'pages/home/home',
    target: null,
    icon: '🎉',
    title: '引导完成',
    desc: '自主题库的核心流程已掌握，自由探索吧。',
    expectation: '还有「随机刷题」与「专项复习」等你体验',
    primaryText: '完成'
  }
]

const STORAGE_KEY = 'onboarding_v2'
const VERSION = 'v2'
const LEGACY_KEY = 'onboardingShown'  // 老 3 步引导的标记，需平滑迁移

/**
 * 读取存储中的引导状态
 * 返回标准结构（不存在则返回 null）
 */
function readState() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return null
    if (raw.version !== VERSION) return null
    return raw
  } catch (e) {
    return null
  }
}

/**
 * 写入状态（合并写）
 */
function writeState(state) {
  try {
    wx.setStorageSync(STORAGE_KEY, state)
  } catch (e) {
    // 存储失败不影响主流程，下次启动再尝试
  }
}

/**
 * 初始化引导状态：仅当本机首次启动（无任何引导记录）时触发
 * 行为：保留老版本「onboardingShown」用户的已读状态，避免老用户被重复打扰
 * 返回：true 表示本次启动需要开始引导，false 表示不需要
 */
function initIfNeeded() {
  // 老用户已经看过引导，迁移为「已完成」状态
  let legacyShown = false
  try { legacyShown = !!wx.getStorageSync(LEGACY_KEY) } catch (e) {}

  const existing = readState()
  if (existing) {
    // 已经有 v2 状态，按部就班
    return false
  }

  if (legacyShown) {
    // 老用户：直接写入「已完成」状态
    writeState({
      version: VERSION,
      startedAt: Date.now(),
      currentStep: STEPS.length - 1,
      completedSteps: STEPS.map(s => s.id),
      skipped: false,
      finished: true
    })
    return false
  }

  // 新用户：初始化到第一步，等待首页调用 startTour 显示
  writeState({
    version: VERSION,
    startedAt: Date.now(),
    currentStep: 0,
    completedSteps: [],
    skipped: false,
    finished: false
  })
  return true
}

/**
 * 开始引导（用于首次启动或召回重启）
 * 重置所有状态到第一步
 */
function startTour() {
  writeState({
    version: VERSION,
    startedAt: Date.now(),
    currentStep: 0,
    completedSteps: [],
    skipped: false,
    finished: false
  })
}

/**
 * 整段跳过：标记 skipped + finished，不再打扰
 */
function skipAll() {
  const cur = readState() || {}
  writeState(Object.assign({}, cur, {
    version: VERSION,
    skipped: true,
    finished: true,
    completedSteps: cur.completedSteps || []
  }))
}

/**
 * 标记当前步骤已完成，推进到下一步
 * 返回下一步定义；若已是最后一步，则标记 finished 并返回 null
 */
function completeCurrentStep() {
  const state = readState()
  if (!state) return null

  const stepId = (STEPS[state.currentStep] || {}).id
  const completed = state.completedSteps || []
  if (stepId && completed.indexOf(stepId) < 0) {
    completed.push(stepId)
  }

  const nextIndex = state.currentStep + 1
  const isLast = nextIndex >= STEPS.length

  writeState({
    version: VERSION,
    startedAt: state.startedAt || Date.now(),
    currentStep: isLast ? state.currentStep : nextIndex,
    completedSteps: completed,
    skipped: state.skipped || false,
    finished: isLast || state.finished || false
  })

  return isLast ? null : STEPS[nextIndex]
}

/**
 * 跳过当前单步（不算完成，但推进到下一步）
 * 用于「跳过本步」次要按钮
 */
function skipCurrentStep() {
  const state = readState()
  if (!state) return null

  const nextIndex = state.currentStep + 1
  const isLast = nextIndex >= STEPS.length

  writeState({
    version: VERSION,
    startedAt: state.startedAt || Date.now(),
    currentStep: isLast ? state.currentStep : nextIndex,
    completedSteps: state.completedSteps || [],
    skipped: state.skipped || false,
    finished: isLast || state.finished || false
  })

  return isLast ? null : STEPS[nextIndex]
}

/**
 * 是否已彻底结束（完成或跳过），不再需要显示引导
 */
function isFinished() {
  const s = readState()
  if (!s) return true   // 没有状态视为不需要引导（避免老用户被骚扰）
  return !!s.finished
}

/**
 * 是否被用户主动跳过（区别于自然完成）
 */
function isSkipped() {
  const s = readState()
  return !!(s && s.skipped)
}

/**
 * 获取当前应该在指定页面显示的引导步骤
 * 返回 step 定义对象；若当前页面不需要显示引导，返回 null
 *
 * 匹配规则：
 *   1. 已 finished → 返回 null
 *   2. 当前步骤的 page 与传入 route 完全匹配 → 返回当前步骤
 *   3. 否则返回 null（避免在错误页面误显示）
 */
function getStepForPage(route) {
  const s = readState()
  if (!s || s.finished) return null
  const step = STEPS[s.currentStep]
  if (!step) return null
  if (step.page !== route) return null
  return step
}

/**
 * 获取进度信息（用于召回面板展示）
 *   { current, total, percent, finished, skipped, currentStep }
 */
function getProgress() {
  const s = readState()
  if (!s) {
    return { current: 0, total: STEPS.length, percent: 0, finished: true, skipped: false, currentStep: null }
  }
  const completedCount = (s.completedSteps || []).length
  return {
    current: completedCount,
    total: STEPS.length,
    percent: Math.round((completedCount / STEPS.length) * 100),
    finished: !!s.finished,
    skipped: !!s.skipped,
    currentStep: STEPS[s.currentStep] || null
  }
}

/**
 * 获取所有步骤定义（用于召回面板展示步骤列表）
 */
function getAllSteps() {
  return STEPS.map(s => ({
    id: s.id,
    icon: s.icon,
    title: s.title,
    desc: s.desc
  }))
}

/**
 * 获取当前已完成步骤的 id 集合（用于召回面板打勾）
 */
function getCompletedStepIds() {
  const s = readState()
  return (s && s.completedSteps) || []
}

module.exports = {
  STEPS: STEPS,
  initIfNeeded: initIfNeeded,
  startTour: startTour,
  skipAll: skipAll,
  completeCurrentStep: completeCurrentStep,
  skipCurrentStep: skipCurrentStep,
  isFinished: isFinished,
  isSkipped: isSkipped,
  getStepForPage: getStepForPage,
  getProgress: getProgress,
  getAllSteps: getAllSteps,
  getCompletedStepIds: getCompletedStepIds
}
