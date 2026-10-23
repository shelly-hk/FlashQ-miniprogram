/**
 * 接口请求统一封装
 * --------------------------------------------------
 * 所有页面都通过这个文件调用后端接口。
 * 你只需要在页面里 require 本文件，然后调用对应的函数即可。
 *
 * 核心设计：
 * 1. 统一拼接请求地址（BASE_URL + 接口路径）
 * 2. 统一带上 Authorization token（从本地缓存自动读取）
 * 3. 统一处理后端返回的 { code, msg, data } 结构
 *    - code === 200：成功，把 data 扔回给页面
 *    - code === 401：登录失效，清掉 token，提示用户
 *    - 其他：把错误信息抛回页面处理
 */

// ========== 配置区 ==========
// 后端服务地址（生产环境，HTTPS 域名）
const BASE_URL = 'https://api.flashq.site/api'

// ========== 核心请求函数 ==========

/**
 * 发起一次请求（内部函数，页面不直接调它）
 * @param {string} path    接口路径，例如 '/question/random'
 * @param {string} method  'GET' 或 'POST'
 * @param {object} data    请求数据（GET 时会自动拼到 URL 上）
 * @returns {Promise}      成功时 resolve(data)，失败时 reject(错误对象)
 */
function request(path, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method: method,
      data: data || {},
      header: {
        'Content-Type': 'application/json',
        // 自动从本地缓存读取 token；没有就是空字符串（游客模式）
        'Authorization': wx.getStorageSync('token') || ''
      },
      success(res) {
        const body = res.data
        // 后端统一返回 { code, msg, data }
        if (body.code === 200) {
          // 成功：把 data 丢给页面
          resolve(body.data)
        } else if (body.code === 401) {
          // 登录失效：清掉本地 token，让用户重新登录
          wx.removeStorageSync('token')
          wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
          reject(body)
        } else {
          // 其他错误（400/404/500）：提示一下，把错误抛回页面
          wx.showToast({ title: body.msg || '请求失败', icon: 'none' })
          reject(body)
        }
      },
      fail(err) {
        // 网络错误（后端没启动、地址写错等）
        wx.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

// ========== 各业务接口 ==========
// 下面的函数对 request 做了一层包装，页面调用起来更直观。

/* -------------------- 登录相关 -------------------- */

/**
 * 微信登录
 * @param {string} code  wx.login() 拿到的 code
 * @returns {Promise<{token, nickNo, isNew}>}
 */
function wxLogin(code) {
  return request('/wx/login', 'POST', { code })
}

/* -------------------- 科目相关 -------------------- */

/**
 * 获取科目列表
 * @param {string} quizType 可选：'code'=代码题库科目 / 'interview'=面试题库科目；
 *                          不传时返回随机刷题科目（已排除 code/interview）
 * @returns {Promise<Array<{id, name, quizType, questionCount}>>}
 */
function getSubjectList(quizType) {
  const query = quizType ? '?quizType=' + quizType : ''
  return request('/subject/list' + query, 'GET')
}

/* -------------------- 题目相关 -------------------- */

/**
 * 随机取一道单选题
 * @param {number} subjectId   科目ID（可选，0/不传表示全部）
 * @param {number} difficulty  难度（可选，1/2/3）
 * @param {string} quizType    题目类型（可选）：'it'=IT知识题 / 'code'=代码题 / 'interview'=面试题；
 *                             不传时后端默认只返回 it 题目（保持向后兼容）
 * @param {string} style       题目风格（可选）：'quick'=快速刷 / 'quality'=质量刷；不传表示不限
 * @returns {Promise<{id, subjectId, subjectName, content, options, difficulty, quizType, style, source, isFavorited}>}
 */
function getRandomQuestion(subjectId, difficulty, quizType, style) {
  // GET 请求的参数拼在 URL 后面
  const params = []
  if (subjectId) params.push('subjectId=' + subjectId)
  if (difficulty) params.push('difficulty=' + difficulty)
  if (quizType) params.push('quizType=' + quizType)
  if (style) params.push('style=' + style)
  const query = params.length ? '?' + params.join('&') : ''
  return request('/question/random' + query, 'GET')
}

/**
 * 提交答案并判题
 * @param {object} data  { questionId, userAnswer, duration? }
 * @returns {Promise<{isCorrect, correctAnswer, explanation, totalCount, todayCount, wrongCount, isFavorited}>}
 */
function judgeQuestion(data) {
  return request('/question/judge', 'POST', data)
}

/**
 * 收藏 / 取消收藏
 * @param {number} questionId  题目ID
 * @returns {Promise<{isFavorited}>}
 */
function toggleFavorite(questionId) {
  return request('/question/favorite/toggle', 'POST', { questionId })
}

/* -------------------- 收藏 / 错题本 删除操作 -------------------- */

/**
 * 删除收藏（从收藏列表中移除一道题）
 * 与 toggle 的区别：toggle 用于刷题页切换收藏状态，delete 用于收藏列表页明确删除
 * @param {number} questionId  题目ID
 * @returns {Promise<{deleted: boolean}>}
 */
function deleteFavorite(questionId) {
  return request('/question/favorite/delete', 'POST', { questionId })
}

/**
 * 删除错题（从错题本中手动移除一道题，如已掌握）
 * @param {number} questionId  题目ID
 * @returns {Promise<{deleted: boolean}>}
 */
function deleteWrongQuestion(questionId) {
  return request('/question/wrong/delete', 'POST', { questionId })
}

/* -------------------- 收藏 / 错题本列表 -------------------- */

/**
 * 收藏列表（分页+科目筛选+题目类型筛选）
 * @param {number} page       页码，从1开始
 * @param {number} size       每页条数
 * @param {number} subjectId  科目ID（可选，不传或0表示全部）
 * @param {string} quizType   题目类型（可选）：'it'/'code'/'interview'，不传表示全部类型
 * @returns {Promise<{total, list}>}
 */
function getFavoriteList(page, size, subjectId, quizType) {
  let query = `?page=${page}&size=${size}`
  if (subjectId) query += '&subjectId=' + subjectId
  if (quizType) query += '&quizType=' + quizType
  return request('/question/favorite/list' + query, 'GET')
}

/**
 * 错题本列表（分页+科目筛选+题目类型筛选）
 * @param {number} page       页码
 * @param {number} size       每页条数
 * @param {number} subjectId  科目ID（可选，不传或0表示全部）
 * @param {string} quizType   题目类型（可选）：'it'/'code'/'interview'，不传表示全部类型
 * @returns {Promise<{total, list}>}
 */
function getWrongList(page, size, subjectId, quizType) {
  let query = `?page=${page}&size=${size}`
  if (subjectId) query += '&subjectId=' + subjectId
  if (quizType) query += '&quizType=' + quizType
  return request('/question/wrong/list' + query, 'GET')
}

/* -------------------- 用户统计 -------------------- */

/**
 * 获取当前用户统计信息（需登录）
 * @returns {Promise<{nickNo, totalCount, todayCount, rank, todayRank, wrongTotal, favoriteTotal}>}
 */
function getUserInfo() {
  return request('/user/info', 'GET')
}

/* -------------------- 应用配置（备案信息） -------------------- */

/**
 * 获取应用配置信息（含备案号）
 * 公开接口，无需登录。
 * @returns {Promise<{version, beianNo, beianUrl, disclaimer, companyName}>}
 */
function getConfigInfo() {
  return request('/config/info', 'GET')
}

/* -------------------- 排行榜 -------------------- */

/**
 * 排行榜 Top100
 * @returns {Promise<{list, myRank, myTotalCount}>}
 */
function getRankList(type) {
  var url = '/rank/list'
  if (type) url += '?type=' + type
  return request(url, 'GET')
}

/**
 * 排行榜点赞
 * @param {number} targetId - 被点赞用户ID
 * @param {string} rankType - 'total' | 'today'
 */
function likeRankUser(targetId, rankType) {
  return request('/rank/like', 'POST', {
    targetId: targetId,
    rankType: rankType || 'total'
  })
}

/* -------------------- 文件上传 & 自主题库 -------------------- */

/**
 * 查询今日上传配额（需登录）
 * @returns {Promise<{dailyLimit, usedToday, remaining, extraReward}>}
 */
function getUploadQuota() {
  return request('/upload/quota', 'GET')
}

/**
 * 上传文件（需登录）
 * 注意：此函数使用 wx.uploadFile，不走通用 request 封装
 * @param {string} filePath  本地临时文件路径
 * @param {number} categoryId  分类ID（可选，不传则归入"其他"）
 * @returns {Promise<{taskId, status, message}>}
 */
function uploadFile(filePath, categoryId) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + '/upload/file',
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': wx.getStorageSync('token') || ''
      },
      formData: categoryId ? { categoryId: categoryId } : {},
      success(res) {
        const body = JSON.parse(res.data)
        if (body.code === 200) {
          resolve(body.data)
        } else {
          reject(body)
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

/**
 * 上传文本生成题目（需登录）
 * @param {string} text  粘贴的文本内容
 * @returns {Promise<{taskId, status, message}>}
 */
function uploadText(text) {
  return request('/upload/text', 'POST', { text: text })
}

/**
 * 查询解析任务状态（需登录）
 * @param {number} taskId  任务ID
 * @returns {Promise<{taskId, status, statusText, questionCount, fileName?, failReason?}>}
 */
function getUploadTaskStatus(taskId) {
  return request('/upload/task/' + taskId, 'GET')
}

/**
 * 上传记录列表（需登录）
 * @param {number} page  页码
 * @param {number} size  每页条数
 * @returns {Promise<{total, list}>}
 */
function getUploadRecordList(page, size) {
  return request(`/upload/record/list?page=${page}&size=${size}`, 'GET')
}

/**
 * 导入题目 — 粘贴文本（需登录，不走AI，按格式规范直接解析入库）
 * @param {string} text        按格式规范的题目文本
 * @param {number} categoryId  目标分类ID（可选）
 * @returns {Promise<{imported, failed, total}>}
 */
function importQuestionsFromText(text, categoryId) {
  const body = { text: text }
  if (categoryId) body.categoryId = categoryId
  return request('/upload/import/text', 'POST', body)
}

/**
 * 导入题目 — 上传文件（需登录，不走AI，按格式规范直接解析入库）
 * 注意：此函数使用 wx.uploadFile，不走通用 request 封装
 * @param {string} filePath    本地临时文件路径
 * @param {number} categoryId  目标分类ID（可选）
 * @returns {Promise<{imported, failed, total}>}
 */
function importQuestionsFromFile(filePath, categoryId) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + '/upload/import/file',
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': wx.getStorageSync('token') || ''
      },
      formData: categoryId ? { categoryId: categoryId } : {},
      success(res) {
        const body = JSON.parse(res.data)
        if (body.code === 200) {
          resolve(body.data)
        } else {
          reject(body)
        }
      },
      fail(err) {
        reject({ msg: '网络请求失败' })
      }
    })
  })
}

