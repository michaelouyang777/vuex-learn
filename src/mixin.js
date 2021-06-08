export default function (Vue) {
  // 获取Vue对象内的版本信息
  const version = Number(Vue.version.split('.')[0])

  // 如果版本>=2，则使用混入
  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } 
  // 如果版本不是>=2，则使用原型
  else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   * 
   * 当我们在执行new Vue启动一个Vue应用程序时，需要给上store字段，
   * 根组件从这里拿到store，子组件从父组件拿到，这样一层一层传递下去，
   * 实现所有组件都有$store属性，这样我们就可以在任何组件中通过this.$store访问到store
   */
  function vuexInit () {
    const options = this.$options
    // store injection
    // 当我们在执行new Vue的时候，需要提供store字段
    if (options.store) {
      // 如果是root，将store绑到this.$store
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store
    } else if (options.parent && options.parent.$store) {
      // 否则拿parent上的$store
      // 从而实现所有组件共用一个store实例
      this.$store = options.parent.$store
    }
  }
}
