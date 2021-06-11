import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert, partial } from './util'

// 声明Vue变量
// 声明了一个Vue变量，这个变量在install方法中会被赋值，
// 这样可以给当前作用域提供Vue，这样做的好处是不需要额外import Vue from 'vue'
let Vue // bind on install


/**
 * 2. store初始化
 *   Store的构造函数
 */
export class Store {
  constructor (options = {}) {
    /************************
     * 环境判断          
     ************************/
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      // 挂载在window上的自动安装，也就是通过script标签引入时不需要手动调用Vue.use(Vuex)
      install(window.Vue)
    }

    if (__DEV__) {
      // 断言必须使用Vue.use(Vuex),在install方法中会给Vue赋值
      // 断言必须存在Promise
      // 断言必须使用new操作符
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `store must be called with the new operator.`)
    }


    /************************
     * 初始变量设置          
     ************************/
    const {
      plugins = [],
      strict = false
    } = options
   
    // _committing：提交状态的标志，在_withCommit中，当使用mutation时，会先赋值为true，再执行mutation，修改state后再赋值为false，在这个过程中，会用watch监听state的变化时是否_committing为true，从而保证只能通过mutation来修改state
    this._committing = false
    // _actions：用于保存所有action，里面会先包装一次
    this._actions = Object.create(null)
    // _actionSubscribers：用于保存订阅action的回调
    this._actionSubscribers = []
    // _mutations：用于保存所有的mutation，里面会先包装一次
    this._mutations = Object.create(null)
    // _wrappedGetters：用于保存包装后的getter
    this._wrappedGetters = Object.create(null)


    /************************
     * moduel树构造
     ************************/
    // 用于module收集
    this._modules = new ModuleCollection(options)
    // 用于保存namespaced的模块
    this._modulesNamespaceMap = Object.create(null)
    // 用于监听mutation
    this._subscribers = []
    // 用于响应式地监测一个 getter 方法的返回值
    this._watcherVM = new Vue()
    // 用于保存本地getters缓存
    this._makeLocalGettersCache = Object.create(null)


    /************************
     * 将dispatch和commit方法的this指针绑定到store上，防止被修改
     ************************/
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }


    /************************
     * 组装module
     ************************/
    // strict mode
    this.strict = strict
    const state = this._modules.root.state
    
    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    // 这里是module处理的核心，包括处理根module、action、mutation、getters和递归注册子module
    installModule(this, state, [], this._modules.root)


    /************************
     * 更新store
     ************************/
    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    // 使用vue实例来保存state和getter
    resetStoreVM(this, state)


    /************************
     * 插件注册
     ************************/
    // 插件注册，所有插件都是一个函数，接受store作为参数
    plugins.forEach(plugin => plugin(this))

    // 如果开启devtools，注册devtool
    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  get state () {
    return this._vm._data.$$state
  }

  set state (v) {
    if (__DEV__) {
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }

  commit (_type, _payload, _options) {
    // check object-style commit
    // 统一格式，因为支持对象风格和payload风格
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }
    // 获取当前type对应保存下来的mutations数组
    const entry = this._mutations[type]
    if (!entry) {
      // 提示不存在该mutation
      if (__DEV__) {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }
    // 包裹在_withCommit中执行mutation，mutation是修改state的唯一方法
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })
    // 订阅者函数遍历执行，传入当前的mutation对象和当前的state
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state))

    if (
      __DEV__ &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }

  dispatch (_type, _payload) {
    // check object-style dispatch
    // 统一格式
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload) // 配置参数处理

    const action = { type, payload }
    // 当前type下所有action处理函数集合
    const entry = this._actions[type]
    // 提示不存在action
    if (!entry) {
      if (__DEV__) {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    try {
      // 执行action的订阅者
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (__DEV__) {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }

    // 如果action大于1，需要用Promise.all包裹
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)

    // 返回一个promise结果
    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in after action subscribers: `)
            console.error(e)
          }
        }
        resolve(res)
      }, error => {
        try {
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error))
        } catch (e) {
          if (__DEV__) {
            console.warn(`[vuex] error in error action subscribers: `)
            console.error(e)
          }
        }
        reject(error)
      })
    })
  }

  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }

  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  /**
   * 用于监听一个getter值的变化
   * @param {*} getter 被监听的getter
   * @param {*} cb 回调
   * @param {*} options 配置
   */
  watch (getter, cb, options) {
    if (__DEV__) {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    // 使用$watch方法来监控getter的变化，传入state和getters作为参数，当值变化时会执行cb回调。调用此方法返回的函数可停止侦听。
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  /**
   * 替换state
   * @param {*} state 
   */
  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  /**
   * 用于动态注册module
   * @param {*} path path只接受String和Array类型
   * @param {*} rawModule 
   * @param {*} options 
   */
  registerModule (path, rawModule, options = {}) {
    // 如果path是字符串，则使用数组存放 -- 统一path的格式为Array
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    // 收集module
    this._modules.register(path, rawModule)
    // 组装module
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters...
    // 更新vm
    resetStoreVM(this, this.state)
  }

  /**
   * 根据path注销module
   * @param {*} path path只接受String和Array类型
   */
  unregisterModule (path) {
    // 如果path是字符串，则使用数组存放 -- 统一path的格式为Array
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    // 注销module
    this._modules.unregister(path)
    // 该module的state通过Vue.delete移除
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    // 重置store
    resetStore(this)
  }

  /**
   * 是否存在该module
   * @param {*} path 
   */
  hasModule (path) {
    // 如果path是字符串，则用数组包裹 -- 统一path为数组格式
    if (typeof path === 'string') path = [path]

    if (__DEV__) {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    return this._modules.isRegistered(path)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

  /**
   * 用于执行mutation
   */
  _withCommit (fn) {
    // 在执行mutation的时候，会将_committing设置为true，执行完毕后重置
    const committing = this._committing
    this._committing = true
    fn()
    this._committing = committing
  }
}

function genericSubscribe (fn, subs, options) {
  if (subs.indexOf(fn) < 0) {
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

/**
 * 重置store
 * @param {*} store 
 * @param {*} hot 
 */
function resetStore (store, hot) {
  store._wrappedGetters = Object.create(null)
  // 将_actions、_mutations、_wrappedGetters、_modulesNamespaceMap置空
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  // 重新进行全部模块安装
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  // 更新vm
  resetStoreVM(store, state, hot)
}

/**
 * 创建了当前store实例的_vm组件，至此store就创建完毕了
 * @param {*} store store对象
 * @param {*} state state对象
 * @param {*} hot 
 */
function resetStoreVM (store, state, hot) {
  // 缓存前vm组件
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null)
  const wrappedGetters = store._wrappedGetters
  const computed = {}

  // 循环所有处理过的getters，并新建computed对象进行存储，
  // 通过Object.defineProperty方法为getters对象建立属性，
  // 这样就可以通过this.$store.getters.xxxgetter访问到该getters
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    // getter保存在computed中，执行时只需要给上store参数，这个在registerGetter时已经做处理
    computed[key] = partial(fn, store)
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  // 使用一个vue实例来保存state和getter
  // silent设置为true，取消所有日志警告等
  const silent = Vue.config.silent

  // 暂时将Vue设为静默模式，避免报出用户加载的某些插件触发的警告
  Vue.config.silent = true
  // 设置新的storeVm，将当前初始化的state以及getters作为computed属性（刚刚遍历生成的）
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  // 恢复用户的silent设置
  Vue.config.silent = silent

  // enable strict mode for new vm
  // strict模式
  if (store.strict) {
    // 该方法对state执行$watch以禁止从mutation外部修改state
    enableStrictMode(store)
  }

  // 若存在oldVm，则不是初始化过程，那么执行的该方法，将旧的组件state设置为null，解除对state的引用。
  // 强制更新所有监听者(watchers)，待更新生效，DOM更新完成后，执行vm组件的destroy方法进行销毁，减少内存的占用
  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    Vue.nextTick(() => oldVm.$destroy())
  }
}

/**
 * 组装module
 * @param {Ojbect} store store
 * @param {Ojbect} rootState 对应store的module的state
 * @param {Array} path 路径
 * @param {Ojbect} module 对应store的module
 * @param {*} hot 
 */
function installModule (store, rootState, path, module, hot) {
  // path中字符为0，则说明是根root
  const isRoot = !path.length
  /**
   * 获取path的命名空间
   * {
   *   // ...
   *   modules: {
   *     moduleA: {
   *       namespaced: true
   *     },
   *     moduleB: {}
   *   }
   * }
   * moduleA的namespace -> 'moduleA/'
   * moduleB的namespace -> ''
   */
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  // 如果module有命名空间
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && __DEV__) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`)
    }
    // 将module保存到对应namespace的store上
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  // 判断是否为根组件且不是hot，得到父级module的state和当前module的name，
  // 调用Vue.set(parentState, moduleName, module.state)将当前module的state挂载到父state上
  if (!isRoot && !hot) {
    // 非根组件设置state
    // 根据path获取父state
    const parentState = getNestedState(rootState, path.slice(0, -1))
    // 当前的module
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      if (__DEV__) {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          )
        }
      }
      // 使用Vue.set将state设置为响应式
      Vue.set(parentState, moduleName, module.state)
    })
  }

  // 设置module的上下文，绑定对应的dispatch、commit、getters、state
  const local = module.context = makeLocalContext(store, namespace, path)

  // 逐一注册对应模块的mutation，供state修改使用
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  // 逐一注册对应模块的action，供数据操作、提交mutation等异步操作使用
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  // 逐一注册对应模块的getters，供state读取使用
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  // 递归注册子module
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
// 设置module的上下文，绑定对应的dispatch、commit、getters、state
function makeLocalContext (store, namespace, path) {
  // namespace 如'moduleA/'
  const noNamespace = namespace === ''

  const local = {
    // 如果没有namespace，直接使用原来的
    // 如果存在namespace，type需要加上对应的namespace
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      // 统一格式 因为支持payload风格和对象风格
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      // 如果root: true 不会加上namespace 即在命名空间模块里提交根的 action
      if (!options || !options.root) {
        // 加上命名空间
        type = namespace + type
        if (__DEV__ && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }
      // 触发action
      return store.dispatch(type, payload)
    },

    // 如果没有namespace，直接使用原来的
    // 如果存在namespace，type需要加上对应的namespace
    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      // 统一格式 因为支持payload风格和对象风格
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      // 如果root: true 不会加上namespace 即在命名空间模块里提交根的 mutation
      if (!options || !options.root) {
        // 加上命名空间
        type = namespace + type
        if (__DEV__ && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }
      // 触发mutation
      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // 这里的getters和state需要延迟处理，需要等数据更新后才进行计算，
  // 所以使用Object.defineProperties的getter函数，当访问的时候再进行一次计算
  Object.defineProperties(local, {
    getters: {
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace) // 获取namespace下的getters
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

function makeLocalGetters (store, namespace) {
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      // 如果getter不在该命名空间下 直接return
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      // 去掉type上的命名空间
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      // 给getters加一层代理 这样在module中获取到的getters不会带命名空间，
      // 实际返回的是store.getters[type] type是有命名空间的
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  return store._makeLocalGettersCache[namespace]
}

/**
 * 注册mutation
 *   mutation的注册主要是包一层函数，然后保存到store._mutations里面
 * @param {*} store store对象
 * @param {*} type mutation的key（namespace处理后的）
 * @param {*} handler handler函数
 * @param {*} local module的上下文
 */
function registerMutation (store, type, handler, local) {
  // 取出对应type的mutations-handler集合，如果没有则给个空数组
  const entry = store._mutations[type] || (store._mutations[type] = [])
  // 将mutation包一层函数，push到数组中（commit实际调用的不是我们传入的handler，而是再经过了一层函数封装）
  entry.push(function wrappedMutationHandler (payload) {
    // 包一层，commit执行时只需要传入payload
    // 执行时让this指向store，参数为当前module上下文的state和用户额外添加的payload
    handler.call(store, local.state, payload)
  })
}

/**
 * 注册action
 * @param {*} store store对象
 * @param {*} type type（namespace处理后的）
 * @param {*} handler handler函数
 * @param {*} local module的上下文
 */
function registerAction (store, type, handler, local) {
  // 取出对应type的actions-handler集合，如果没有则给个空数组
  const entry = store._actions[type] || (store._actions[type] = [])
  // 存储新的封装过的action-handler到数组中
  entry.push(function wrappedActionHandler (payload) {
    // 包一层，action执行时需要传入state等对象，以及payload
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)
    // 如果action的执行结果不是promise，将他包裹为promise，这样就支持promise的链式调用
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      // 使用devtool处理一次error
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}

/**
 * 注册getter
 * @param {*} store store对象
 * @param {*} type type（namesapce处理后的）
 * @param {*} rawGetter getter函数
 * @param {*} local module上下文
 */
function registerGetter (store, type, rawGetter, local) {
  // 不允许重复定义getters
  if (store._wrappedGetters[type]) {
    if (__DEV__) {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  // 存储封装过的getters处理函数
  store._wrappedGetters[type] = function wrappedGetter (store) {
    // 包一层，保存到_wrappedGetters中
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}

/**
 * 使用$watch来观察state的变化，如果此时的store._committing不会true，
 * 便是在mutation之外修改state，报错。
 * @param {*} store store对象
 */
function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (__DEV__) {
      // 不允许在mutation之外修改state
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (__DEV__) {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options }
}

/**
 * 1. Vuex的装载
 *   声明install方法
 *   传入vue对象，把传入的vue对象赋给
 * @param {*} _Vue vm对象
 */
export function install (_Vue) {
  // 判断是否已经存在Vue对象，有则返回
  if (Vue && _Vue === Vue) {
    if (__DEV__) {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  // 赋给全局的Vue变量
  Vue = _Vue
  // 执行引入mixin方法
  applyMixin(Vue)
}
