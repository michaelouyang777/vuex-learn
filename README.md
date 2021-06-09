## vuex 源码学习


### 目录结构

~~~
|-- .github                            // 贡献者、issue、PR模版
|-- dist                               // 打包后的文件
|-- docs                               // 文档
|-- docs-gitbook                       // 在线文档
|-- examples                           // 示例代码
|-- scripts
|-- src                                // 入口文件以及各种辅助文件
|-- test                               // 单元测试文件
|-- types                              // 类型声明
|-- .babelrc                           // babel相关配置
|-- .eslintrc.json                     // eslint相关配置
|-- .gitignore
|-- CHANGELOG.md
|-- jest.config.js                     // jest配置文件
|-- LICENSE                            // 版权协议相关
|-- package.json
|-- README.md                          // 项目说明文档
|-- rollup.config.js
|-- rollup.logger.config.js
|-- rollup.main.config.js
|-- yarn.lock
~~~

首先看看src文件夹中有些什么文件
- 【module】 模块相关处理的文件夹
  + 【module.js】 生成模块对象
  + 【module-collection.js】 递归解析模块配置，生成由「module.js 」的模块对象组成的模块树
- 【plugins】 插件相关，与主体功能无关
  + 【devtool.js】 chrome 的 vue 调试插件中使用到的代码，主要实现数据回滚功能
  + 【logger.js】 日志打印相关
- 【helpers.js】 辅助函数，mapGetters，mapActions，mapMutations等函数的实现
- 【index.cjs.js】入口文件
- 【index.js】入口文件
- 【index.mjs】入口文件
- 【mixin.js】vue 混合函数，实现 vuex 的安装功能
- 【store.js】vuex 存储类，实现 vuex 的主体功能。
- 【util.js】工具函数库，复用一些常用函数




--------------------------------------




### 源码分析

先从一个简单的示例入手，一步一步分析整个代码的执行过程，下面是官方提供的简单示例

```js
// store.js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)
```

#### 1. Vuex的注册

Vue官方建议的插件使用方法是使用Vue.use方法，这个方法会调用插件的install方法，看看install方法都做了些什么，从index.js中可以看到install方法在store.js中抛出，部分代码如下

```js
let Vue // bind on install

export function install (_Vue) {
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}
```

声明了一个Vue变量，这个变量在install方法中会被赋值，这样可以给当前作用域提供Vue，这样做的好处是不需要额外`import Vue from 'vue'` 不过我们也可以这样写，然后让打包工具不要将其打包，而是指向开发者所提供的Vue，比如webpack的`externals`，这里就不展开了。执行install会先判断Vue是否已经被赋值，避免二次安装。然后调用`applyMixin`方法，代码如下

```js
// applyMixin
export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
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
```

这里会区分vue的版本，2.x和1.x的钩子是不一样的，如果是2.x使用`beforeCreate`，1.x即使用`_init`。当我们在执行`new Vue`启动一个Vue应用程序时，需要给上`store`字段，根组件从这里拿到`store`，子组件从父组件拿到，这样一层一层传递下去，实现所有组件都有`$store`属性，这样我们就可以在任何组件中通过`this.$store`访问到`store`

接下去继续看例子

```js
// store.js
export default new Vuex.Store({
  state: {
    count: 0
  },
  getters: {
    evenOrOdd: state => state.count % 2 === 0 ? 'even' : 'odd'
  },
  actions:  {
    increment: ({ commit }) => commit('increment'),
    decrement: ({ commit }) => commit('decrement')
  },
  mutations: {
    increment (state) {
      state.count++
    },
    decrement (state) {
      state.count--
    }
  }
})
```

```js
// app.js
new Vue({
  el: '#app',
  store, // 传入store，在beforeCreate钩子中会用到
  render: h => h(Counter)
})
```

#### 2.store初始化

这里是调用Store构造函数，传入一个对象，包括state、actions等等，接下去看看Store构造函数都做了些什么

