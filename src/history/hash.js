/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // check history fallback deeplinking
    // 路由降级
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash()
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  // listener实际上由于第一行的限制，size最大为1的，而保存的唯一一个函数则是清除popstate的监听器
  setupListeners () {
    if (this.listeners.length > 0) {
      return
    }

    const router = this.router
    // 获取滚动处理的函数
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    // 支持滚动和设置了滚动的时候就推入一个消费者
    if (supportsScroll) {
      // 初始化事件监听，这里存下的是事件清除器
      this.listeners.push(setupScroll())
    }

    const handleRoutingEvent = () => {
      // 获取当前路由
      const current = this.current
      // 路由不符合标准就跳过，ensure会重新推入路由的
      if (!ensureSlash()) {
        return
      }
      // 跳转路由
      this.transitionTo(getHash(), route => {
        if (supportsScroll) {
          // 滚动行为的处理
          handleScroll(this.router, route, current, true)
        }
        // 不支持pushState就手动更新href
        if (!supportsPushState) {
          replaceHash(route.fullPath)
        }
      })
    }
    // 事件降级，支持pushState就用popstate，不然就是hashchange
    const eventType = supportsPushState ? 'popstate' : 'hashchange'
    window.addEventListener(
      eventType,
      handleRoutingEvent
    )
    this.listeners.push(() => {
      window.removeEventListener(eventType, handleRoutingEvent)
    })
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        // 写入state
        pushHash(route.fullPath)
        // 滚动处理
        handleScroll(this.router, route, fromRoute, false)
        // 完成的钩子
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        // 从写state，就是替换最新的state
        replaceHash(route.fullPath)
        // 滚动处理
        handleScroll(this.router, route, fromRoute, false)
        // compelte函数执行
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  go (n: number) {
    window.history.go(n)
  }

  ensureURL (push?: boolean) {
    const current = this.current.fullPath
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  getCurrentLocation () {
    return getHash()
  }
}

// 手动替换路由为hash路由
function checkFallback (base) {
  const location = getLocation(base)
  if (!/^\/#/.test(location)) {
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

function ensureSlash (): boolean {
  // 得到hash路径
  const path = getHash()
  // 用斜杆开头的返回true
  if (path.charAt(0) === '/') {
    return true
  }
  // 写入state记录，replace模式
  replaceHash('/' + path)
  return false
}

// 返回hash，即#后面的字符
export function getHash (): string {
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  let href = window.location.href
  const index = href.indexOf('#')
  // empty path
  if (index < 0) return ''

  href = href.slice(index + 1)

  return href
}

// 拼接完整的url
function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

// 推入state状态
function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}

// 替换state状态
function replaceHash (path) {
  if (supportsPushState) {
    // 写入state记录
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
