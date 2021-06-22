import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
export default class Module {
  /**
   * Module的构造函数
   * @param {*} rawModule 传入的rawModule是options，即new Vuex.Store({state, mutations, actions, getters})的options
   * @param {*} runtime 运行时
   */
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

  get namespaced () {
    return !!this._rawModule.namespaced
  }

  addChild (key, module) {
    // 将子模块添加到_children中
    this._children[key] = module
  }

  removeChild (key) {
    delete this._children[key]
  }

  getChild (key) {
    return this._children[key]
  }

  hasChild (key) {
    return key in this._children
  }

  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  // 遍历子属性
  forEachChild (fn) {
    forEachValue(this._children, fn)
  }

  // 遍历getter
  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  // 遍历action
  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }

  // 遍历mutation
  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}