```js
export class Store {
  constructor (options = {}) {
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      // 挂载在window上的自动安装，也就是通过script标签引入时不需要手动调用Vue.use(Vuex)
      install(window.Vue)
    }

    if (process.env.NODE_ENV !== 'production') {
      // 断言必须使用Vue.use(Vuex),在install方法中会给Vue赋值
      // 断言必须存在Promise
      // 断言必须使用new操作符
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `Store must be called with the new operator.`)
    }

    const {
      plugins = [],
      strict = false
    } = options

    // store internal state
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    // 这里进行module收集，只处理了state
    this._modules = new ModuleCollection(options)
    // 用于保存namespaced的模块
    this._modulesNamespaceMap = Object.create(null)
    // 用于监听mutation
    this._subscribers = []
    // 用于响应式地监测一个 getter 方法的返回值
    this._watcherVM = new Vue()

    // 将dispatch和commit方法的this指针绑定到store上，防止被修改
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    this.strict = strict

    const state = this._modules.root.state

    // 这里是module处理的核心，包括处理根module、action、mutation、getters和递归注册子module
    installModule(this, state, [], this._modules.root)

    // 使用vue实例来保存state和getter
    resetStoreVM(this, state)

    // 插件注册
    plugins.forEach(plugin => plugin(this))

    if (Vue.config.devtools) {
      devtoolPlugin(this)
    }
  }
}
```

首先会判断Vue是不是挂载在`window`上，如果是的话，自动调用`install`方法，然后进行断言，必须先调用Vue.use(Vuex)。必须提供`Promise`，这里应该是为了让Vuex的体积更小，让开发者自行提供`Promise`的`polyfill`，一般我们可以使用`babel-runtime`引入。最后断言必须使用new操作符调用Store函数。

接下去是一些内部变量的初始化
`_committing`提交状态的标志，在_withCommit中，当使用`mutation`时，会先赋值为`true`，再执行`mutation`，修改`state`后再赋值为`false`，在这个过程中，会用`watch`实时监听state的变化时是否`_committing`为true，从而保证只能通过`mutation`来修改`state`
`_actions`用于保存所有action，里面会先包装一次
`_actionSubscribers`用于保存订阅action的回调
`_mutations`用于保存所有的mutation，里面会先包装一次
`_wrappedGetters`用于保存包装后的getter
`_modules`用于保存一棵module树
`_modulesNamespaceMap`用于保存namespaced的模块

接下去的重点是

```js
this._modules = new ModuleCollection(options)
```

##### 2.1 模块收集

接下去看看ModuleCollection函数都做了什么，部分代码如下

```js
// module-collection.js
export default class ModuleCollection {
  constructor (rawRootModule) {
    // 注册 root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  get (path) {
    // 根据path获取module
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  /*
   * 递归注册module path是路径 如
   * {
   *    modules: {
   *      a: {
   *        state: {}
   *      }
   *    }
   * }
   * a模块的path => ['a']
   * 根模块的path => []
   */
  register (path, rawModule, runtime = true) {
    if (process.env.NODE_ENV !== 'production') {
      // 断言 rawModule中的getters、actions、mutations必须为指定的类型
      assertRawModule(path, rawModule)
    }

    // 实例化一个module
    const newModule = new Module(rawModule, runtime)
    if (path.length === 0) {
      // 根module 绑定到root属性上
      this.root = newModule
    } else {
      // 子module 添加到其父module的_children属性上
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // 如果当前模块存在子模块（modules字段）
    // 遍历子模块，逐个注册，最终形成一个树
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }
}

// module.js
export default class Module {
  constructor (rawModule, runtime) {
    // 初始化时runtime为false
    this.runtime = runtime
    // Store some children item
    // 用于保存子模块
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    // 保存原来的moudle，在Store的installModule中会处理actions、mutations等
    this._rawModule = rawModule
    const rawState = rawModule.state

    // Store the origin module's state
    // 保存state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  addChild (key, module) {
    // 将子模块添加到_children中
    this._children[key] = module
  }
}
```

这里调用`ModuleCollection`构造函数，通过`path`的长度判断是否为根module，首先进行根module的注册，然后递归遍历所有的module，子module 添加其父module的_children属性上，最终形成一棵树

![module-collection](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/module-collection.jpeg)

接着，还是一些变量的初始化，然后

