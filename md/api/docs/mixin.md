* 导出一个函数
  ```js
  export default function (Vue) { 
    ... 
  }
  ```
  
  函数内部函数
  
  - vuexInit
    
    描述：
  
      获取$options中的store，所以组件实例都赋值上$store，一层一层传递下去，实现所有组件都带有$store属性。


