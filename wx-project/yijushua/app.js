/**
 * 小程序全局逻辑
 * --------------------------------------------------
 * App() 是整个小程序的入口，只执行一次（小程序启动时）
 *
 * 全局数据放在 globalData 里，任何页面都能通过
 * getApp().globalData.xxx 来读取
 */

const api = require('./utils/api.js')
const bgm = require('./utils/bgm.js')

App({
  /**
   * 全局数据仓库
   */
  globalData: {
    userInfo: null,
    systemInfo: null,
    pendingTasks: [],      // 后台生成中的任务列表 [{ taskId, fileName }]
    taskPollTimer: null,   // 全局轮询定时器
    selectedTab: 0,        // 当前选中的 tab 索引（供 tabBar 组件初始化用）
    bgm: bgm,              // 全局 BGM 管理器（各页通过 getApp().globalData.bgm 调用）
    // 预拉取的首题槽：进入刷题页前预热，减少首题白屏
    // 结构: { signature, question, expire }
    // signature 由 quizType/subjectId/difficulty/style 拼成，用于校验是否匹配当前请求
    // expire 是过期时间戳（默认 30s），过期则忽略避免拿陈旧数据
    preloadedFirstQuestion: null
  },

  /**
   * 全局主题同步 — 切换夜间模式时，立即更新所有已创建的 tab 页主题数据
   * 解决：页面 A 切换夜间模式后，切到已在浅色模式下创建的页面 B 时闪白
   * 原理：getCurrentPages() 拿到所有页面实例，同步 setData 更新它们的 darkMode，
   *       这样切换动画的第一帧就已经是正确的夜间模式了
   *
   * 性能优化：
   * 1. 页面数据同步（必须立即执行，否则切页闪屏）
   * 2. 原生 API（导航栏 / 背景色）延迟到 550ms 动画结束后调用，
   *    避免与 clip-path 过渡动画竞争主线程，减少掉帧
   */
  syncThemeToAllPages(darkMode, exceptRoute) {
    // 第一优先级：同步所有页面的渲染数据（立即执行，保证切页不闪屏）
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (exceptRoute && page.route === exceptRoute) return
      if (!page.setData) return
      page.setData({
        darkMode: darkMode,
        darkLayerVisible: darkMode,
        // 稳定态统一用 circle(3000px at 50% 50%)，与各页面 onShow 的稳定态保持一致。
        // 若这里改用 inset(0)，页面下次 onShow 把 clip-path 复位成 circle 时，
        // inset ↔ circle 形状类型不同、无法平滑插值，复位瞬间会闪一帧。
        darkClipPath: darkMode ? 'circle(3000px at 50% 50%)' : 'circle(0px at 50% 50%)',
        themeApplied: darkMode
      })
    })
    // 第二优先级：原生导航栏/背景色延迟到动画结束后执行
    // （与当前页的 applyNavBar 去重，避免同一帧内多次调用原生 API 造成卡顿）
    setTimeout(() => {
      wx.setNavigationBarColor({
        frontColor: darkMode ? '#ffffff' : '#000000',
        backgroundColor: darkMode ? '#1a1a1a' : '#ffffff'
      })
      const bgColor = darkMode ? '#1a1a1a' : '#f5f6f8'
      wx.setBackgroundColor({
        backgroundColor: bgColor,
        backgroundColorTop: bgColor,
        backgroundColorBottom: bgColor
      })
    }, 580)
  },

  /**
   * 小程序启动时执行（只执行一次）
   */
  onLaunch() {
    // 主题相关的原生外观（导航栏 / 窗口背景色）在启动时就按已保存的主题落地：
    // 之后每次 push 新页面，原生窗口都直接按当前主题创建，
    // 不会先用 app.json 里的浅色画一帧 —— 深色模式切页"闪白"的根源之一。
    // （各页面 onLoad 里也会各自 applyNavBar 兜底，这里只是把时间点提前到最早）
    const dark = wx.getStorageSync('darkMode') === true
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#1a1a1a' : '#ffffff'
    })
    const bg = dark ? '#1a1a1a' : '#f5f6f8'
    wx.setBackgroundColor({
      backgroundColor: bg,
      backgroundColorTop: bg,
      backgroundColorBottom: bg
    })

    const winInfo = wx.getWindowInfo()
    const deviceInfo = wx.getDeviceInfo()
    const appBaseInfo = wx.getAppBaseInfo()
    this.globalData.systemInfo = {
      ...winInfo,
      ...deviceInfo,
      ...appBaseInfo
    }
    // 初始化 BGM 管理器（仅读取设置，不自动播放）
    bgm.init()
  },

  /**
   * 添加一个后台生成任务，开始全局轮询
   */
  addPendingTask(taskId, fileName) {
    this.globalData.pendingTasks.push({ taskId, fileName, startTime: Date.now() })
    if (!this.globalData.taskPollTimer) {
      this.startTaskPolling()
    }
  },

  /**
   * 启动全局轮询（每 5 秒检查一次所有待处理任务）
   */
  startTaskPolling() {
    this.globalData.taskPollTimer = setInterval(() => {
      const tasks = this.globalData.pendingTasks
      if (tasks.length === 0) {
        this.stopTaskPolling()
        return
      }

      // 遍历所有待处理任务（从后往前删，避免索引错位）
      for (let i = tasks.length - 1; i >= 0; i--) {
        const task = tasks[i]
        api.getUploadTaskStatus(task.taskId).then(data => {
          if (data.status === 1) {
            // 生成成功
            tasks.splice(tasks.indexOf(task), 1)
            this.loadQuotaRefresh()
            wx.showModal({
              title: '题目生成成功',
              content: '「' + task.fileName + '」成功生成 ' + data.questionCount + ' 道题，是否前往刷题？',
              confirmText: '去刷题',
              cancelText: '稍后',
              success: (res) => {
                if (res.confirm) {
                  wx.navigateTo({ url: '/pages/custom/custom' })
                }
              }
            })
          } else if (data.status === 2) {
            // 生成失败
            tasks.splice(tasks.indexOf(task), 1)
            wx.showModal({
              title: '题目生成失败',
              content: '「' + task.fileName + '」' + (data.failReason || '生成失败'),
              showCancel: false,
              confirmText: '知道了'
            })
          }
          // status === 0 继续等待
        }).catch(() => {})
      }

      // 所有任务完成则停止轮询
      if (this.globalData.pendingTasks.length === 0) {
        this.stopTaskPolling()
      }
    }, 5000)
  },

  /**
   * 停止全局轮询
   */
  stopTaskPolling() {
    if (this.globalData.taskPollTimer) {
      clearInterval(this.globalData.taskPollTimer)
      this.globalData.taskPollTimer = null
    }
  },

  /**
   * 通知上传页面刷新配额（如果有页面在监听）
   */
  loadQuotaRefresh() {
    // 触发事件让当前可见的 upload 页面刷新配额
    const pages = getCurrentPages()
    const uploadPage = pages.find(p => p.route === 'pages/upload/upload')
    if (uploadPage && uploadPage.loadQuota) {
      uploadPage.loadQuota()
    }
  }
})