/**
 * 自主题库随机取题（需登录）
 * @param {number} difficulty   难度（可选，1/2/3）
 * @param {number} categoryId   分类ID（可选，不传或0表示全部）
 * @param {number} excludeId    排除的题目ID（可选，避免连续重复）
 * @returns {Promise<{id, content, options, answer, explanation, difficulty, categoryId, categoryName, sourceFileName, isFavorited}>}
 */
function getCustomRandomQuestion(difficulty, categoryId, excludeId) {
  const params = []
  if (difficulty) params.push('difficulty=' + difficulty)
  if (categoryId) params.push('categoryId=' + categoryId)
  if (excludeId) params.push('excludeId=' + excludeId)
  const query = params.length ? '?' + params.join('&') : ''
  return request('/custom/question/random' + query, 'GET')
}

/**
 * 自主题库判题（需登录）
 * @param {object} data  { questionId, userAnswer, duration? }
 * @returns {Promise<{isCorrect, correctAnswer, explanation, totalCount, todayCount}>}
 */
function judgeCustomQuestion(data) {
  return request('/custom/question/judge', 'POST', data)
}

/**
 * 自主题库列表（需登录）
 * @param {number} page          页码
 * @param {number} size          每页条数
 * @param {string} sourceFileName 按来源文件名筛选（可选）
 * @param {number} categoryId    按分类筛选（可选，不传或0表示全部）
 * @returns {Promise<{total, list}>}
 */