##### 2.2 绑定commit和dispatch的this指针

```js
// 绑定commit和dispatch的this指针
const store = this
const { dispatch, commit } = this
this.dispatch = function boundDispatch (type, payload) {
  return dispatch.call(store, type, payload)
}
this.commit = function boundCommit (type, payload, options) {
  return commit.call(store, type, payload, options)
}
```

这里会将dispath和commit方法的this指针绑定为store，比如下面这样的骚操作，也不会影响到程序的运行

```js
this.$store.dispatch.call(this, 'someAction', payload)
```

##### 2.3 模块安装

接着是store的核心代码

```js
// 这里是module处理的核心，包括处理根module、命名空间、action、mutation、getters和递归注册子module
installModule(this, state, [], this._modules.root)
```

```js
function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length
  /*
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
  if (module.namespaced) {
    // 保存namespaced模块
    store._modulesNamespaceMap[namespace] = module
  }

  // set state
  if (!isRoot && !hot) {
    // 非根组件设置state
    // 根据path获取父state
    const parentState = getNestedState(rootState, path.slice(0, -1))
    // 当前的module key
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      // 使用Vue.set将state设置为响应式
      Vue.set(parentState, moduleName, module.state)
    })
  }

  // 绑定局部上下文对应的各种属性，包括dispath、commit、getters、state，因为存在 namespaced 的话, 需要做特殊处理，这个属性是我们写actions、mutations时的第一个参数部分从这里取
  const local = module.context = makeLocalContext(store, namespace, path)

  // 逐一注册mutation
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  // 逐一注册action
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  // 逐一注册getter
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  // 逐一注册子module
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}
```

首先保存`namespaced`模块到`store._modulesNamespaceMap`，再判断是否为根组件且不是hot，得到父级module的state和当前module的name，调用`Vue.set(parentState, moduleName, module.state)`将当前module的state挂载到父state上。接下去会设置module的上下文，因为可能存在`namespaced`，需要额外处理

```js
// 设置module的上下文，绑定对应的dispatch、commit、getters、state
function makeLocalContext (store, namespace, path) {
  // namespace 如'moduleA/'
  const noNamespace = namespace === ''

  const local = {
    // 如果没有namespace，直接使用原来的
    // 如果存在，type需要加上对应的namespace
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      // 统一格式 因为支持payload风格和对象风格
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      // 如果root: true 不会加上namespace 即在命名空间模块里提交根的 action
      if (!options || !options.root) {
        // 加上命名空间
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }
      // 触发action
      return store.dispatch(type, payload)
    },

    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      // 统一格式 因为支持payload风格和对象风格
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      // 如果root: true 不会加上namespace 即在命名空间模块里提交根的 mutation
      if (!options || !options.root) {
        // 加上命名空间
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
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
  // 这里的getters和state需要延迟处理，需要等数据更新后才进行计算，所以使用getter函数，当访问的时候再进行一次计算
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
  const gettersProxy = {}

  const splitPos = namespace.length
  Object.keys(store.getters).forEach(type => {
    // 如果getter不在该命名空间下 直接return
    if (type.slice(0, splitPos) !== namespace) return

    // 去掉type上的命名空间
    const localType = type.slice(splitPos)

    // Add a port to the getters proxy.
    // Define as getter property because
    // we do not want to evaluate the getters in this time.
    // 给getters加一层代理 局部使用时不需要加上namespace
    Object.defineProperty(gettersProxy, localType, {
      get: () => store.getters[type],
      enumerable: true
    })
  })

  return gettersProxy
}

function getNestedState (state, path) {
  return path.length ? path.reduce((state, key) => state[key], state) : state
}

```

这里会判断`module`的`namespace`是否存在，不存在不会对`dispatch`和`commit`做处理，如果存在，给`type`加上`namespace`，如果声明了`{root: true}`也不做处理，另外`getters`和`state`需要延迟处理，需要等数据更新后才进行计算，所以使用`Object.defineProperties`的getter函数，当访问的时候再进行计算

再回到上面的流程，接下去是逐步注册`mutation` `action` `getter` `子module`，先看注册`mutation`

