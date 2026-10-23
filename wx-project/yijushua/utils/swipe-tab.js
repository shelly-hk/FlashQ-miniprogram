/**
 * Tab 页面滑动手势管理器
 * ==================================================
 * 功能：
 *   1. 手指拖动全程实时映射 translateX，画面与输入完全同步
 *   2. 方向锁定：首次判定后保持稳定，不与纵向滚动冲突
 *   3. 释放时综合「进度 + 速度 + 方向」三维判定完成/取消
 *   4. 快速甩动放宽进度阈值
 *   5. 释放后从当前进度自然过渡收尾
 *   6. 边界阻力效果（橡皮筋）
 *   7. 预览层：滑动时露出目标页背景色，避免白屏
 *   8. 路由跳转与预览分离，仅完成时提交一次
 *   9. 清理逻辑：中断/隐藏/卸载时清除残留状态
 */

// 各 Tab 页面背景色（用于滑动预览层）
var TAB_COLORS = [
  { light: '#E8F6F5', dark: '#1A2628' },  // 0 首页（蒂芙尼蓝）
  { light: '#E3EDF5', dark: '#0D1B2A' },  // 1 排行榜（普鲁士蓝）
  { light: '#E8ECF0', dark: '#161B22' }   // 2 我的（涧石蓝）
]

var TABS = [
  { index: 0, url: '/pages/home/home' },
  { index: 1, url: '/pages/rank/rank' },
  { index: 2, url: '/pages/mine/mine' }
]

// ── 参数 ──
var LOCK_DIST       = 10
var LOCK_RATIO      = 1.5
var VEL_THRESHOLD   = 0.4
var COMMIT_RATIO    = 0.3
var FAST_RATIO      = 0.12
var SPRING_MS       = 320
var EDGE_DAMP       = 0.25
var SETDATA_GAP     = 2

/**
 * 创建手势管理器
 * @param {Object} page    - Page 实例 (this)
 * @param {Number} tabIndex - 当前 tab 索引 (0/1/2)
 */