function getCustomQuestionList(page, size, sourceFileName, categoryId) {
  let query = `?page=${page}&size=${size}`
  if (sourceFileName) query += '&sourceFileName=' + encodeURIComponent(sourceFileName)
  if (categoryId) query += '&categoryId=' + categoryId
  return request('/custom/question/list' + query, 'GET')
}

/**
 * 删除自主题库题目（需登录）
 * @param {number} questionId  自主题目ID
 * @returns {Promise<{deleted}>}
 */
function deleteCustomQuestion(questionId) {
  return request('/custom/question/delete', 'POST', { questionId })
}

/**
 * 批量删除全部自主题库题目（可选按分类筛选）
 * @param {number} [categoryId]  分类ID，不传则删除全部
 * @returns {Promise<{deletedCount}>}
 */
function deleteAllCustomQuestions(categoryId) {
  const body = {}
  if (categoryId) body.categoryId = categoryId
  return request('/custom/question/deleteAll', 'POST', body)
}

/* -------------------- 自主题库分类管理 -------------------- */

/**
 * 获取用户分类列表（含各分类题目数）
 * @returns {Promise<{list, total}>}
 */
function getCustomCategoryList() {
  return request('/custom/category/list', 'GET')
}

/**
 * 创建自定义分类
 * @param {string} name  分类名称（仅中文，不超过10个字）
 * @returns {Promise<{id, name}>}
 */
