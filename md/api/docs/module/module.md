* `Module` 类
  
  描述：

  module的构造类，处理单个module的逻辑。

  - `constructor` 构造函数

    描述：

    初始化属性。包括runtime、_children、_rewModule、state，这4个属性


  - `get` 实例方法

    描述：

    获取namespaced


  - `addChild` 实例方法

    描述：

    添加子module


  - `removeChild` 实例方法

    描述：

    移除某个子module


  - `getChild` 实例方法

    描述：

    获取某个子module


  - `hasChild` 实例方法

    描述：

    是否存在某个子module


  - `update` 实例方法

    描述：

    更新module。包括namespaced、actions、mutations、getters
    

  - `forEachChild` 实例方法

    描述：
    
    遍历子属性


  - `forEachGetter` 实例方法

    描述：

    遍历getter


  - `forEachAction` 实例方法

    描述：

    遍历action


  - `forEachMutation` 实例方法

    描述：

    遍历mutation
