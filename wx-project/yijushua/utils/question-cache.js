/**
 * 随机题本地缓存（断网兜底）
 * --------------------------------------------------
 * 设计目标：
 *   - 在线时把每次拉到的随机题顺手塞进缓存池，维持在 5-10 道
 *   - 断网或后端异常时，从缓存池取一道题让用户继续刷，不至于卡在白屏
 *   - 缓存按题目类型（it/code/interview）分桶，避免不同题型混入
 *
 * 存储结构（wx.setStorageSync）：
 *   key = QUESTION_CACHE_KEY
 *   value = {
 *     it:        [question, ...],   // 随机刷题缓存
 *     code:      [question, ...],   // 代码题缓存
 *     interview: [question, ...]    // 面试题缓存
 *   }
 *
 * 注意：仅缓存"题目对象本体"（content/options/difficulty 等），
 *      不缓存用户答题状态；判题接口断网时无法工作，缓存只解决"看到题"这一步。
 */

const QUESTION_CACHE_KEY = 'randomQuestionCache'
const MAX_POOL_SIZE = 10   // 每个题型分桶上限
const MIN_POOL_SIZE = 5    // 触发补充缓存的最低水位（调用方可据此判断是否后台静默补题）

/**
 * 读取整棵缓存树（私有）
 */
function _readAll() {
  const data = wx.getStorageSync(QUESTION_CACHE_KEY)
  if (!data || typeof data !== 'object') {
    return { it: [], code: [], interview: [] }
  }
  return {
    it: Array.isArray(data.it) ? data.it : [],
    code: Array.isArray(data.code) ? data.code : [],
    interview: Array.isArray(data.interview) ? data.interview : []
  }
}

/**
 * 写入整棵缓存树（私有）
 */
function _writeAll(tree) {
  try {
    wx.setStorageSync(QUESTION_CACHE_KEY, tree)
  } catch (e) {
    // 存储溢出（写入失败）时静默降级：清空后再尝试写一次
    try {
      wx.removeStorageSync(QUESTION_CACHE_KEY)
      wx.setStorageSync(QUESTION_CACHE_KEY, tree)
    } catch (err) {}
  }
}

/**
 * 规范化 quizType 为分桶 key
 * @param {string} quizType  ''/'it' → 'it'；'code' → 'code'；'interview' → 'interview'
 */
function _bucketKey(quizType) {
  if (quizType === 'code') return 'code'
  if (quizType === 'interview') return 'interview'
  return 'it'
}

/**
 * 把一道题压入缓存池
 * - 同 id 去重（避免同一道题反复出现）
 * - 超出上限时丢弃最旧的（保持池子新鲜）
 * - 仅写入有效题目（有 id 且有 content）
 * @param {object} question  题目对象
 * @param {string} quizType  题目类型（''=默认it/'code'/'interview'）
 */
function push(question, quizType) {
  if (!question || question.id == null || !question.content) return
  const bucket = _bucketKey(quizType)
  const tree = _readAll()
  const pool = tree[bucket]
  // 去重：已存在则先移除
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].id === question.id) {
      pool.splice(i, 1)
      break
    }
  }
  // 压入最新一道
  pool.push({
    id: question.id,
    subjectId: question.subjectId,
    subjectName: question.subjectName,
    content: question.content,
    options: question.options || [],
    difficulty: question.difficulty,
    quizType: question.quizType,
    style: question.style,
    source: question.source,
    explanation: question.explanation,
    isFavorited: question.isFavorited
  })
  // 超出上限：从头丢弃（最旧的）
  while (pool.length > MAX_POOL_SIZE) {
    pool.shift()
  }
  _writeAll(tree)
}

/**
 * 从缓存池弹出一道题（FIFO，最旧的先出）
 * @param {string} quizType  题目类型
 * @param {number} [excludeId]  排除某道题（避免与当前题重复）
 * @returns {object|null}  题目对象；池空返回 null
 */
function pop(quizType, excludeId) {
  const tree = _readAll()
  const pool = tree[_bucketKey(quizType)]
  if (pool.length === 0) return null
  // 优先返回非 excludeId 的题
  let idx = 0
  if (excludeId != null) {
    while (idx < pool.length && pool[idx].id === excludeId) idx++
    if (idx >= pool.length) return null
  }
  const question = pool.splice(idx, 1)[0]
  _writeAll(tree)
  return question
}

/**
 * 查看池中题目数（不弹出）
 */
function size(quizType) {
  return _readAll()[_bucketKey(quizType)].length
}

/**
 * 是否低于补水位（调用方可据此判断是否后台静默补题）
 */
function needsRefill(quizType) {
  return size(quizType) < MIN_POOL_SIZE
}

/**
 * 清空所有缓存
 */
function clear() {
  try {
    wx.removeStorageSync(QUESTION_CACHE_KEY)
  } catch (e) {}
}

module.exports = {
  push,
  pop,
  size,
  needsRefill,
  clear,
  MAX_POOL_SIZE,
  MIN_POOL_SIZE
}