function createCustomCategory(name) {
  return request('/custom/category/create', 'POST', { name })
}

/**
 * 删除分类（分类下题目归入"其他"）
 * @param {number} categoryId  分类ID
 * @returns {Promise<{deleted, movedCount}>}
 */
function deleteCustomCategory(categoryId) {
  return request('/custom/category/delete', 'POST', { categoryId })
}

/**
 * 重命名分类
 * @param {number} categoryId  分类ID
 * @param {string} name  新分类名称
 * @returns {Promise<{id, name}>}
 */
function renameCustomCategory(categoryId, name) {
  return request('/custom/category/rename', 'POST', { categoryId, name })
}

/* -------------------- 自主题目分类操作 -------------------- */

/**
 * 修改题目所属分类
 * @param {number} questionId  自主题目ID
 * @param {number} categoryId  目标分类ID
 * @returns {Promise<{updated}>}
 */
function updateCustomQuestionCategory(questionId, categoryId) {
  return request('/custom/question/updateCategory', 'POST', { questionId, categoryId })
}

/* -------------------- 自主题库收藏 -------------------- */

/**
 * 自主题目 收藏 / 取消收藏
 * @param {number} questionId  自主题目ID
 * @returns {Promise<{isFavorited}>}
 */
function toggleCustomFavorite(questionId) {
  return request('/custom/favorite/toggle', 'POST', { questionId })
}

/**
 * 自主题库收藏列表（需登录，分页+分类筛选）
 * @param {number} page        页码（从1开始）
 * @param {number} size        每页条数
 * @param {number} categoryId  分类ID（可选，不传或0表示全部）
 * @returns {Promise<{total, list}>}
 */
function getCustomFavoriteList(page, size, categoryId) {
  let query = `?page=${page}&size=${size}`
  if (categoryId) query += '&categoryId=' + categoryId
  return request('/custom/favorite/list' + query, 'GET')
}

/**
 * 删除自主题库收藏
 * @param {number} questionId  自主题目ID
 * @returns {Promise<{deleted}>}
 */
function deleteCustomFavorite(questionId) {
  return request('/custom/favorite/delete', 'POST', { questionId })
}

/* -------------------- 自主题库错题本 -------------------- */

/**
 * 自主题库错题列表（需登录，分页+分类筛选）
 * @param {number} page        页码（从1开始）
 * @param {number} size        每页条数
 * @param {number} categoryId  分类ID（可选，不传或0表示全部）
 * @returns {Promise<{total, list}>}
 */
