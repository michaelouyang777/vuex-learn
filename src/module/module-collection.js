import Module from './module'
import { assert, forEachValue } from '../util'

/**
 * 模块收集类
 * 用于模块化开发
 */
export default class ModuleCollection {
  /**
   * ModuleCollection的构造函数
   * @param {*} rawRootModule 传入的rawRootModule是options，即new Vuex.Store({state, mutations, actions, getters})的options
   */
  constructor(rawRootModule) {
    // 注册 root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }

  /**
   * 获取module
   * @param {*} path 
   */
  get(path) {
    // 根据path获取module
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  /**
   * 获取namespace
   * @param {*} path 
   */
  getNamespace(path) {
    let module = this.root
    return path.reduce((namespace, key) => {
      module = module.getChild(key)
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  /**
   * 更新module
   * @param {*} rawRootModule 
   */
  update(rawRootModule) {
    update([], this.root, rawRootModule)
  }

  /**
   * 递归注册module
   *   path是路径 如
   *   {
   *      modules: {
   *        a: {
   *          state: {}
   *        }
   *      }
   *   }
   *   a模块的path => ['a']
   *   根模块的path => []
   * @param {*} path 路径
   * @param {*} rawModule 传入的rawModule是options，即new Vuex.Store({state, mutations, actions, getters})的options
   * @param {*} runtime runtime默认为true
   */
  register(path, rawModule, runtime = true) {
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

  /**
   * 注销某个module
   * @param {*} path 路径
   */
  unregister(path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]
    const child = parent.getChild(key)

    if (!child) {
      if (__DEV__) {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        )
      }
      return
    }

    if (!child.runtime) {
      return
    }

    parent.removeChild(key)
  }

  /**
   * 是否已经注册
   * @param {*} path 路径
   */
  isRegistered(path) {
    const parent = this.get(path.slice(0, -1))
    const key = path[path.length - 1]

    // 如果存在返回true
    if (parent) {
      return parent.hasChild(key)
    }

    // 否则返回false
    return false
  }
}

/**
 * 递归更新module
 * @param {*} path 路径
 * @param {*} targetModule 当前module
 * @param {*} newModule 新module
 */
function update(path, targetModule, newModule) {
  if (__DEV__) {
    assertRawModule(path, newModule)
  }

  // update target module
  targetModule.update(newModule)

  // update nested modules
  if (newModule.modules) {
    for (const key in newModule.modules) {
      if (!targetModule.getChild(key)) {
        if (__DEV__) {
          console.warn(
            `[vuex] trying to add a new module '${key}' on hot reloading, ` +
            'manual reload is needed'
          )
        }
        return
      }
      update(
        path.concat(key),
        targetModule.getChild(key),
        newModule.modules[key]
      )
    }
  }
}

const functionAssert = {
  assert: value => typeof value === 'function',
  expected: 'function'
}

const objectAssert = {
  assert: value => typeof value === 'function' ||
    (typeof value === 'object' && typeof value.handler === 'function'),
  expected: 'function or object with "handler" function'
}

const assertTypes = {
  getters: functionAssert,
  mutations: functionAssert,
  actions: objectAssert
}

/**
 * 断言module
 * @param {*} path 
 * @param {*} rawModule 
 */
function assertRawModule(path, rawModule) {
  Object.keys(assertTypes).forEach(key => {
    if (!rawModule[key]) return

    const assertOptions = assertTypes[key]

    forEachValue(rawModule[key], (value, type) => {
      assert(
        assertOptions.assert(value),
        makeAssertionMessage(path, key, type, value, assertOptions.expected)
      )
    })
  })
}

/**
 * 组合断言信息
 * @param {*} path 
 * @param {*} key 
 * @param {*} type 
 * @param {*} value 
 * @param {*} expected 
 */
function makeAssertionMessage(path, key, type, value, expected) {
  let buf = `${key} should be ${expected} but "${key}.${type}"`
  if (path.length > 0) {
    buf += ` in module "${path.join('.')}"`
  }
  buf += ` is ${JSON.stringify(value)}.`
  return buf
}
