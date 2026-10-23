/**
 * 首页（入口选择页）
 * --------------------------------------------------
 * 双层主题：浅色层 + 深色层（clip-path 圆形裁切）
 * 主题切换从触摸点圆形扩散，页面跳转从触摸点圆形展开
 */

const { create: createSwipe } = require('../../utils/swipe-tab')
const api = require('../../utils/api.js')
const onboarding = require('../../utils/onboarding.js')

/**
 * 每日一言文案池 — 按天轮换，给首页一点新鲜感
 */
const DAILY_QUOTES = [
  // ========== 第一组：原汁原味经典励志 ==========
  '再长的路，一步步也能走完。',
  '星光不问赶路人，时光不负有心人。',
  '日拱一卒无有尽，功不唐捐终入海。',
  '慢一点没关系，方向对就不怕远。',
  '种子破土前，都以为自己只是沙子。',
  '纸上得来终觉浅，绝知此事要躬行。',
  '每天进步一点点，就是复利开始。',
  '所谓天赋，是把热爱坚持到最后。',
  '把简单的事做到极致，就是不简单。',
  '成功没有捷径，只有日复一日。',
  '你只管努力，时间会给你答案。',
  '简单的事重复做，重复的事用心做。',
  '停下才是落后，慢点不算失败。',
  '种一棵树最好的时间是十年前，其次是现在。',
  '所有的毫不费力，背后都是拼尽全力。',
  '怕什么真理无穷，进一寸有一寸的欢喜。',
  '不要在最该奋斗的年纪，选择安逸。',
  '没有所谓运气，只有默默积累。',
  '坚持下去，坚持才有希望。',
  '与其临渊羡鱼，不如退而结网。',
  '成长就是把哭声调成了静音。',
  '凡是过往，皆为序章。',
  '走得慢没关系，别迷失方向。',
  '真正的高手，都在下笨功夫。',
  '不怕慢，就怕站；不怕难，就怕懒。',
  '所有的好运，都是努力的伏笔。',
  '别让未来的你，讨厌现在的自己。',
  '人生的分水岭，往往藏在看不见的坚持里。',
  '不必很厉害才开始，开始了才厉害。',
  '每一个不曾起舞的日子，都是对生命的辜负。',
  '把目标刻在心里，把行动落在脚下。',

  // ========== 第二组：刷题主题励志（紧扣刷题特色） ==========
  '今天刷的题，是明天的底气。',
  '基础不牢，地动山摇。',
  '把刷题变习惯，让优秀成常态。',
  '会做题是本事，讲清楚是功夫。',
  '收藏百篇干货，不如吃透一道真题。',
  '昨天的满分，不妨碍今天从零开始。',
  '刷题如登山，一步一景，山顶见。',
  '知识的复利，比任何投资都可靠。',
  '把大目标拆小，把小任务做好。',
  '每一道错题，都是经验包。',
  '一天十道题，一年一场蜕变。',
  '多刷一道题，少走一段弯路。',
  '错题不是失败的标记，是通往正确的路标。',
  '刷题不在多，在于每道都搞懂。',
  '题海无边，方法是岸。',
  '把错题本写厚，把梦想写实现。',
  '每一道题，都是和未来的自己对话。',
  '不怕题难，就怕题不难。',
  '今天多刷一题，明天少求一人。',
  '题刷百遍，其义自见。',
  '一题不会不要慌，十题不会补基础。',
  '刷题三件套：动手、思考、复盘。',
  '每天清空一道错题，离上岸就近一步。',
  '别人刷剧你刷题，差距就是这么拉开的。',
  '题目会辜负你，但刷过的题不会。',
  '不怕起点低，就怕不刷题。',
  '一题一世界，一卷一乾坤。',
  '每天刷题一小时，未来多一种可能。',
  '刷题刷的不是数量，是手感。',
  '错题重做一遍，胜过新题做十道。',
  '刷过的题，都会变成你的底气。',
  '题海里游过泳，上岸时才不慌。',
  '一道难题，就是一次升级的机会。',
  '刷题时流的汗，都是上岸时的甜。',
  '把每道题，都当作面试官的提问。',
  '刷题千日，用在一时。',
  '不刷题的人，永远在为刷题的人让路。',
  '每天进步的不是分数，是自己。',
  '错题本越厚，离成功越近。',
  '刷遍天下题，不惧任何考。',
  '今天啃下的难题，是明天的送分题。',
  '刷题如练剑，日久见锋芒。',
  '每刷一题，都是在为未来铺路。',
  '不怕题型多变，就怕基础不牢。',
  '今日刷题人，明日上岸人。',
  '一道题反复刷，胜过十道题走马观花。',
  '错题本里的每一页，都是逆袭的伏笔。',
  '开始难，坚持更难，放弃最可惜。',
  '把每一道错题，都吃透成一道对题。',
  '今日不刷题，明日徒伤悲。',
  '别人刷剧你刷题，这就是你和别人的差距。',

  // ========== 第三组：励志 + 程序员幽默融合（积极战胜向） ==========
  '调试的是代码，修行的是耐心。',
  '代码敲够一万行，bug 见你都绕道。',
  '算法虐我千百遍，我待算法如初恋。',
  '今天的你，依旧没有被 bug 打败。',
  '翻过屎山代码，刷遍题海茫茫。',
  '愿你 debug 快过 bug 生长。',
  'bug 打不败你，只会让你更强大。',
  '一行一行敲下去，bug 一个一个消灭掉。',
  '把每个 bug，都当作升级的经验值。',
  '写代码的人很多，坚持刷题的很少。',
  '算法不是天书，刷多了就是童话。',
  '你的代码能跑，你的梦想也能跑。',
  '写代码靠手感，刷题靠坚持。',
  '把每次报错，都当成前进的路标。',
  'bug 会迟到，但被你消灭从不缺席。',
  '你和高手的距离，可能只差一千道题。',
  '代码要有注释，人生要有目标。',
  '翻过这座 bug 山，刷遍那片题海。',
  '每一次 commit，都是对自己的承诺。',
  '写得了代码，扛得住面试，你就是主角。',
  '把算法刷成肌肉记忆，把坚持变成生活习惯。',
  '你解的不只是 bug，还有人生。',
  '刷题如 debug，找出错因，一遍就过。',
  '你的努力会被看见，就像你的代码会被运行。',
  'bug 是暂时的，成长是永久的。',
  '愿你的代码没有报错，愿你的刷题没有瓶颈。',
  '一手好代码，一手好题目，未来由你定义。',
  '程序员只会说：再调试一下。',
  '人生没有 else，只有不断前进。',
  '今天刷的题，是写给未来的代码。'
]