function create(page, tabIndex) {
  var screenW = 375
  try { screenW = wx.getWindowInfo().windowWidth } catch(e) {}

  var mgr = {
    _page: page,
    _tab: tabIndex,
    _screenW: screenW,
    _startX: 0,
    _startY: 0,
    _lastX: 0,
    _lastMs: 0,
    _offset: 0,
    _velocity: 0,
    _direction: null,
    _locked: false,
    _animating: false,
    _committed: false,
    _lastSet: 0,
    _targetTab: -1,       // 目标 Tab（用于预览颜色）

    // ────────────────────────────────
    //  touchstart
    // ────────────────────────────────
    onTouchStart: function(e) {
      if (this._animating) return
      var t = e.touches && e.touches[0]
      if (!t) return
      this._startX = t.clientX
      this._startY = t.clientY
      this._lastX = t.clientX
      this._lastMs = Date.now()
      this._offset = 0
      this._velocity = 0
      this._direction = null
      this._locked = false
      this._committed = false
      this._lastSet = 0
      this._targetTab = -1
    },

    // ────────────────────────────────
    //  touchmove — 实时映射 + 预览层
    // ────────────────────────────────
    onTouchMove: function(e) {
      if (this._animating || this._committed) return
      var t = e.touches && e.touches[0]
      if (!t) return

      var dx = t.clientX - this._startX
      var dy = t.clientY - this._startY

      // ── 方向锁定（仅一次） ──
      if (!this._locked) {
        if (Math.abs(dx) < LOCK_DIST && Math.abs(dy) < LOCK_DIST) return
        this._locked = true
        if (Math.abs(dx) > Math.abs(dy) * LOCK_RATIO) {
          this._direction = 'horizontal'
          // 确定目标 Tab 和预览颜色
          this._targetTab = dx < 0 ? this._tab + 1 : this._tab - 1
          if (this._targetTab >= 0 && this._targetTab < TABS.length) {
            var isDark = wx.getStorageSync('darkMode') === true
            var colors = TAB_COLORS[this._targetTab]
            var peekColor = isDark ? colors.dark : colors.light
            // 初始位置：目标在右侧→屏宽外，目标在左侧→负屏宽外
            var peekStart = dx < 0 ? this._screenW : -this._screenW
            this._page.setData({
              swipePeekVisible: true,
              swipePeekColor: peekColor,
              swipePeekOffset: peekStart
            })
          }
        } else {
          this._direction = 'vertical'
          return
        }
      }
      if (this._direction !== 'horizontal') return

      // ── 边界阻力 ──
      var offset = dx
      if (dx > 0 && this._tab === 0) offset = dx * EDGE_DAMP
      if (dx < 0 && this._tab === TABS.length - 1) offset = dx * EDGE_DAMP
      this._offset = offset

      // ── 瞬时速度 ──
      var now = Date.now()
      var dt = now - this._lastMs
      if (dt > 0) this._velocity = (t.clientX - this._lastX) / dt
      this._lastX = t.clientX
      this._lastMs = now

      // ── 节流 setData ──
      if (Math.abs(offset - this._lastSet) < SETDATA_GAP) return
      this._lastSet = offset

      // 计算预览层偏移：与当前页同步移动
      var peekOffset = null
      if (this._targetTab >= 0 && this._targetTab < TABS.length) {
        if (this._offset < 0) {
          // 目标在右：peek 从 screenW 移向 0
          peekOffset = this._screenW + this._offset
        } else {
          // 目标在左：peek 从 -screenW 移向 0
          peekOffset = -this._screenW + this._offset
        }
      }

      this._page.setData({
        swipeOffset: offset,
        swipeAnimating: false,
        swipePeekOffset: peekOffset
      })
    },

    // ────────────────────────────────
    //  touchend — 综合判定
    // ────────────────────────────────
    onTouchEnd: function(e) {
      if (this._animating || this._committed) return
      if (!this._locked || this._direction !== 'horizontal') {
        this._resetState()
        return
      }

      var absOffset = Math.abs(this._offset)
      var absV = Math.abs(this._velocity)
      var ratio = absOffset / this._screenW
      var isFast = absV > VEL_THRESHOLD

      var threshold = isFast ? FAST_RATIO : COMMIT_RATIO
      var canSwitch = this._canSwitch(this._offset)
      var shouldCommit = ratio > threshold && canSwitch

      if (shouldCommit) this._commit()
      else this._cancel()
    },

    onTouchCancel: function(e) {
      if (this._animating) return
      this._resetState()
    },

    // ────────────────────────────────
    //  内部方法
    // ────────────────────────────────

    _canSwitch: function(offset) {
      if (offset < 0) return this._tab < TABS.length - 1
      return this._tab > 0
    },

    _commit: function() {
      this._committed = true
      this._animating = true
      var self = this
      var dir = this._offset < 0 ? -1 : 1
      var targetOffset = dir * this._screenW

      // 预览层也同步滑入到位
      this._page.setData({
        swipeOffset: targetOffset,
        swipeAnimating: true,
        swipePeekOffset: 0
      })

      setTimeout(function() {
        var targetTab = self._tab + (dir < 0 ? 1 : -1)
        var tb = typeof self._page.getTabBar === 'function' ? self._page.getTabBar() : null
        if (tb) tb.syncSelected(targetTab)
        wx.switchTab({ url: TABS[targetTab].url })
      }, SPRING_MS)
    },

    _cancel: function() {
      var self = this
      this._animating = true
      // 页面回弹 + 预览层退回
      var peekBack = this._offset < 0 ? this._screenW : -this._screenW
      this._page.setData({
        swipeOffset: 0,
        swipeAnimating: true,
        swipePeekOffset: peekBack
      })
      setTimeout(function() {
        self._animating = false
        self._resetState()
      }, SPRING_MS)
    },

    _resetState: function() {
      this._locked = false
      this._direction = null
      this._offset = 0
      this._velocity = 0
      this._committed = false
      this._lastSet = 0
      this._targetTab = -1
      this._page.setData({
        swipeOffset: 0,
        swipeAnimating: false,
        swipePeekVisible: false,
        swipePeekOffset: 0
      })
    },

    cleanup: function() {
      this._animating = false
      this._committed = false
      this._resetState()
    }
  }

  page.setData({
    swipeOffset: 0,
    swipeAnimating: false,
    swipePeekVisible: false,
    swipePeekColor: '#ffffff',
    swipePeekOffset: 0
  })

  return mgr
}

module.exports = { create: create }
