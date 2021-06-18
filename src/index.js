// 引入Store类，和install方法
import { Store, install } from './store'
// 引入helpers，把5个api挂载到导出的对象上
import { mapState, mapMutations, mapGetters, mapActions, createNamespacedHelpers } from './helpers'
// 引入logger，把logger挂载到导出的对象上
import createLogger from './plugins/logger'

// export一个对象
export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
}

export {
  Store,
  install,
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
}
