/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './state-key'
import { extend } from './misc'

const positionStore = Object.create(null)

export function setupScroll () {
  // Prevent browser scroll behavior on History popstate
  // 历史导航上显式地设置默认滚动恢复行
  // 这里意思是history推出推入的时候，页面都在最上面的视窗，而不是滚动到对应的历史位置
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual'
  }
  // Fix for #1585 for Firefox
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  // Fix for #2774 Support for apps loaded from Windows file shares not mapped to network drives: replaced location.origin with
  // window.location.protocol + '//' + window.location.host
  // location.host contains the port and location.hostname doesn't
  // 最好不要用location.origin，这个方法有很多bug
  // 你可以通过protocol + '//' + host的方式获取域名
  const protocolAndPath = window.location.protocol + '//' + window.location.host
  // 获取域名的路径
  const absolutePath = window.location.href.replace(protocolAndPath, '')
  // preserve existing history state as it could be overriden by the user
  // 复制一个state出来，防止被修改
  const stateCopy = extend({}, window.history.state)
  stateCopy.key = getStateKey()
  // 替换历史栈
  window.history.replaceState(stateCopy, '', absolutePath)
  // 这个事件只有浏览器发出动作的时候才会触发
  window.addEventListener('popstate', handlePopState)
  // 经典操作值返回一个函数，用于移除事件监听，防止内存泄漏
  return () => {
    window.removeEventListener('popstate', handlePopState)
  }
}

export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  // vue没注册的时候退出
  if (!router.app) {
    return
  }

  // 没有滚动的行为配置也退出
  const behavior = router.options.scrollBehavior
  if (!behavior) {
    return
  }

  // 断言配置必须是函数
  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  router.app.$nextTick(() => {
    // 重新渲染完成后获取滚动地址
    const position = getScrollPosition()
    // 调用配置函数获取是否滚动
    const shouldScroll = behavior.call(
      router,
      to,
      from,
      isPop ? position : null
    )

    if (!shouldScroll) {
      return
    }

    // 异步thenable的检查，即支持返回为Promise
    if (typeof shouldScroll.then === 'function') {
      shouldScroll
        .then(shouldScroll => {
          scrollToPosition((shouldScroll: any), position)
        })
        .catch(err => {
          if (process.env.NODE_ENV !== 'production') {
            assert(false, err.toString())
          }
        })
    } else {
      scrollToPosition(shouldScroll, position)
    }
  })
}

export function saveScrollPosition () {
  // 获取路由的key,key使用genStateKey创建的
  const key = getStateKey()
  if (key) {
    // 局部变量保存下坐标
    positionStore[key] = {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }
}

function handlePopState (e) {
  // 保存前一个页面的滚动坐标
  saveScrollPosition()
  if (e.state && e.state.key) {
    // 保存新的key
    setStateKey(e.state.key)
  }
}

function getScrollPosition (): ?Object {
  const key = getStateKey()
  if (key) {
    return positionStore[key]
  }
}

// 计算坐标
function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  // 获取元素相对视窗的位置
  const docRect = docEl.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v: any): boolean {
  return typeof v === 'number'
}

const hashStartsWithNumberRE = /^#\d/

function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object'
  // 有selector的时候
  if (isObject && typeof shouldScroll.selector === 'string') {
    // getElementById would still fail if the selector contains a more complicated query like #main[data-attr]
    // but at the same time, it doesn't make much sense to select an element with an id and an extra selector
    // 查找到对应的元素
    const el = hashStartsWithNumberRE.test(shouldScroll.selector) // $flow-disable-line
      ? document.getElementById(shouldScroll.selector.slice(1)) // $flow-disable-line
      : document.querySelector(shouldScroll.selector)
    // 找的到元素的时候
    if (el) {
      // 获取偏移量
      let offset =
        shouldScroll.offset && typeof shouldScroll.offset === 'object'
          ? shouldScroll.offset
          : {}
          // 标准化坐标，非数字置0
      offset = normalizeOffset(offset)
      // 获取相对于视窗的坐标
      position = getElementPosition(el, offset)
      // 没找到元素但是有坐标的时候
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll)
    }
  // 没有selector，直接是坐标的时候
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)
  }
  // 有坐标支持scroll的时候，滚动到对应坐标，兼容behavior的支持
  if (position) {
    // $flow-disable-line
    if ('scrollBehavior' in document.documentElement.style) {
      window.scrollTo({
        left: position.x,
        top: position.y,
        // $flow-disable-line
        behavior: shouldScroll.behavior
      })
    } else {
      window.scrollTo(position.x, position.y)
    }
  }
}
