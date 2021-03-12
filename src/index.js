/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert, warn } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'
import { handleScroll } from './util/scroll'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

import { isNavigationFailure, NavigationFailureType } from './util/errors'

export default class VueRouter {
  // 遵循vue的规范提供install方法
  static install: () => void
  // 版本
  static version: string
  // 检测导航故障，参照 https://router.vuejs.org/zh/guide/advanced/navigation-failures.html#%E6%A3%80%E6%B5%8B%E5%AF%BC%E8%88%AA%E6%95%85%E9%9A%9C
  static isNavigationFailure: Function
  // 导航错误的类型
  static NavigationFailureType: any
  static START_LOCATION: Route

  // 配置了 router 的 Vue 根实例。
  app: any
  apps: Array<any>
  ready: boolean
  readyCbs: Array<Function>
  // 路由配置,保存初始化的时候传入的配置
  options: RouterOptions
  // 路由模式
  mode: string
  history: HashHistory | HTML5History | AbstractHistory
  // 路由匹配器
  matcher: Matcher
  // 当浏览器不支持 history.pushState 控制路由是否应该回退到 hash 模式。默认值为 true。
  fallback: boolean
  beforeHooks: Array<?NavigationGuard>
  resolveHooks: Array<?NavigationGuard>
  afterHooks: Array<?AfterNavigationHook>

  constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    // 初始化一些内部的hook
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 转换配置，可以用test/unit/specs/create-matcher.spec.js跑一下测试用例，debug看看就了解了
    this.matcher = createMatcher(options.routes || [], this)

    // 默认的路由模式
    let mode = options.mode || 'hash'
    // 路由的兼容降级
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    // 服务端的路由配置初始化
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    // 基于路由的模式创建不同的路由
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  // router.match(location) 的返回值就是路由对象
  match (raw: RawLocation, current?: Route, redirectedFrom?: Location): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 获取当前的路由对象
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  // 初始化的检查， app就是vue root的实例,只有new Vue才会触发
  init (app: any /* Vue component instance */) {

    process.env.NODE_ENV !== 'production' &&
      assert(
        install.installed,
        `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
          `before creating root instance.`
      )

    // 保存Vue实例
    this.apps.push(app)

    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    // 避免内存泄漏，路由销毁的时候就移除对应的vue实例
    // 初始化销毁的钩子
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      // 如果是根实例就更新引用
      if (this.app === app) this.app = this.apps[0] || null

      // 无实例的时候，清除所有监听者
      if (!this.app) this.history.teardown()
    })

    // main app previously initialized
    // return as we don't need to set up new history listener
    // 已经初始化根实例就退出
    if (this.app) {
      return
    }

    // 保存根实例引用
    this.app = app

    const history = this.history

    // 以下两种模式初始化第一次的跳转
    if (history instanceof HTML5History || history instanceof HashHistory) {
      // 初始化滚动函数，制定滚动到页面的哪个部分
      const handleInitialScroll = routeOrError => {
        const from = history.current
        const expectScroll = this.options.scrollBehavior
        const supportsScroll = supportsPushState && expectScroll

        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false)
        }
      }
      // 无论跳转成功还是失败都睡执行初始化滚动
      const setupListeners = routeOrError => {
        history.setupListeners()
        handleInitialScroll(routeOrError)
      }
      // 获取当前路由地址，跳转过去，后面两个分别为完成时和中断时执行的函数
      history.transitionTo(
        history.getCurrentLocation(),
        setupListeners,
        setupListeners
      )
    }

    // 注册history的回调函数，每次路由更新的时候为每个vue实例更新当前路由
    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route
      })
    })
  }

  // 钩子函数
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  // 钩子函数
  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  // 钩子函数
  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }

  // 该方法把一个回调排队，在路由完成初始导航时调用，这意味着它可以解析所有的异步进入钩子和路由初始化相关联的异步组件。
  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }

  // 注册一个回调，该回调会在路由导航过程中出错时被调用
  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }

  // 主动跳转路由
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    // 任务栈的推入

    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }

  // 路由重定向
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {


    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  // 后退一步记录，等同于 history.back()
  // router.go(-1)
  go (n: number) {
    this.history.go(n)
  }

  // 进一步封装
  back () {
    this.go(-1)
  }

  // 进一步封装
  forward () {
    this.go(1)
  }

  // 返回目标位置或是当前路由匹配的组件数组 (是数组的定义/构造类，不是实例)。通常在服务端渲染的数据预加载时使用。
  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply(
      [],
      route.matched.map(m => {
        return Object.keys(m.components).map(key => {
          return m.components[key]
        })
      })
    )
  }

  // 解析location，获得对应的路由的信息
  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    // 解析配置，具体怎么解析待会debug
    const location = normalizeLocation(to, current, append, this)
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }
  // 获取所有活跃的路由记录列表。

  getRoutes () {
    return this.matcher.getRoutes()
  }

  // 动态添加路由
  addRoute (parentOrRoute: string | RouteConfig, route?: RouteConfig) {
    this.matcher.addRoute(parentOrRoute, route)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }

  // 同上，已废弃
  addRoutes (routes: Array<RouteConfig>) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, 'router.addRoutes() is deprecated and has been removed in Vue Router 4. Use router.addRoute() instead.')
    }
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

// 注册一个hook，然后返回一个函数用于移除hook
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

// 转换href
function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

// 添加方法
VueRouter.install = install
VueRouter.version = '__VERSION__'
VueRouter.isNavigationFailure = isNavigationFailure
VueRouter.NavigationFailureType = NavigationFailureType
VueRouter.START_LOCATION = START

// 非服务端的时候用Vue注册路由
if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
