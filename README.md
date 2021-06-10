## vuex 源码学习



### vuex 研究版本
vuex v3.6.2




### 目录结构

vuex的主体目录结构如下：
~~~
|-- .github                    // 贡献者、issue、PR模版
|-- dist                       // 打包后的文件
|-- docs                       // 文档
|-- docs-gitbook               // 在线文档
|-- examples                   // 示例代码
|-- scripts
|-- src                        // 入口文件以及各种辅助文件
|-- test                       // 单元测试文件
|-- types                      // 类型声明
|-- .babelrc                   // babel相关配置
|-- .eslintrc.json             // eslint相关配置
|-- .gitignore
|-- CHANGELOG.md
|-- jest.config.js             // jest配置文件
|-- LICENSE                    // 版权协议相关
|-- package.json
|-- README.md                  // 项目说明文档
|-- rollup.config.js
|-- rollup.logger.config.js
|-- rollup.main.config.js
|-- yarn.lock
~~~

再来看看src文件夹中有些什么文件
~~~
|-- module                     // 模块相关处理的文件夹
|   |-- module.js              // 生成模块对象
|   |-- module-collection.js   // 递归解析模块配置，生成由「module.js 」的模块对象组成的模块树
|-- plugin                     // 插件相关，与主体功能无关
|   |-- devtool.js             // chrome 的 vue 调试插件中使用到的代码，主要实现数据回滚功能
|   |-- logger.js              // 日志打印相关
|-- helpers.js                 // 辅助函数。提供mapGetters、mapActions、mapMutations等函数的实现
|-- index.js                   // 入口文件
|-- mixin.js                   // vue 混合函数，实现 vuex 的安装功能
|-- store.js                   // vuex 存储类，实现 vuex 的主体功能
|-- util.js                    // 工具函数库，复用一些常用函数
~~~




--------------------------------------




### 学习源码前的一些疑问

先将问题抛出来，使学习和研究更有针对性：
1. 使用Vuex只需执行 Vue.use(Vuex)，并在Vue的配置中传入一个store对象的示例，store是如何实现注入的？
2. state内部是如何实现支持模块配置和模块嵌套的？
3. 在执行dispatch触发action（commit同理）的时候，只需传入（type, payload），action执行函数中第一个参数store从哪里获取的？
4. 如何区分state是外部直接修改，还是通过mutation方法修改的？
5. 调试时的“时空穿梭”功能是如何实现的？




--------------------------------------




### 源码分析

#### 1. 初始化装载与注入

##### 1-1. 装载实例

先从一个简单的示例入手，一步一步分析整个代码的执行过程，下面是一个简单示例：

```js
// store.js
// 加载Vuex，创建并导出一个空配置的store对象实例。

import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

export default new Vuex.Store()
```

```js
// main.js
// 在Vue主入口文件中，引入store到装载到vue options上

import Vue from 'vue'
import App from './../pages/app.vue'
import store from './store.js'

new Vue({
  el: '#root',
  store, 
  render: h => h(App)
})
```

##### 1-2. 装载分析

Vue官方建议的插件使用方法是使用Vue.use()方法，这个方法会调用插件的install方法，将Vuex装载到Vue对象上。先看下Vue.use方法实现：

```js
function (plugin: Function | Object) {
  /* istanbul ignore if */
  if (plugin.installed) {
    return
  }
  // additional parameters
  const args = toArray(arguments, 1)
  args.unshift(this)
  if (typeof plugin.install === 'function') {
    // 实际执行插件的install方法
    plugin.install.apply(plugin, args)
  } else {
    plugin.apply(null, args)
  }
  plugin.installed = true
  return this
}
```

store.js内定义局部 Vue 变量，用于判断是否已经装载和减少全局作用域查找。

```js 
// store.js
// 声明了一个Vue变量，这个变量在install方法中会被赋值，
// 这样可以给当前作用域提供Vue，这样做的好处是不需要额外import Vue from 'vue'
let Vue

// ...
// ...
// ...

// 若是首次加载，将局部Vue变量赋值为全局的Vue对象，并执行applyMixin方法
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
```