```js
/*
 * 参数是store、mutation的key（namespace处理后的）、handler函数、当前module局部上下文
 */
function registerMutation (store, type, handler, local) {
  // 首先判断store._mutations是否存在，否则给空数组
  const entry = store._mutations[type] || (store._mutations[type] = [])
  // 将mutation包一层函数，push到数组中
  entry.push(function wrappedMutationHandler (payload) {
    // 包一层，commit执行时只需要传入payload
    // 执行时让this指向store，参数为当前module上下文的state和用户额外添加的payload
    handler.call(store, local.state, payload)
  })
}
```

`mutation`的注册比较简单，主要是包一层函数，然后保存到`store._mutations`里面，在这里也可以知道，`mutation`可以重复注册，不会覆盖，当用户调用`this.$store.commit(mutationType, payload)`时会触发，接下去看看`commit`函数

```js
// 这里的this已经被绑定为store
commit (_type, _payload, _options) {
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
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown mutation type: ${type}`)
    }
    return
  }
  // 包裹在_withCommit中执行mutation，mutation是修改state的唯一方法
  this._withCommit(() => {
    entry.forEach(function commitIterator (handler) {
      // 执行mutation，只需要传入payload，在上面的包裹函数中已经处理了其他参数
      handler(payload)
    })
  })
  // 执行mutation的订阅者
  this._subscribers.forEach(sub => sub(mutation, this.state))

  if (
    process.env.NODE_ENV !== 'production' &&
    options && options.silent
  ) {
    // 提示silent参数已经移除
    console.warn(
      `[vuex] mutation type: ${type}. Silent option has been removed. ` +
      'Use the filter functionality in the vue-devtools'
    )
  }
}
```

首先对参数进行统一处理，因为是支持对象风格和载荷风格的，然后拿到当前`type`对应的mutation数组，使用`_withCommit`包裹逐一执行，这样我们执行`this.$store.commit`的时候会调用对应的`mutation`，而且第一个参数是`state`，然后再执行`mutation`的订阅函数

接下去看`action`的注册

```js
/*
 * 参数是store、type（namespace处理后的）、handler函数、module上下文
 */
