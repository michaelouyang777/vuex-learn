* Store类

  描述：

  store的构造类。

  - constructor构造函数

    描述：

    构造函数中主要做了以下几件事：
    1. 环境判断；
    2. 初始变量设置；
    3. moduel树构造；
    4. 将dispatch和commit方法的this指针绑定到store上，防止被修改；
    5. 组装module；
    6. 更新store；
    7. 插件注册。


  - get实例方法

    描述：

    获取state。


  - set实例方法


  - commit实例方法

    描述：


  - dispatch实例方法

    描述：


  - subscribe实例方法

    描述：


  - subscribeAction实例方法

    描述：


  - watch实例方法

    描述：


  - replaceState实例方法

    描述：


  - registerModule实例方法

    描述：


  - unregisterModule实例方法

    描述：


  - hasModule实例方法

    描述：


  - hotUpdate实例方法

    描述：


  - _withCommit实例方法

    描述：

    在执行mutation的时候，会将_committing设置为true，执行完毕后重置。主要用作限定只有commit才能修改state。



* genericSubscribe方法

  描述：


* resetStore方法

  描述：


* resetStoreVM方法

  描述：


* installModule方法

  描述：


* makeLocalContext方法

  描述：


* makeLocalGetters方法

  描述：


* registerMutation方法

  描述：


* registerAction方法

  描述：


* registerGetter方法

  描述：


* enableStrictMode方法

  描述：


* getNestedState方法

  描述：


* unifyObjectStyle方法

  描述：


* install方法

  描述：

