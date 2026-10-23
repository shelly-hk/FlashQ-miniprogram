/**
 * 自定义底部导航栏
 * --------------------------------------------------
 * 指示器通过 CSS 百分比定位，点击瞬移，无滑动动画
 */

Component({
  data: {
    selected: 0,
    darkMode: false,
    tabs: [
      {
        pagePath: '/pages/home/home',
        text: '首页',
        icon: '/assets/tab-home-normal.png',
        activeIcon: '/assets/tab-home-active.png'
      },
      {
        pagePath: '/pages/rank/rank',
        text: '排行榜',
        icon: '/assets/tab-rank-normal.png',
        activeIcon: '/assets/tab-rank-active.png'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        icon: '/assets/tab-mine-normal.png',
        activeIcon: '/assets/tab-mine-active.png'
      }
    ]
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const currentTab = app && app.globalData && app.globalData.selectedTab
      if (currentTab !== undefined && currentTab !== null) {
        this.setData({ selected: currentTab })
      }
      const darkMode = wx.getStorageSync('darkMode') === true
      if (darkMode) {
        this.setData({ darkMode: true })
      }
    }
  },

  methods: {
    /**
     * 点击标签
     */
    onTabTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.selected) return

      this.setData({ selected: index })

      const app = getApp()
      if (app && app.globalData) app.globalData.selectedTab = index

      const url = this.data.tabs[index].pagePath
      wx.switchTab({ url })
    },

    /**
     * 页面 onShow 调用，同步选中状态
     */
    syncSelected(index) {
      const app = getApp()
      if (app && app.globalData) app.globalData.selectedTab = index

      if (index === this.data.selected) return

      this.setData({ selected: index })
    },

    /**
     * 同步深色模式（页面 onShow 调用）
     */
    syncTheme(darkMode) {
      this.setData({ darkMode: !!darkMode })
    }
  }
})
