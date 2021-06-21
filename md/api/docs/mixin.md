* `function` 默认函数
  
  描述：
  ```js
  export default function (Vue) { 
    ... 
  }
  ```
  导出一个函数，函数内整合了对应的vue版本采用不同的方案加载vuex。

  > **函数内部函数**
  
  - vuexInit
    
    描述：
  
    获取`$options`中的store，所以组件实例都赋值上`$store`，一层一层传递下去，实现所有组件都带有`$store`属性。