function registerAction (store, type, handler, local) {
  // 获取_actions数组，不存在即赋值为空数组
  const entry = store._actions[type] || (store._actions[type] = [])
  // push到数组中
  entry.push(function wrappedActionHandler (payload, cb) {
    // 包一层，执行时需要传入payload和cb
    // 执行action
    let res = handler.call(
      store,
      {
        dispatch: local.dispatch,
        commit: local.commit,
        getters: local.getters,
        state: local.state,
        rootGetters: store.getters,
        rootState: store.state
      },
      payload,
      cb
    )
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
```

和`mutation`很类似，使用函数包一层然后push到`store._actions`中，有些不同的是执行时参数比较多，这也是为什么我们在写`action`时可以解构拿到`commit`等的原因，然后再将返回值`promisify`，这样可以支持链式调用，但实际上用的时候最好还是自己返回`promise`，因为通常`action`是异步的，比较多见是发起ajax请求，进行链式调用也是想当异步完成后再执行，具体根据业务需求来。接下去再看看`dispatch`函数的实现

```js
// this已经绑定为store
dispatch (_type, _payload) {
  // 统一格式
  const { type, payload } = unifyObjectStyle(_type, _payload)

  const action = { type, payload }
  // 获取actions数组
  const entry = this._actions[type]
  // 提示不存在action
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown action type: ${type}`)
    }
    return
  }
  // 执行action的订阅者
  this._actionSubscribers.forEach(sub => sub(action, this.state))
  // 如果action大于1，需要用Promise.all包裹
  return entry.length > 1
    ? Promise.all(entry.map(handler => handler(payload)))
    : entry[0](payload)
}
```

这里和`commit`也是很类似的，对参数统一处理，拿到action数组，如果长度大于一，用`Promise.all`包裹，不过直接执行，然后返回执行结果。

接下去是`getters`的注册和`子module`的注册

```js
/*
 * 参数是store、type（namesapce处理后的）、getter函数、module上下文
 */
function registerGetter (store, type, rawGetter, local) {
  // 不允许重复定义getters
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }
  // 包一层，保存到_wrappedGetters中
  store._wrappedGetters[type] = function wrappedGetter (store) {
    // 执行时传入store，执行对应的getter函数
    return rawGetter(
      local.state, // local state
      local.getters, // local getters
      store.state, // root state
      store.getters // root getters
    )
  }
}
```

首先对`getters`进行判断，和`mutation`是不同的，这里是不允许重复定义的，然后包裹一层函数，这样在调用时只需要给上`store`参数，而用户的函数里会包含`local.state` `local.getters` `store.state` `store.getters`

```js
// 递归注册子module
installModule(store, rootState, path.concat(key), child, hot)
```

##### 使用vue实例保存state和getter

接着再继续执行`resetStoreVM(this, state)`，将`state`和`getters`存放到一个`vue实例`中，

```js
// initialize the store vm, which is responsible for the reactivity
// (also registers _wrappedGetters as computed properties)
resetStoreVM(this, state)
```

```js
function resetStoreVM (store, state, hot) {
  // 保存旧vm
  const oldVm = store._vm

  // bind store public getters
  store.getters = {}
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  // 循环所有getters，通过Object.defineProperty方法为getters对象建立属性，这样就可以通过this.$store.getters.xxx访问
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // getter保存在computed中，执行时只需要给上store参数，这个在registerGetter时已经做处理
    computed[key] = () => fn(store)
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    })
  })

  // 使用一个vue实例来保存state和getter
  // silent设置为true，取消所有日志警告等
  const silent = Vue.config.silent
  Vue.config.silent = true
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
    enableStrictMode(store)
  }
  // 若存在oldVm而且是热更新，解除对state的引用，销毁oldVm
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
```

这里会重新设置一个新的vue实例，用来保存`state`和`getter`，`getters`保存在计算属性中，会给`getters`加一层代理，这样可以通过`this.$store.getters.xxx`访问到，而且在执行getters时只传入了`store`参数，这个在上面的`registerGetter`已经做了处理，也是为什么我们的`getters`可以拿到`state` `getters` `rootState` `rootGetters`的原因。然后根据用户设置开启`strict`模式，如果存在oldVm，解除对state的引用，等dom更新后把旧的vue实例销毁

```js
function enableStrictMode (store) {
  store._vm.$watch(
    function () {
      return this._data.$$state
    },
    () => {
      if (process.env.NODE_ENV !== 'production') {
        // 不允许在mutation之外修改state
        assert(
          store._committing,
          `Do not mutate vuex store state outside mutation handlers.`
        )
      }
    },
    { deep: true, sync: true }
  )
}
```

使用`$watch`来观察`state`的变化，如果此时的`store._committing`不会true，便是在`mutation`之外修改state，报错。

再次回到构造函数，接下来是各类插件的注册

##### 2.4 插件注册

```js
// apply plugins
plugins.forEach(plugin => plugin(this))

if (Vue.config.devtools) {
  devtoolPlugin(this)
}
```

到这里`store`的初始化工作已经完成。大概长这个样子

![store](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/vuex-store.jpeg)

看到这里，相信已经对`store`的一些实现细节有所了解，另外`store`上还存在一些api，但是用到的比较少，可以简单看看都有些啥

##### 2.5 其他api

- watch (getter, cb, options)

用于监听一个`getter`值的变化

```js
watch (getter, cb, options) {
  if (process.env.NODE_ENV !== 'production') {
    assert(
      typeof getter === 'function',
      `store.watch only accepts a function.`
    )
  }
  return this._watcherVM.$watch(
    () => getter(this.state, this.getters),
    cb,
    options
  )
}
```

首先判断`getter`必须是函数类型，使用`$watch`方法来监控`getter`的变化，传入`state`和`getters`作为参数，当值变化时会执行cb回调。调用此方法返回的函数可停止侦听。

- replaceState(state)

用于修改state，主要用于devtool插件的时空穿梭功能，代码也相当简单，直接修改`_vm.$$state`

```js
replaceState (state) {
  this._withCommit(() => {
    this._vm._data.$$state = state
  })
}
```

- registerModule (path, rawModule, options = {})

用于动态注册module

```js
registerModule (path, rawModule, options = {}) {
  if (typeof path === 'string') path = [path]

  if (process.env.NODE_ENV !== 'production') {
    assert(Array.isArray(path), `module path must be a string or an Array.`)
    assert(
      path.length > 0,
      'cannot register the root module by using registerModule.'
    )
  }

  this._modules.register(path, rawModule)
  installModule(
    this,
    this.state,
    path,
    this._modules.get(path),
    options.preserveState
  )
  // reset store to update getters...
  resetStoreVM(this, this.state)
  }
```

首先统一`path`的格式为Array，接着是断言，path只接受`String`和`Array`类型，且不能注册根module，然后调用`store._modules.register`方法收集module，也就是上面的`module-collection`里面的方法。再调用`installModule`进行模块的安装，最后调用`resetStoreVM`更新`_vm`

- unregisterModule (path)

根据`path`注销`module`

```js
unregisterModule (path) {
  if (typeof path === 'string') path = [path]

  if (process.env.NODE_ENV !== 'production') {
    assert(Array.isArray(path), `module path must be a string or an Array.`)
  }

  this._modules.unregister(path)
  this._withCommit(() => {
    const parentState = getNestedState(this.state, path.slice(0, -1))
    Vue.delete(parentState, path[path.length - 1])
  })
  resetStore(this)
}

```

和`registerModule`一样，首先统一`path`的格式为Array，接着是断言，path只接受`String`和`Array`类型，接着调用`store._modules.unregister`方法注销`module`，然后在`store._withCommit`中将该`module`的`state`通过`Vue.delete`移除，最后调用`resetStore`方法，需要再看看`resetStore`的实现

```js
function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}
```

这里是将`_actions` `_mutations` `_wrappedGetters` `_modulesNamespaceMap`都清空，然后调用`installModule`和`resetStoreVM`重新进行全部模块安装和`_vm`的设置

- _withCommit (fn)

用于执行`mutation`

```js
_withCommit (fn) {
  const committing = this._committing
  this._committing = true
  fn()
  this._committing = committing
}
```

在执行`mutation`的时候，会将`_committing`设置为true，执行完毕后重置，在开启`strict`模式时，会监听`state`的变化，当变化时`_committing`不为true时会给出警告

#### 3. 辅助函数

为了避免每次都需要通过`this.$store`来调用api，`vuex`提供了`mapState` `mapMutations` `mapGetters` `mapActions` `createNamespacedHelpers` 等api，接着看看各api的具体实现，存放在`src/helpers.js`

##### 3.1 一些工具函数

下面这些工具函数是辅助函数内部会用到的，可以先看看功能和实现，主要做的工作是数据格式的统一、和通过`namespace`获取`module`

```js
/**
 * 统一数据格式
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
function normalizeMap (map) {
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: map[key] }))
}

/**
 * 返回一个函数，接受namespace和map参数，判断是否存在namespace，统一进行namespace处理
 * @param {Function} fn
 * @return {Function}
 */
function normalizeNamespace (fn) {
  return (namespace, map) => {
    if (typeof namespace !== 'string') {
      map = namespace
      namespace = ''
    } else if (namespace.charAt(namespace.length - 1) !== '/') {
      namespace += '/'
    }
    return fn(namespace, map)
  }
}

/**
 * 根据namespace获取module
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 */
function getModuleByNamespace (store, helper, namespace) {
  const module = store._modulesNamespaceMap[namespace]
  if (process.env.NODE_ENV !== 'production' && !module) {
    console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`)
  }
  return module
}
```

##### 3.2 mapState

为组件创建计算属性以返回 `store` 中的状态

```js
export const mapState = normalizeNamespace((namespace, states) => {
  const res = {}
  normalizeMap(states).forEach(({ key, val }) => {
  // 返回一个对象，值都是函数
  res[key] = function mappedState () {
    let state = this.$store.state
    let getters = this.$store.getters
    if (namespace) {
      // 如果存在namespace，拿该namespace下的module
      const module = getModuleByNamespace(this.$store, 'mapState', namespace)
      if (!module) {
        return
      }
      // 拿到当前module的state和getters
      state = module.context.state
      getters = module.context.getters
    }
    // Object类型的val是函数，传递过去的参数是state和getters
    return typeof val === 'function'
      ? val.call(this, state, getters)
      : state[val]
  }
  // mark vuex getter for devtools
  res[key].vuex = true
  })
  return res
})
```

`mapState`是`normalizeNamespace`的返回值，从上面的代码可以看到`normalizeNamespace`是进行参数处理，如果存在`namespace`便加上命名空间，对传入的`states`进行`normalizeMap`处理，也就是数据格式的统一，然后遍历，对参数里的所有`state`都包裹一层函数，最后返回一个对象

大概是这么回事吧

```js
export default {
  // ...
  computed: {
    ...mapState(['stateA'])
  }
  // ...
}
```

等价于

```js
export default {
  // ...
  computed: {
    stateA () {
      return this.$store.stateA
    }
  }
  // ...
}
```

##### 3.4 mapGetters

将`store` 中的 `getter` 映射到局部计算属性中

```js
export const mapGetters = normalizeNamespace((namespace, getters) => {
  const res = {}
  normalizeMap(getters).forEach(({ key, val }) => {
    // this namespace has been mutate by normalizeNamespace
    val = namespace + val
    res[key] = function mappedGetter () {
      if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
        return
      }
      if (process.env.NODE_ENV !== 'production' && !(val in this.$store.getters)) {
        console.error(`[vuex] unknown getter: ${val}`)
        return
      }
      return this.$store.getters[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})
```

同样的处理方式，遍历`getters`，只是这里需要加上命名空间，这是因为在注册时`_wrapGetters`中的`getters`是有加上命名空间的

##### 3.4 mapMutations

创建组件方法提交 `mutation`

```js
export const mapMutations = normalizeNamespace((namespace, mutations) => {
  const res = {}
  normalizeMap(mutations).forEach(({ key, val }) => {
    // 返回一个对象，值是函数
    res[key] = function mappedMutation (...args) {
      // Get the commit method from store
      let commit = this.$store.commit
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapMutations', namespace)
        if (!module) {
          return
        }
        commit = module.context.commit
      }
      // 执行mutation，
      return typeof val === 'function'
        ? val.apply(this, [commit].concat(args))
        : commit.apply(this.$store, [val].concat(args))
    }
  })
  return res
})
```

和上面都是一样的处理方式，这里在判断是否存在`namespace`后，`commit`是不一样的，上面可以知道每个`module`都是保存了上下文的，这里如果存在`namespace`就需要使用那个另外处理的`commit`等信息，另外需要注意的是，这里不需要加上`namespace`，这是因为在`module.context.commit`中会进行处理，忘记的可以往上翻，看`makeLocalContext`对`commit`的处理

##### 3.5 mapAction

创建组件方法分发 action

```js
export const mapActions = normalizeNamespace((namespace, actions) => {
  const res = {}
  normalizeMap(actions).forEach(({ key, val }) => {
    res[key] = function mappedAction (...args) {
      // get dispatch function from store
      let dispatch = this.$store.dispatch
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapActions', namespace)
        if (!module) {
          return
        }
        dispatch = module.context.dispatch
      }
      return typeof val === 'function'
        ? val.apply(this, [dispatch].concat(args))
        : dispatch.apply(this.$store, [val].concat(args))
    }
  })
  return res
})
```

和`mapMutations`基本一样的处理方式

#### 4. 插件

`Vuex`中可以传入`plguins`选项来安装各种插件，这些插件都是函数，接受`store`作为参数，`Vuex`中内置了`devtool`和`logger`两个插件，
```js
// 插件注册，所有插件都是一个函数，接受store作为参数
plugins.forEach(plugin => plugin(this))

// 如果开启devtools，注册devtool
if (Vue.config.devtools) {
  devtoolPlugin(this)
}
```

```js
// devtools.js
const devtoolHook =
  typeof window !== 'undefined' &&
  window.__VUE_DEVTOOLS_GLOBAL_HOOK__

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
  })
}
```