/** 取当天轮换的文案与日期文案 */
function getDailyInfo() {
  const now = new Date()
  const weekNames = ['日', '一', '二', '三', '四', '五', '六']
  const yearStart = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now - yearStart) / 86400000)
  return {
    quote: DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length],
    dateText: (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + weekNames[now.getDay()]
  }
}

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
    darkMode: _darkMode,
    fontScale: 'medium',    // 适老化字号（small/medium/large），在 onShow 中读取
    darkLayerVisible: _darkMode,
    darkClipPath: _darkMode ? 'circle(3000px at 50% 50%)' : 'circle(0px at 50% 50%)',
    themeAnimating: false,
    clipNoTransition: false,  // 短暂禁用过渡：用于无过渡地把 clip-path 圆心钉到触摸点
    revealing: false,
    revealX: 0,
    revealY: 0,
    pressedKey: '',     // 按压反馈：当前按下的入口卡片标识（驱动深色层副本显示反馈）
    swipeOffset: 0,
    swipeAnimating: false,
    bgmEnabled: false,   // 背景音乐开关
    customCountText: '上传资料，生成专属题库',   // 自主题库主推卡片动态文案（宫格半宽，保持单行）
    dailyQuote: '',      // 每日一言（按天轮换）
    todayText: '',       // 今日日期文案
    guideVisible: false, // 使用说明弹窗
    guideClosing: false, // 弹窗关闭中（播放退出动画）
    guideCopied: false,  // 网址是否已复制
    // ====== 新手引导（递进式分步，状态来自 utils/onboarding.js） ======
    onboardingStep: null,        // 当前应在首页显示的步骤对象（无则 null）
    onboardingStepIndex: 0,      // 当前步骤在 STEPS 中的序号（用于展示「02 / 05」与进度条）
    onboardingTotal: 5,          // 步骤总数（用于展示进度）
    onboardingClosing: false,    // 引导卡片退出动画
    onboardingSpotlight: null,   // 高亮目标的几何信息 { left, top, width, height }
    onboardingBubblePlacement: 'bottom',  // 气泡位置：'bottom'（默认）或 'top'，根据 spotlight 位置动态计算
    onboardingRecallVisible: false, // 召回面板（在「新手引导」入口被点击时打开）
    onboardingRecallSteps: [],   // 召回面板展示的全部步骤清单
    onboardingRecallCompleted: [], // 召回面板展示的已完成步骤 id 列表
    onboardingRecallProgress: null, // 召回面板展示的进度对象
    showOnboardingRecallEntry: false, // 是否在顶部展示「新手引导」入口（仅 finished 后显示）
    // ====== 游客模式升级提示 ======
    guestUpgradeVisible: false, // 升级提示是否显示
    guestAnswerCount: 0         // 游客已答题数
  },

  onLoad() {
    applyNavBar(_darkMode)
    this.swipeMgr = createSwipe(this, 0)
    this._scrollTop = 0   // 当前页面滚动距离（onPageScroll 同步），用于主题切换圆心定位
    const daily = getDailyInfo()
    this.setData({ dailyQuote: daily.quote, todayText: daily.dateText })
    // 首次启动：初始化新手引导状态（仅本机第一次访问会写入「未开始」状态）
    onboarding.initIfNeeded()
  },

  // 跟踪页面滚动距离 —— 首页现在支持整页滚动（iPad 等小高度设备可见每日一言/备案号），
  // 主题切换的 clip-path 圆心需要用「触摸点 clientY + scrollTop」换算到 dark-layer 本地坐标，
  // 否则滚动到底部再点主题按钮时，扩散圆会从屏幕上方飘下来（与按钮位置错位）。
  onPageScroll(e) {
    this._scrollTop = e.scrollTop || 0
  },

  onHide() {
    if (this.swipeMgr) this.swipeMgr.cleanup()
    this._clearGuideTimer()
    this._clearOnboardingClosingTimer()
  },

  onUnload() {
    this._clearGuideTimer()
    this._clearOnboardingClosingTimer()
  },

  onShow() {
    const darkMode = wx.getStorageSync('darkMode') === true
    const fontScale = wx.getStorageSync('fontScale') || 'medium'
    applyNavBar(darkMode)
    this.setData({
      darkMode,
      fontScale,
      darkLayerVisible: darkMode,
      darkClipPath: darkMode ? 'circle(3000px at 50% 50%)' : 'circle(0px at 50% 50%)',
      revealing: false,
      pressedKey: '',
      bgmEnabled: getApp().globalData.bgm.isEnabled()
    })
    // 刷新每日一言（跨天后再次进入首页时自动更新）
    const daily = getDailyInfo()
    if (this.data.dailyQuote !== daily.quote || this.data.todayText !== daily.dateText) {
      this.setData({ dailyQuote: daily.quote, todayText: daily.dateText })
    }
    // 同步底部导航栏选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected(0)
      this.getTabBar().syncTheme(darkMode)
    }
    // 刷新自主题库题数（登录后展示"我的题库 · N 道题"）
    this.loadCustomCount()
    // 同步新手引导状态：可能需要在本页显示当前步骤，也可能只需暴露「新手引导」入口
    this._syncOnboarding()
    // 游客模式升级提示：未登录且有本地答题积累时弹出一次
    this._tryShowGuestUpgrade()
  },

  /**
   * 同步新手引导状态
   * ------------------------------------------------------------
   * - 若当前步骤属于首页 → 渲染该步骤的引导气泡（含可选高亮目标）
   * - 若当前步骤属于其它页面 → 仅渲染召回入口（用户可点开召回面板查看进度）
   * - 若整段引导已结束 → 渲染召回入口（用户可随时重新打开引导）
   */
  _syncOnboarding() {
    const allSteps = onboarding.getAllSteps()
    const completedIds = onboarding.getCompletedStepIds()
    const progress = onboarding.getProgress()
    const showEntry = onboarding.isFinished() ||
                      !!onboarding.getStepForPage('pages/home/home') ||
                      !!progress.currentStep  // 进行中：也提供入口便于查看进度

    // 计算当前步骤索引（用于「02 / 05」展示）
    const step = onboarding.getStepForPage('pages/home/home')
    let stepIndex = 0
    if (step) {
      const ids = allSteps.map(s => s.id)
      stepIndex = ids.indexOf(step.id)
    }

    this.setData({
      onboardingStep: step,
      onboardingStepIndex: stepIndex,
      onboardingTotal: allSteps.length,
      onboardingSpotlight: null,
      onboardingBubblePlacement: 'bottom',
      onboardingClosing: false,
      showOnboardingRecallEntry: showEntry
    })

    // 若该步骤需要高亮某个目标元素，等渲染完成后测量其位置
    if (step && step.target) {
      setTimeout(() => this._measureOnboardingTarget(step.target), 120)
    }
  },

  /**
   * 测量高亮目标的屏幕坐标，用于绘制 spotlight 蒙层
   * 同时根据 spotlight 的纵向位置动态决定气泡放在上方还是下方，
   * 避免与高亮方框发生重叠（修复用户反馈的重叠遮挡问题）
   */
  _measureOnboardingTarget(target) {
    const selMap = {
      'custom-quiz': '.js-entry-custom'
    }
    const sel = selMap[target] || '.js-entry-' + target
    wx.createSelectorQuery()
      .selectAll(sel)
      .boundingClientRect()
      .exec(res => {
        const rects = res && res[0]
        if (!rects || !rects.length) return
        // 双层主题中两个同类的卡片会同时被选中，取第一个（浅色层）
        const r = rects[0]
        if (!r || !r.width) return

        // 获取屏幕尺寸，用于判断 spotlight 在屏幕的上半部还是下半部
        let screenH = 800
        try {
          const info = wx.getWindowInfo && wx.getWindowInfo()
          if (info && info.windowHeight) screenH = info.windowHeight
        } catch (e) {}

        const spotCenterY = r.top + r.height / 2
        const isUpperHalf = spotCenterY < screenH / 2

        // 给 spotlight 加一点外扩 padding，避免边框紧贴卡片影响美观
        // （宫格卡片圆角更大、尺寸更小，外扩略加大，高亮框才不会压到卡片边缘）
        const pad = 9
        this.setData({
          onboardingSpotlight: {
            left: r.left - pad,
            top: r.top - pad,
            width: r.width + pad * 2,
            height: r.height + pad * 2
          },
          // 气泡放在 spotlight 的对侧（spotlight 在上半 → 气泡放下方；反之放上方）
          onboardingBubblePlacement: isUpperHalf ? 'bottom' : 'top'
        })
      })
  },

  /**
   * 点击引导气泡的主按钮（「开始引导」「我知道了」「完成」等）
   * - 若步骤需要点击高亮目标才完成 → 仅关闭气泡，让用户去点真实目标
   * - 否则 → 直接标记完成并推进
   */
  onOnboardingPrimary() {
    const step = this.data.onboardingStep
    if (!step) return
    if (step.completeOnTargetTap) {
      // 不推进，仅给出操作预期提示
      wx.showToast({ title: '请点击高亮的卡片', icon: 'none', duration: 1200 })
      return
    }
    onboarding.completeCurrentStep()
    this._afterOnboardingChange()
  },

  /**
   * 点击引导气泡的次按钮（「跳过」「下次再说」等）
   * - secondarySkip=true → 整段跳过
   * - 否则 → 仅跳过当前步骤
   */
  onOnboardingSecondary() {
    const step = this.data.onboardingStep
    if (!step) return
    if (step.secondarySkip) {
      onboarding.skipAll()
    } else {
      onboarding.skipCurrentStep()
    }
    this._afterOnboardingChange()
  },

  /**
   * 用户点击 spotlight 区域（即被高亮的真实入口卡片）
   * 用于 completeOnTargetTap=true 的步骤：一次点击同时完成步骤并触发原入口的跳转
   */
  onOnboardingTargetTap(e) {
    const step = this.data.onboardingStep
    if (!step || !step.completeOnTargetTap) {
      // 没有引导或不是「点目标完成」类型 → 让事件冒泡到真实入口
      return
    }
    // 实时反馈：先标记完成 + 触觉反馈
    onboarding.completeCurrentStep()
    try { wx.vibrateShort({ type: 'light', fail: () => {} }) } catch (e) {}
    this._afterOnboardingChange()
    // 然后触发对应的导航动作（与原入口 catchtap 一致）
    if (step.target === 'custom-quiz') {
      this._revealAndNavigate(e, '/pages/custom-list/custom-list', 'custom')
    }
  },

  /**
   * 阻止引导蒙层的事件穿透到页面手势
   */
  onOnboardingNoop() {},

  /**
   * 引导状态变更后的统一收尾：关闭当前气泡 + 同步入口显示
   */
  _afterOnboardingChange() {
    this.setData({ onboardingClosing: true })
    this._clearOnboardingClosingTimer()
    this._onboardingClosingTimer = setTimeout(() => {
      this.setData({ onboardingClosing: false })
      this._syncOnboarding()
    }, 260)
  },

  /** 清理引导气泡退出动画定时器 */
  _clearOnboardingClosingTimer() {
    if (this._onboardingClosingTimer) {
      clearTimeout(this._onboardingClosingTimer)
      this._onboardingClosingTimer = null
    }
  },

  /**
   * 顶部「新手引导」入口被点击 → 打开召回面板
   */
  onOnboardingRecallOpen() {
    this.setData({
      onboardingRecallVisible: true,
      onboardingRecallSteps: onboarding.getAllSteps(),
      onboardingRecallCompleted: onboarding.getCompletedStepIds(),
      onboardingRecallProgress: onboarding.getProgress()
    })
  },

  /**
   * 召回面板 - 关闭
   */
  onOnboardingRecallClose() {
    this.setData({ onboardingRecallVisible: false })
  },

  /**
   * 召回面板 - 从断点继续（仅当前步骤不在首页时需要跳转）
   */
  onOnboardingRecallResume() {
    const progress = onboarding.getProgress()
    const step = progress && progress.currentStep
    this.setData({ onboardingRecallVisible: false })
    if (!step) return
    if (step.page === 'pages/home/home') {
      // 当前就在首页 → 直接刷新引导气泡
      this._syncOnboarding()
    } else if (step.page === 'pages/custom-list/custom-list') {
      // 断点在自主题库列表页（custom-upload / custom-practice 两步）
      wx.navigateTo({ url: '/pages/custom-list/custom-list' })
    }
  },

  /**
   * 召回面板 - 重新开始整段引导
   */
  onOnboardingRecallRestart() {
    onboarding.startTour()
    this.setData({ onboardingRecallVisible: false })
    this._syncOnboarding()
  },

  /**
   * 游客升级提示 — 未登录且本地答过题（≥3 题）时，每次进入首页显示一次
   * 同一次访问内不会重复弹（_guestUpgradeShownInSession 标记位）
   */
  _tryShowGuestUpgrade() {
    if (this._guestUpgradeShownInSession) return
    if (wx.getStorageSync('token')) return
    let count = 0
    try { count = Number(wx.getStorageSync('guestAnswerCount')) || 0 } catch (e) {}
    if (count < 3) return
    this._guestUpgradeShownInSession = true
    this.setData({ guestUpgradeVisible: true, guestAnswerCount: count })
  },

  /**
   * 关闭游客升级提示（播退出动画）
   */
  onCloseGuestUpgrade() {
    if (!this.data.guestUpgradeVisible) return
    this.setData({ guestUpgradeVisible: false })
  },

  /**
   * 从首页游客提示直接跳到我的页面去登录
   */
  onGuestUpgradeLogin() {
    this.setData({ guestUpgradeVisible: false })
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  /**
   * 加载自主题库题目数 — 用于首页主推卡片文案
   * 未登录（游客）保持默认引导文案；请求失败静默处理，不打扰用户
   */
  loadCustomCount() {
    if (!wx.getStorageSync('token')) return
    api.getCustomQuestionList(1, 1).then(data => {
      const total = (data && data.total) || 0
      this.setData({
        customCountText: total > 0
          ? '我的题库 · ' + total + ' 道题'
          : '上传资料，生成专属题库'
      })
    }).catch(() => {})
  },

  /**
   * 强制渲染层提交当前 clip-path 起点，再回调开启扩散动画
   * ------------------------------------------------------------
   * 深色层常驻 DOM 后，clip-path 的过渡是"从上一帧的值"插值的。
   * 如果起点的 setData 还没被渲染层提交，就立刻下发终点，
   * 浏览器会拿上一个稳定态（circle(0 at 50% 50%)）当起点，
   * 圆心就会从屏幕中心飘向按钮 —— 看着就不像"以按钮为圆心扩散"。
   *
   * 这里用一次 selectorQuery 强制渲染层完成样式 / 布局计算，
   * 确认起点已落地后再（延后一帧）下发终点开启过渡。
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
   * 主题切换 — 从触摸点圆形扩散
   */
  onToggleTheme(e) {
    if (this.data.themeAnimating) return

    const touch = (e && e.changedTouches && e.changedTouches[0]) ||
                  (e && e.touches && e.touches[0])
    const x = touch ? touch.clientX : 180
    const y = touch ? touch.clientY : 60

    // 计算从触摸点到最远屏幕角落的距离
    const sys = wx.getWindowInfo()
    const dx = Math.max(x, sys.windowWidth - x)
    const dy = Math.max(y, sys.windowHeight - y)
    const maxRadius = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 80

    // 首页现已支持整页滚动（iPad 等小高度设备），dark-layer 是 .home-page 的 absolute 子元素，
    // 会随页面一起滚动；clip-path 的圆心坐标是相对 dark-layer 本地坐标系的，
    // 因此触摸点 Y 必须加上当前滚动距离，才能让扩散圆从按钮位置而非屏幕上方开始。
    const scrollTop = this._scrollTop || 0
    const localY = y + scrollTop

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
        darkLayerVisible: true,
        darkMode: true,
        darkClipPath: `circle(0px at ${x}px ${localY}px)`
      })
      // ② 起点提交后再开过渡扩散，圆心就是触摸点
      this._commitClipStart(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(${maxRadius}px at ${x}px ${localY}px)`
        })
        setTimeout(() => {
          // 收尾切回稳定态：扩散半径只覆盖一屏，而深色层高度=整页内容高度，
          // 不切回的话向下滚动会露出浅色底部。circle(3000px at 50% 50%) 与 onShow
          // 的稳定态完全一致，且形状仍是 circle（不做形状插值），用无过渡瞬间切换。
          this.setData({
            clipNoTransition: true,
            darkClipPath: 'circle(3000px at 50% 50%)'
          })
          // 解除 no-transition 放到下一帧，避免「clip-path 跳变」与图层重绘挤在同一帧。
          wx.nextTick(() => {
            this.setData({ clipNoTransition: false, themeAnimating: false })
            wx.setStorageSync('darkMode', true)
          })
        }, 580)
      })
    } else {
      // 深 → 浅：深色层收缩到触摸点
      // ① 同样先无过渡钉圆心：直接过渡会从上一个稳定态的圆心插值，收缩圆心会偏
      applyNavBar(false)
      this.setData({
        clipNoTransition: true,
        darkMode: false,
        darkClipPath: `circle(${maxRadius}px at ${x}px ${localY}px)`
      })
      // ② 起点提交后再开过渡收缩到触摸点
      this._commitClipStart(() => {
        this.setData({
          clipNoTransition: false,
          darkClipPath: `circle(0px at ${x}px ${localY}px)`
        })
        setTimeout(() => {
          this.setData({ darkLayerVisible: false, themeAnimating: false })
          wx.setStorageSync('darkMode', false)
        }, 580)
      })
    }
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
   * 进入随机刷题
   */
  onGoQuiz(e) {
    this._revealAndNavigate(e, '/pages/quiz-setup/quiz-setup', 'quiz')
  },

  /**
   * 进入代码题库
   */
  onGoCodeBank(e) {
    this._revealAndNavigate(e, '/pages/code-bank/code-bank', 'code')
  },

  /**
   * 进入企业面试题库
   */
  onGoInterviewBank(e) {
    this._revealAndNavigate(e, '/pages/interview-bank/interview-bank', 'interview')
  },

  /**
   * 进入自主题库列表
   */
  onGoCustom(e) {
    this._revealAndNavigate(e, '/pages/custom-list/custom-list', 'custom')
  },

  /**
   * 进入专项复习选择
   */
  onGoReview(e) {
    this._revealAndNavigate(e, '/pages/review-select/review-select', 'review')
  },

  /**
   * 联系我们 — 跳转到关于页面并滚动到联系区块
   */
  onContactTap(e) {
    this._revealAndNavigate(e, '/pages/about/about?focus=contact')
  },

  /**
   * 打开「使用说明」弹窗
   */
  onGuideTap() {
    this._clearGuideTimer()
    this.setData({ guideVisible: true, guideClosing: false, guideCopied: false })
  },

  /**
   * 关闭「使用说明」弹窗（先播退出动画，再卸载）
   */
  onCloseGuide() {
    if (!this.data.guideVisible || this.data.guideClosing) return
    this.setData({ guideClosing: true })
    this._clearGuideTimer()
    this._guideTimer = setTimeout(() => {
      this.setData({ guideVisible: false, guideClosing: false, guideCopied: false })
    }, 220)
  },

  /**
   * 一键复制官方网址 — 复制成功后按钮切换为「已复制」
   */
  onCopySite() {
    const SITE = 'flashq.site'
    wx.setClipboardData({
      data: SITE,
      success: () => {
        this.setData({ guideCopied: true })
        wx.vibrateShort({ type: 'light', fail: () => {} })
        this._clearGuideTimer()
        this._guideTimer = setTimeout(() => {
          this.setData({ guideCopied: false })
        }, 2400)
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请长按网址手动复制', icon: 'none' })
      }
    })
  },

  /**
   * 阻止弹窗区域的点击/滑动穿透到页面手势
   */
  onGuideNoop() {},

  /** 清理弹窗相关定时器 */
  _clearGuideTimer() {
    if (this._guideTimer) {
      clearTimeout(this._guideTimer)
      this._guideTimer = null
    }
  },

  /**
   * 复制备案号
   */
  onCopyICP() {
    wx.setClipboardData({
      data: '粤ICP备2026147363号-1X',
      success() {
        wx.showToast({ title: '备案号已复制', icon: 'success' })
      }
    })
  },

  /**
   * 从触摸点圆形展开，然后跳转
   */
  _revealAndNavigate(e, url, key) {
    if (this.data.revealing) return

    const touch = e && e.changedTouches && e.changedTouches[0]
    const x = touch ? touch.clientX : 187
    const y = touch ? touch.clientY : 333

    // pressedKey 驱动深色层卡片副本显示按压反馈
    // （深色层 pointer-events:none，hover-class 无法在其上触发，故由 JS 同步状态）
    this.setData({ revealing: true, revealX: x, revealY: y, pressedKey: key || '' })

    // 立即发起跳转：涟漪扩散的同时就开始切入新页面
    wx.navigateTo({ url })

    // 延时释放按压状态，让「缩小 → 回弹」完整呈现在页面切入动画期间
    if (key) {
      setTimeout(() => {
        this.setData({ pressedKey: '' })
      }, 250)
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
