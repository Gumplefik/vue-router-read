/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

export class HTML5History extends History {
  _startLocation: string

  constructor (router: Router, base: ?string) {
    super(router, base)

    this._startLocation = getLocation(this.base)
  }

  setupListeners () {
    // 有监听者就退出了
    if (this.listeners.length > 0) {
      return
    }

    const router = this.router
    // scrollBehavior是用来控制滚动行为的，举个例子，你跳转到b页面的时候，期望页面滚动到指定位置
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      this.listeners.push(setupScroll())
    }

    const handleRoutingEvent = () => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      const location = getLocation(this.base)
      // 如果是起始路由就直接退出
      if (this.current === START && location === this._startLocation) {
        return
      }

      this.transitionTo(location, route => {
        // 支持滚动的时候执行handleScroll，滚动到对应坐标
        if (supportsScroll) {
          handleScroll(router, route, current, true)
        }
      })
    }
    window.addEventListener('popstate', handleRoutingEvent)
    this.listeners.push(() => {
      window.removeEventListener('popstate', handleRoutingEvent)
    })
  }

  go (n: number) {
    window.history.go(n)
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      pushState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  ensureURL (push?: boolean) {
    // 如果location的地址路由的全路径不一样的话
    // 可能发生在大小写不一样的场景？不太确定场景是那种情况
    // 确定的是history的state一定没有写入
    if (getLocation(this.base) !== this.current.fullPath) {
      // 去除多个斜杠
      const current = cleanPath(this.base + this.current.fullPath)
      // 写入history和是替换
      // 其实方法都是调用的同一个，只是传参不一样
      push ? pushState(current) : replaceState(current)
    }
  }

  getCurrentLocation (): string {
    return getLocation(this.base)
  }
}

// 最终返回的是去除base的那一串地址
export function getLocation (base: string): string {
  // 获取path，不带query
  let path = window.location.pathname
  if (base && path.toLowerCase().indexOf(base.toLowerCase()) === 0) {
    // 截取整正的path
    path = path.slice(base.length)
  }
  // 拼装search和hash
  return (path || '/') + window.location.search + window.location.hash
}
