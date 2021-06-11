const target = typeof window !== 'undefined'
  ? window
  : typeof global !== 'undefined'
    ? global
    : {}
const devtoolHook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__

export default function devtoolPlugin (store) {
  if (!devtoolHook) return

  store._devtoolHook = devtoolHook

  // 1. 触发Vuex组件初始化的hook
  devtoolHook.emit('vuex:init', store)

  // 2. 提供“时空穿梭”功能，即state操作的前进和倒退
  devtoolHook.on('vuex:travel-to-state', targetState => {
    store.replaceState(targetState)
  })

  // 3. 订阅mutation，当触发mutation时,触发vuex:mutation方法，并提供被触发的mutation函数和当前的state状态
  store.subscribe((mutation, state) => {
    devtoolHook.emit('vuex:mutation', mutation, state)
  }, { prepend: true })

  // 4. 订阅action，当触发action时,触发vuex:action方法，并提供被触发的action函数和当前的state状态
  store.subscribeAction((action, state) => {
    devtoolHook.emit('vuex:action', action, state)
  }, { prepend: true })
}