声明了一个Vue变量，这个变量在install方法中会被赋值，这样可以给当前作用域提供Vue，这样做的好处是不需要额外`import Vue from 'vue'` 不过我们也可以这样写，然后让打包工具不要将其打包，而是指向开发者所提供的Vue，比如webpack的`externals`，这里就不展开了。

执行install会先判断Vue是否已经被赋值，避免二次安装。然后调用`applyMixin`方法，代码如下：

```js
// mixin.js
// applyMixin
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
```

这里会区分vue的版本，2.x和1.x的钩子是不一样的，如果是2.x使用`beforeCreate`，1.x即使用`_init`。

当我们在执行`new Vue`启动一个Vue应用程序时，需要给上`store`变量，根组件从这里拿到`store`，子组件从父组件拿到，这样一层一层传递下去，实现所有组件都有`$store`属性，这样我们就可以在任何组件中通过`this.$store`访问到`store`

看个图例理解下store的传递。

页面Vue结构图：
![component-tree](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/component-tree.jpg)

对应store流向：
![store-flow](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/store-flow.jpg)



#### 2.store初始化

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
// main.js
new Vue({
  el: '#app',
  store, // 传入store，在beforeCreate钩子中会用到
  render: h => h(Counter)
})
```

这里是调用Store构造函数，传入一个对象，包括state、actions等等，接下去看看Store构造函数都做了些什么。

先看下构造方法的整体逻辑流程来帮助后面的理解：

![store-constructor](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/store-constructor.jpg)

```js
// store.js

export class Store {
  constructor (options = {}) {
    /************************
     * 环境判断          
     ************************/
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

    const {
      plugins = [],
      strict = false
    } = options


    /************************
     * 初始变量设置          
     ************************/
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
    this._modules = new ModuleCollection(options)
    // 用于保存namespaced的模块
    this._modulesNamespaceMap = Object.create(null)
    // 用于监听mutation
    this._subscribers = []
    // 用于响应式地监测一个 getter 方法的返回值
    this._watcherVM = new Vue()
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

    // strict mode
    this.strict = strict
    const state = this._modules.root.state


    /************************
     * 组装module
     ************************/
    // 这里是module处理的核心，包括处理根module、action、mutation、getters和递归注册子module
    installModule(this, state, [], this._modules.root)


    /************************
     * 更新store
     ************************/
    // 使用vue实例来保存state和getter
    resetStoreVM(this, state)

    
    /************************
     * 插件注册
     ************************/
    plugins.forEach(plugin => plugin(this))

    if (Vue.config.devtools) {
      devtoolPlugin(this)
    }
  }
}
```


##### 2-1. 环境判断

开始分析store的构造函数，分小节逐函数逐行的分析其功能。

```js
// store.js

constructor (options = {}) {

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
}
```

在store构造函数中执行环境判断，判断Vue是不是挂载在`window`上，如果是的话，自动调用`install`方法。

然后进行断言，其中包含：
1. 必须先调用Vue.use(Vuex)进行装载；
2. 支持Promise语法。必须提供`Promise`，让开发者自行提供`Promise`的`polyfill`，一般我们可以使用`babel-runtime`引入。
3. 是否Store的实例。最后断言必须使用new操作符调用Store函数。

> NOTE：assert函数是一个简单的断言函数的实现，一行代码即可实现。

```js
/**
 * 判断是否存在对象，没有则抛出error
 * @param {*} condition 
 * @param {*} msg 
 */
export function assert (condition, msg) {
  if (!condition) throw new Error(`[vuex] ${msg}`)
}
```



##### 2-2. 数据初始化

环境判断后，初始化内部数据，并根据new Vuex.store(options) 时传入的options对象，收集modules。

1. `_committing`：提交状态的标志，在_withCommit中，当使用`mutation`时，会先赋值为`true`，再执行`mutation`，修改`state`后再赋值为`false`，在这个过程中，会用`watch`实时监听state的变化时是否`_committing`为true，从而保证只能通过`mutation`来修改`state`
2. `_actions`：用于保存所有action，里面会先包装一次
3. `_actionSubscribers`：用于保存订阅action的回调
4. `_mutations`：用于保存所有的mutation，里面会先包装一次
5. `_wrappedGetters`：用于保存包装后的getter
6. `_modules`：用于保存一棵module树
7. `_modulesNamespaceMap`：用于保存namespaced的模块
8. `_subscribers`：订阅函数集合，Vuex提供了subscribe功能
9. `_watcherVM`： Vue组件用于watch监视变化
10. `_makeLocalGettersCache`: 用于保存本地getters缓存

```js
// store.js
const {
  plugins = [],
  strict = false
} = options

