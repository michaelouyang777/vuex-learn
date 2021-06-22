* `Store` 类

  描述：

  store的构造类。

  - `constructor` 构造函数

    描述：

    构造函数中主要做了以下几件事：
    1. 环境判断；
    2. 初始变量设置；
    3. moduel树构造；
    4. 将dispatch和commit方法的this指针绑定到store上，防止被修改；
    5. 组装module；
    6. _vm组件设置；
    7. 插件注册。


  - `get` 实例方法

    描述：

    获取state。


  - `set` 实例方法

    描述：

    此set方法仅在开发vuex断言使用。


  - `commit` 实例方法

    描述：

    store实例使用提交给mutation的方法。


  - `dispatch` 实例方法

    描述：

    store实例用于提交action的方法。


  - `subscribe` 实例方法

    描述：

    订阅方法。


  - `subscribeAction` 实例方法

    描述：

    订阅action，用于监听action。


  - `watch` 实例方法

    描述：

    用于监听一个getter值的变化。


  - `replaceState` 实例方法

    描述：

    替换state。


  - `registerModule` 实例方法

    描述：

    动态注册module。


  - `unregisterModule` 实例方法

    描述：

    根据path注销module。


  - `hasModule` 实例方法

    描述：
    
    判断是否存在该module。


  - `hotUpdate` 实例方法

    描述：
    
    热更新store。


  - `_withCommit` 实例方法

    描述：

    在执行mutation的时候，会将_committing设置为true，执行完毕后重置。主要用作限定只有commit才能修改state。



* `genericSubscribe` 方法

  描述：

  定义一个通用的订阅者方法。


* `resetStore` 方法

  描述：

  重置store。


* `resetStoreVM` 方法

  描述：

  创建了当前store实例的_vm组件。


* `installModule` 方法

  描述：
  
  组装module。


* `makeLocalContext` 方法

  描述：

  设置module的上下文，绑定对应的dispatch、commit、getters、state。


* `makeLocalGetters` 方法

  描述：

  设置当前的getters，给getters添加一层代理，去掉命名空间。


* `registerMutation` 方法

  描述：

  注册mutation。


* `registerAction` 方法

  描述：

  注册action。


* `registerGetter` 方法

  描述：

  注册getter。


* `enableStrictMode` 方法

  描述：

  使用$watch来观察state的变化，禁止从mutation外部修改state（用于strict模式下），如果在mutation之外修改state，则报错。


* `getNestedState` 方法

  描述：

  获取嵌套的state。


* `unifyObjectStyle` 方法

  描述：
  
  配置参数处理。统一参数的格式。


* `install` 方法

  描述：

  Vuex的装载方法。在使用`Vue.use(plugin)`时，会执行此方法。