function getCustomWrongList(page, size, categoryId) {
  let query = `?page=${page}&size=${size}`
  if (categoryId) query += '&categoryId=' + categoryId
  return request('/custom/wrong/list' + query, 'GET')
}

/**
 * 删除自主题库错题（从错题本中移除）
 * @param {number} questionId  自主题目ID
 * @returns {Promise<{deleted}>}
 */
function deleteCustomWrongQuestion(questionId) {
  return request('/custom/wrong/delete', 'POST', { questionId })
}

/* -------------------- 用户资料（昵称与头像） -------------------- */

/**
 * 修改昵称（需登录）
 * @param {string} nickName  新昵称（最长8个字符）
 * @returns {Promise<{nickName}>}
 */
function updateProfile(nickName) {
  return request('/user/profile', 'POST', { nickName })
}

/**
 * 上传头像（需登录）
 * 注意：此函数使用 wx.uploadFile，不走通用 request 封装
 * @param {string} filePath  本地临时文件路径（chooseAvatar / chooseMedia 返回）
 * @returns {Promise<{avatarUrl}>}
 */
function uploadAvatar(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + '/user/avatar',
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': wx.getStorageSync('token') || ''
      },
      success(res) {
        const body = JSON.parse(res.data)
        if (body.code === 200) {
          resolve(body.data)
        } else {
          reject(body)
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

/**
 * 同时修改头像和昵称（需登录，推荐）
 * 注意：此函数使用 wx.uploadFile，不走通用 request 封装
 * @param {string} filePath    本地临时文件路径（不传或为空表示不修改头像）
 * @param {string} nickName    新昵称（不传或为空表示不修改昵称）
 * @returns {Promise<{nickName, avatar}>}
 */
function updateProfileWithAvatar(filePath, nickName) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE_URL + '/user/profile/update',
      filePath: filePath || '',
      name: 'file',
      header: {
        'Authorization': wx.getStorageSync('token') || ''
      },
      formData: nickName ? { nickName: nickName } : {},
      success(res) {
        const body = JSON.parse(res.data)
        if (body.code === 200) {
          resolve(body.data)
        } else {
          reject(body)
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

/* -------------------- 每日刷题提醒（订阅消息，需登录） -------------------- */
// 配套后端 ReminderController：把授权额度 / 开关 / 提醒时间同步到服务端，
// 由后端定时任务调用微信 subscribe/send 完成实际下发。
// 所有接口失败时静默 reject，由调用方按需处理（一般不影响主流程）。

/**
 * 上报订阅授权结果（用户点「允许」后调用）
 * @param {number} acceptedCount  本次被允许的模板数
 * @returns {Promise<object>} 服务端最新状态（enabled/remainCount/...）
 */
function reportReminderAuth(acceptedCount) {
  return request('/reminder/auth', 'POST', { acceptedCount: acceptedCount || 0 })
}

/**
 * 开启每日提醒
 * @returns {Promise<object>} 服务端最新状态
 */
function enableReminder() {
  return request('/reminder/enable', 'POST', {})
}

/**
 * 关闭每日提醒（不清空已累积的授权额度，重新开启后可继续下发）
 * @returns {Promise<object>} 服务端最新状态
 */
function disableReminder() {
  return request('/reminder/disable', 'POST', {})
}

/**
 * 设置提醒时间
 * @param {number} hour    0-23
 * @param {number} minute  0-59
 * @returns {Promise<object>} 服务端最新状态
 */
function setReminderTime(hour, minute) {
  return request('/reminder/time', 'POST', { hour: hour, minute: minute })
}

/**
 * 查询当前提醒状态（前端展示用）
 * @returns {Promise<object>} { enabled, remainCount, totalAuthCount, totalSentCount,
 *                               remindHour, remindMinute, remindTimeValue }
 */
function getReminderState() {
  return request('/reminder/state', 'GET')
}

/* -------------------- 学习报告（云端聚合） -------------------- */
// 后端已就绪：判题时由 QuestionServiceImpl / CustomQuestionServiceImpl 调用
// reportService.recordAnswer(...) 落库到 report_daily_snapshot / report_subject_daily。
// 前端原报告页只读本地 reportStats，清缓存即丢失；下面这套接口切到服务端聚合源。

/**
 * 获取科目正确率（服务端按科目维度聚合）
 * @param {string} startDate  YYYY-MM-DD（必填）
 * @param {string} endDate    YYYY-MM-DD（必填，跨度 ≤ 90 天）
 * @returns {Promise<object>} 后端契约：数组或对象形式皆可，适配器层会统一处理
 *                             形态一：[{ subject, total, correct }] / [{ name, total, correct }]
 *                             形态二：{ 科目名: { total, correct } }
 */
function getSubjectAccuracy(startDate, endDate) {
  const sd = encodeURIComponent(startDate)
  const ed = encodeURIComponent(endDate)
  return request('/report/subject-accuracy?start_date=' + sd + '&end_date=' + ed, 'GET')
}

/**
 * 获取答题时段分布
 * @param {number} days      最近 N 天
 * @param {string} bucket    'hour' = 24 小时粒度（对前端 hours）
 *                             'section' = 4 大段（凌晨/上午/下午/晚上，对前端 periods）
 * @returns {Promise<object>} hour 形态：{ "0": n, "1": n, ..., "23": n } 或 [{hour, count}]
 *                             section 形态：[{name, count, pct}] 或 [{section, count}]
 */
function getTimeDistribution(days, bucket) {
  return request('/report/time-distribution?days=' + days + '&bucket=' + bucket, 'GET')
}

/**
 * 获取报告概要（连续打卡、总题数、最佳时段等聚合指标）
 * 后端 best_section 字段要求样本 ≥ 10 才返回，否则为 null
 * @returns {Promise<object>}
 */
function getReportSummary() {
  return request('/report/summary', 'GET')
}

/**
 * 获取热力图（按日题数）
 * @param {number} days  7 或 30
 * @returns {Promise<object>} 形态：{ 'YYYY-MM-DD': count }
 */
function getReportHeatmap(days) {
  return request('/report/heatmap?days=' + days, 'GET')
}

/**
 * 把本地 reportStats 迁移到服务端（后端实现幂等：相同快照重复迁移不会重复计数）
 * 用于一次性把清缓存前的本地累积数据补齐到云端。
 * @param {object} data  后端契约：{ dailySnapshots, subjectDaily } 或现有 reportStats 结构
 * @returns {Promise<{migrated: number, skipped: number}>}
 */
function migrateReportData(data) {
  return request('/report/migrate', 'POST', data)
}

// ========== 导出所有接口 ==========
// 页面里这样使用：
//   const api = require('../../utils/api.js')
//   api.getRandomQuestion().then(data => { ... })
module.exports = {
  wxLogin,
  getSubjectList,
  getRandomQuestion,
  judgeQuestion,
  toggleFavorite,
  deleteFavorite,
  deleteWrongQuestion,
  getFavoriteList,
  getWrongList,
  getUserInfo,
  getRankList,
  likeRankUser,
  getConfigInfo,
  // 每日刷题提醒（订阅消息）
  reportReminderAuth,
  enableReminder,
  disableReminder,
  setReminderTime,
  getReminderState,
  // 学习报告（云端聚合）
  getSubjectAccuracy,
  getTimeDistribution,
  getReportSummary,
  getReportHeatmap,
  migrateReportData,
  // 文件上传 & 自主题库
  getUploadQuota,
  uploadFile,
  uploadText,
  getUploadTaskStatus,
  getUploadRecordList,
  importQuestionsFromText,
  importQuestionsFromFile,
  getCustomRandomQuestion,
  judgeCustomQuestion,
  getCustomQuestionList,
  deleteCustomQuestion,
  deleteAllCustomQuestions,
  // 自主题库分类管理
  getCustomCategoryList,
  createCustomCategory,
  deleteCustomCategory,
  renameCustomCategory,
  updateCustomQuestionCategory,
  // 自主题库收藏
  toggleCustomFavorite,
  getCustomFavoriteList,
  deleteCustomFavorite,
  // 自主题库错题本
  getCustomWrongList,
  deleteCustomWrongQuestion,
  // 用户资料（昵称与头像）
  updateProfile,
  uploadAvatar,
  updateProfileWithAvatar
}