// store internal state
this._committing = false // 是否在进行提交状态标识
this._actions = Object.create(null) // acitons操作对象
this._actionSubscribers = [] // _actionSubscribers：用于保存订阅action的回调
this._mutations = Object.create(null) // mutations操作对象
this._wrappedGetters = Object.create(null) // 封装后的getters集合对象
this._modules = new ModuleCollection(options) // Vuex支持store分模块传入，存储分析后的modules
this._modulesNamespaceMap = Object.create(null) // 模块命名空间map
this._subscribers = [] // 订阅函数集合，Vuex提供了subscribe功能
this._watcherVM = new Vue() // Vue组件用于watch监视变化
this._makeLocalGettersCache = Object.create(null) // 用于保存本地getters缓存
```



##### 2-3 .module树构造（模块收集）

接下的是重点

调用 new Vuex.store(options) 时传入的options对象，用于构造ModuleCollection类。

```js
this._modules = new ModuleCollection(options)
```

看看ModuleCollection类都做了什么，部分代码如下：

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
    if (__DEV__) {
      // 断言 rawModule中的getters、actions、mutations必须为指定的类型
      assertRawModule(path, rawModule)
    }

    // 实例化一个module
    const newModule = new Module(rawModule, runtime)
    if (path.length === 0) {
      // 根module 绑定到root属性上
      this.root = newModule
    } else {
      // 子module 添加其父module的_children属性上
      const parent = this.get(path.slice(0, -1))
      parent.addChild(path[path.length - 1], newModule)
    }

    // register nested modules
    // 如果当前模块存在子模块（modules字段）
    // 遍历子模块，逐个注册，最终形成一个树
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  } 
}
```

```js
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

调用`new ModuleCollection(options)`，将options对象传入，主要执行的是调用 `this.register([], rawRootModule, false)` 的逻辑。`register`实例方法逻辑步骤如下：
1. 首先实例化一个module对象。
2. 通过`path`的长度判断是否为根module。
3. 如果是根module，挂载到root中。
4. 如果不是根module（即子module），子module添加其父module的_children属性上。
5. 再判断当前module是否存在子module，递归遍历所有的module，并调用 `this.register(path.concat(key), rawChildModule, runtime)` 对module进行注册。
6. 最终options对象被构造成一个完整的组件树。

![ModuleCollection](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/module-collection.jpeg)



##### 2-4. dispatch与commit设置（绑定commit和dispatch的this指针）

继续回到store的构造函数代码。

```js
// store.js

// bind commit and dispatch to self
const store = this
const { dispatch, commit } = this

this.dispatch = function boundDispatch (type, payload) {
  return dispatch.call(store, type, payload)
}

this.commit = function boundCommit (type, payload, options) {
  return commit.call(store, type, payload, options)
}
```

封装替换原型中的dispatch和commit方法，将this指向当前store对象。

比如下面这样的骚操作，也不会影响到程序的运行：
```js
this.$store.dispatch.call(this, 'someAction', payload)
```

dispatch和commit方法具体实现如下：

```js
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
```

前面提到，dispatch的功能是触发并传递一些参数（payload）给对应type的action。因为其支持2种调用方法，所以在dispatch中，先进行参数的适配处理，然后判断action type是否存在，若存在就逐个执行（注：上面代码中的this._actions[type] 以及 下面的 this._mutations[type] 均是处理过的函数集合，具体内容留到后面进行分析）。

commit方法和dispatch相比虽然都是触发type，但是对应的处理却相对复杂，代码如下。

```js
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
```

该方法同样支持2种调用方法。先进行参数适配，判断触发mutation type，利用_withCommit方法执行本次批量触发mutation处理函数，并传入payload参数。执行完成后，通知所有_subscribers（订阅函数）本次操作的mutation对象以及当前的state状态，如果传入了已经移除的silent选项则进行提示警告。



###### state修改方法
_withCommit是一个代理方法，所有触发mutation的进行state修改的操作都经过它，由此来统一管理监控state状态的修改。实现代码如下：
```js
_withCommit (fn) {
  // 保存之前的提交状态
  const committing = this._committing
    
  // 进行本次提交，若不设置为true，直接修改state，strict模式下，Vuex将会产生非法修改state的警告
  this._committing = true
    
  // 执行state的修改操作
  fn()
    
  // 修改完成，还原本次修改之前的状态
  this._committing = committing
}
```

缓存执行时的committing状态将当前状态设置为true后进行本次提交操作，待操作完毕后，将committing状态还原为之前的状态。



##### 2-5. module模块安装

module模块安装是store的核心部分。

绑定dispatch和commit方法之后，进行严格模式的设置，以及模块的安装（installModule）。
> 由于占用资源较多影响页面性能，严格模式建议只在开发模式开启，上线后需要关闭。

```js
// store.js

