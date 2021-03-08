/* @flow */

export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    // 队列执行完毕
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
        // 给fn函数传入钩子函数和回调函数
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        // 无效的略过
        step(index + 1)
      }
    }
  }
  step(0)
}
