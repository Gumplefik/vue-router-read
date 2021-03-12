import View from './components/view'
import Link from './components/link'



export let _Vue

// vue的注册函数
export function install (Vue) {
  // 防止重复注册
  if (install.installed && _Vue === Vue) return
  install.installed = true

  // 保存引用
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    //  i = vm.$options._parentVnode.data.registerRouteInstance
    // 如果你的有配置i就会执行
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 注册mixin
  Vue.mixin({
    beforeCreate () {
      // $options就是new Vue时传的参数，router是实例化后的VueRouter
      if (isDef(this.$options.router)) {

        // 保存Vue根实例
        this._routerRoot = this
        // 保存router的引用
        this._router = this.$options.router
        // 初始化路由
        this._router.init(this)
        // 响应式方法，使route响应化
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 保存Vue根实例
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 定义$router方法
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // 定义$route方法
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 注册组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // vue的合并策略
  const strats = Vue.config.optionMergeStrategies
  // 合并策略保持和created一致
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