// strict mode
this.strict = strict

// init root module.
// this also recursively registers all sub-modules
// and collects all module getters inside this._wrappedGetters
// 这里是module处理的核心，包括处理根module、action、mutation、getters和递归注册子module
installModule(this, state, [], this._modules.root)
```

```js
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
```

###### 2-5-1. 初始化rootState

`installModule`方法初始化组件树根组件、注册所有子组件，并将其中所有的getters存储到this._wrappedGetters属性中，看看其中的代码实现：
```js
// store.js

function installModule (store, rootState, path, module, hot) {
  // path中字符为0，则说明是根root
  const isRoot = !path.length
  // 获取path的命名空间
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  // 如果module有命名空间
  if (namespace) {
    // 将module保存到对应namespace的store上
    store._modulesNamespaceMap[namespace] = module
  }

  // 非根组件设置 state 方法
  if (!isRoot && !hot) {
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      // 使用Vue.set将state设置为响应式
      Vue.set(parentState, moduleName, module.state)
    })
  }
  
  ······
}
```

获取path的命名空间，判断是否存在`namespace`，如果module有命名空间，将module保存到对应namespace的store上。
再判断是否为根组件且不是hot条件的情况下，
通过getNestedState方法拿到父级module的state，
拿到当前module的name，
调用`Vue.set(parentState, moduleName, module.state)`方法，将当前module的state挂载到父state对象的moduleName属性中，由此实现该模块的state注册（首次执行这里，因为是根目录注册，所以并不会执行该条件中的方法）。

getNestedState方法代码很简单，分析path拿到state，如下：
```js
// module/module-collection.js

function getNestedState (state, path) {
  return path.length
    ? path.reduce((state, key) => state[key], state)
    : state
}
```


###### 2-5-2. module上下文环境设置

命名空间和根目录条件判断完毕后，接下来定义 **local变量** 和 **module.context** 的值。执行`makeLocalContext`方法，**为该module设置局部的 dispatch、commit、getters和state**（由于namespace的存在需要做兼容处理）。

```js
// store.js

function installModule (store, rootState, path, module, hot) {
  ······

  // 设置module的上下文，绑定对应的dispatch、commit、getters、state
  const local = module.context = makeLocalContext(store, namespace, path)
  
  ······
}
```

这里会判断`module`的`namespace`是否存在，不存在不会对`dispatch`和`commit`做处理，如果存在，给`type`加上`namespace`，如果声明了`{root: true}`也不做处理，另外`getters`和`state`需要延迟处理，需要等数据更新后才进行计算，所以使用`Object.defineProperties`的getter函数，当访问的时候再进行计算。
```js
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

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

```



###### 2-5-3. mutations、actions、getters注册

定义local环境后，循环注册我们在options中配置的 **action、mutation、getters** 等。逐个分析各注册函数之前，先看下模块间的逻辑关系流程图：
![vuex-flow](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/vuex-flow.jpg)

下面分析代码逻辑：
```js
// 注册对应模块的mutation，供state修改使用
module.forEachMutation((mutation, key) => {
  const namespacedType = namespace + key
  registerMutation(store, namespacedType, mutation, local)
})

