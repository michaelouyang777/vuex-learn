## vuex 源码学习


### 目录结构解析
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

