const target = typeof window !== 'undefined'
  ? window
  : typeof global !== 'undefined'
    ? global
    : {}
const devtoolHook = target.__VUE_DEVTOOLS_GLOBAL_HOOK__

export default function devtoolPlugin (store) {
  if (!devtoolHook) return

  store._devtoolHook = devtoolHook

  // 触发vuex:init
  devtoolHook.emit('vuex:init', store)

  // 时空穿梭功能
  devtoolHook.on('vuex:travel-to-state', targetState => {
    store.replaceState(targetState)
  })

  // 订阅mutation，当触发mutation时触发vuex:mutation方法，传入mutation和state
  store.subscribe((mutation, state) => {
    devtoolHook.emit('vuex:mutation', mutation, state)
  }, { prepend: true })

  store.subscribeAction((action, state) => {
    devtoolHook.emit('vuex:action', action, state)
  }, { prepend: true })
}