// 注册对应模块的action，供数据操作、提交mutation等异步操作使用
module.forEachAction((action, key) => {
  const namespacedType = namespace + key
  registerAction(store, namespacedType, action, local)
})

// 注册对应模块的getters，供state读取使用
module.forEachGetter((getter, key) => {
  const namespacedType = namespace + key
  registerGetter(store, namespacedType, getter, local)
})
```

先看注册`mutation`：

`mutation`的注册比较简单，主要是包一层函数，然后保存到`store._mutations`里面。
由于是通过push存到`store._mutations`里面，所以`mutation`可以重复注册，不会覆盖。

`registerMutation`方法中，获取store中的对应mutation type的处理函数集合，将新的处理函数push进去。
这里将我们设置在mutations type上对应的 handler 进行了封装，给原函数传入了state。
在执行 `this.$store.commit('xxx', payload)` 的时候，type为 'xxx' 的mutation的所有handler都会接收到state以及payload，这就是在handler里面拿到state的原因。

```js
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
```

再来看看store的实例方法commit方式的实现：

首先对参数进行统一处理，因为是支持对象风格和载荷风格的，然后拿到当前`type`对应的mutation数组，使用`_withCommit`包裹逐一执行，这样我们执行`this.$store.commit`的时候会调用对应的`mutation`，而且第一个参数是`state`，然后再执行`mutation`的订阅函数
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

接下去看`action`的注册：

和`mutation`很类似，使用函数包一层然后push到`store._actions`中，有些不同的是执行时参数比较多，这也是为什么我们在写`action`时可以解构拿到`commit`等的原因，然后再将返回值`promisify`，这样可以支持链式调用，但实际上用的时候最好还是自己返回`promise`，因为通常`action`是异步的，比较多见是发起请求，进行链式调用也是想当异步完成后再执行，具体根据业务需求来。
```js
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
```

接下去再看看`dispatch`函数的实现：

这里和`commit`也是很类似的，对参数统一处理，拿到action数组，如果长度大于一，用`Promise.all`包裹，不过直接执行，然后返回执行结果。
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

接下去是`getters`的注册：

首先对`getters`进行判断，和`mutation`是不同的，这里是不允许重复定义的，然后包裹一层函数，这样在调用时只需要给上`store`参数，而用户的函数里会包含`local.state` `local.getters` `store.state` `store.getters`
```js
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
```

最后，`wrappedActionHandler` 比 `wrappedMutationHandler` 以及 `wrappedGetter` 多拿到dispatch和commit操作方法，因此action可以进行dispatch action和commit mutation操作。


###### 2-5-4. 子module安装

注册完了根组件的actions、mutations以及getters后，递归调用自身，为子组件注册其state，actions、mutations以及getters等。

```js
// 递归注册子module
module.forEachChild((child, key) => {
  installModule(store, rootState, path.concat(key), child, hot)
})
```



###### 2-5-5. 实例结合

前面介绍了dispatch和commit方法以及actions等的实现，下面结合一个官方的购物车实例中的部分代码来加深理解。

Vuex配置代码：

```js
/
 *  store-index.js store配置文件
 *
 /

import Vue from 'vue'
import Vuex from 'vuex'
import * as actions from './actions'
import * as getters from './getters'
import cart from './modules/cart'
import products from './modules/products'
import createLogger from '../../../src/plugins/logger'

Vue.use(Vuex)

const debug = process.env.NODE_ENV !== 'production'

export default new Vuex.Store({
  actions,
  getters,
  modules: {
    cart,
    products
  },
  strict: debug,
  plugins: debug ? [createLogger()] : []
})
```

Vuex组件module中各模块state配置代码部分：
```js
/**
 *  cart.js
 *
 **/
 
const state = {
  added: [],
  checkoutStatus: null
}

/**
 *  products.js
 *
 **/
 
const state = {
  all: []
}
```

加载上述配置后，页面state结构如下图：
![state](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/state.jpg)

state中的属性配置都是按照option配置中module path的规则来进行的，下面看action的操作实例。

Vuecart组件代码部分：
```js
/**
 *  Cart.vue 省略template代码，只看script部分
 *
 **/
 
