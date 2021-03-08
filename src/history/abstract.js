/* @flow */

import type Router from '../index'
import { History } from './base'
import { NavigationFailureType, isNavigationFailure } from '../util/errors'

// 抽象路由，用于服务端渲染ssr
export class AbstractHistory extends History {
  index: number
  stack: Array<Route>

  constructor (router: Router, base: ?string) {
    super(router, base)
    this.stack = []
    this.index = -1
  }

  // 抽象路由的推入
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // 调用父级实现的过渡效果
    this.transitionTo(
      location,
      route => {
        this.stack = this.stack.slice(0, this.index + 1).concat(route)
        this.index++
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.transitionTo(
      location,
      route => {
        // 推入栈
        this.stack = this.stack.slice(0, this.index).concat(route)
        // 执行钩子函数
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  go (n: number) {
    const targetIndex = this.index + n
    // 超出索引退出
    if (targetIndex < 0 || targetIndex >= this.stack.length) {
      return
    }
    // 获得当前路由
    const route = this.stack[targetIndex]
    // 跳转
    this.confirmTransition(
      route,
      () => {
        const prev = this.current
        this.index = targetIndex
        this.updateRoute(route)
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })
      },
      err => {
        if (isNavigationFailure(err, NavigationFailureType.duplicated)) {
          this.index = targetIndex
        }
      }
    )
  }

  getCurrentLocation () {
    // 获取栈顶的元素
    const current = this.stack[this.stack.length - 1]
    return current ? current.fullPath : '/'
  }

  ensureURL () {
    // noop
  }
}
