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
    6. 更新store；
    7. 插件注册。


  - `get` 实例方法

    描述：

    获取state。


  - `set` 实例方法

    描述：

    此方法仅在开发vuex断言使用。


  - `commit` 实例方法

    描述：


  - `dispatch` 实例方法

    描述：


  - `subscribe` 实例方法

    描述：


  - `subscribeAction` 实例方法

    描述：


  - `watch` 实例方法

    描述：


  - `replaceState` 实例方法

    描述：


  - `registerModule` 实例方法

    描述：


  - `unregisterModule` 实例方法

    描述：


  - `hasModule` 实例方法

    描述：


  - `hotUpdate` 实例方法

    描述：


  - `_withCommit` 实例方法

    描述：

    在执行mutation的时候，会将_committing设置为true，执行完毕后重置。主要用作限定只有commit才能修改state。



* `genericSubscribe` 方法

  描述：


* `resetStore` 方法

  描述：


* `resetStoreVM` 方法

  描述：


* `installModule` 方法

  描述：


* `makeLocalContext` 方法

  描述：


* `makeLocalGetters` 方法

  描述：


* `registerMutation` 方法

  描述：


* `registerAction` 方法

  描述：


* `registerGetter` 方法

  描述：


* `enableStrictMode` 方法

  描述：


* `getNestedState` 方法

  描述：


* `unifyObjectStyle` 方法

  描述：


* `install` 方法

  描述：