export default {
  methods: {
    // 购物车中的购买按钮，点击后会触发结算。源码中会调用 dispatch方法
    checkout (products) {
      this.$store.dispatch('checkout', products)
    }
  }
}
```

Vuexcart.js组件action配置代码部分：
```js
const actions = {
  checkout ({ commit, state }, products) {
    const savedCartItems = [...state.added] // 存储添加到购物车的商品
    commit(types.CHECKOUT_REQUEST) // 设置提交结算状态
    shop.buyProducts( // 提交api请求，并传入成功与失败的cb-func
      products,
      () => commit(types.CHECKOUT_SUCCESS), // 请求返回成功则设置提交成功状态
      () => commit(types.CHECKOUT_FAILURE, { savedCartItems }) // 请求返回失败则设置提交失败状态
    )
  }
}
```

Vue组件中点击购买执行当前module的dispatch方法，传入type值为 ‘checkout’，payload值为 ‘products’，在源码中dispatch方法在所有注册过的actions中查找’checkout’的对应执行数组，取出循环执行。执行的是被封装过的被命名为wrappedActionHandler的方法，真正传入的checkout的执行函数在wrappedActionHandler这个方法中被执行，源码如下（注：前面贴过，这里再看一次）：
```js
function wrappedActionHandler (payload, cb) {
    let res = handler({
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload, cb)
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  }
```

handler在这里就是传入的checkout函数，其执行需要的commit以及state就是在这里被传入，payload也传入了，在实例中对应接收的参数名为products。commit的执行也是同理的，实例中checkout还进行了一次commit操作，提交一次type值为types.CHECKOUT_REQUEST的修改，因为mutation名字是唯一的，这里进行了常量形式的调用，防止命名重复，执行跟源码分析中一致，调用 function wrappedMutationHandler (payload) { handler(local.state, payload) } 封装函数来实际调用配置的mutation方法。

看到完源码分析和上面的小实例，应该能理解dispatch action和commit mutation的工作原理了。接着看源码，看看getters是如何实现state实时访问的。










##### 2-6. store._vm组件设置

执行`resetStoreVM`方法，进行store组件的初始化。

```js
// initialize the store vm, which is responsible for the reactivity
// (also registers _wrappedGetters as computed properties)
resetStoreVM(this, state)
```

综合前面的分析可以了解到，Vuex其实构建的就是一个名为store的vm组件，所有配置的state、actions、mutations以及getters都是其组件的属性，所有的操作都是对这个vm组件进行的。

一起看下resetStoreVM方法的内部实现：
```js
// store.js

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
```

这里会重新设置一个新的vue实例，用来保存`state`和`getter`，`getters`保存在计算属性中，会给`getters`加一层代理，这样可以通过`this.$store.getters.xxx`访问到，而且在执行getters时只传入了`store`参数，这个在上面的`registerGetter`已经做了处理，也是为什么我们的`getters`可以拿到`state` `getters` `rootState` `rootGetters`的原因。然后根据用户设置开启`strict`模式，如果存在oldVm，解除对state的引用，等dom更新后把旧的vue实例销毁

上面代码涉及到了严格模式的判断，看一下严格模式如何实现的：

```js
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
```

使用`$watch`来观察`state`的变化，如果没有通过 this._withCommit() 方法进行state修改，则报错。



##### 2-7. 插件注册

```js
// apply plugins
plugins.forEach(plugin => plugin(this))

if (Vue.config.devtools) {
  devtoolPlugin(this)
}
```

到这里`store`的初始化工作已经完成。大概长这个样子

![store](https://raw.githubusercontent.com/michaelouyang777/vuex-learn/dev/md/imgs/vuex-store.jpg)

看到这里，相信已经对`store`的一些实现细节有所了解，另外`store`上还存在一些api，但是用到的比较少，可以简单看看都有些啥


##### 插件

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


#### 3. 其他api

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

#### 4. 辅助函数

为了避免每次都需要通过`this.$store`来调用api，`vuex`提供了`mapState` `mapMutations` `mapGetters` `mapActions` `createNamespacedHelpers` 等api，接着看看各api的具体实现，存放在`src/helpers.js`

##### 4.1 一些工具函数

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

##### 4.2 mapState

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

##### 4.3 mapGetters

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

##### 4.4 mapMutations

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

##### 4.5 mapAction

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

