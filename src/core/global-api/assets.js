/* @flow */

import { ASSET_TYPES } from "shared/constants";
import { isPlainObject, validateComponentName } from "../util/index";

//初始化 Vue.component、directive和filter函数
export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function(
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + "s"][id];
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== "production" && type === "component") {
          validateComponentName(id);
        }
        if (type === "component" && isPlainObject(definition)) {
          // 一般情况下传入的是一个构造函数，当传入的是选项对象时 (自动调用 Vue.extend)生成构造函数
          definition.name = definition.name || id;
          definition = this.options._base.extend(definition);
        }
        if (type === "directive" && typeof definition === "function") {
          definition = { bind: definition, update: definition };
        }
        this.options[type + "s"][id] = definition; // 将组件注册到Vue.options["components/xxx/yyy"]上
        // 后面的组件实例化时，会执行 merge options 逻辑，把Sub.options.components/xxx/yyy 合并到 vm.$options.components/xxx/yyy 上
        // src/core/vdom/create-element.js 中执行 _createElement 时在 resolveAsset 的时候拿到这个组件的构造函数，并作为 createComponent 的钩子的参数
        // 从而实现该组件的全局注册
        return definition;
      }
    };
  });
}

// 局部注册和全局注册不同的是，只有该类型的组件才可以访问局部注册的子组件
// 而全局注册是扩展到 Vue.options 下，所以在所有组件创建的过程中
// 都会从全局的 Vue.options.components 去merge options扩展到当前组件的 vm.$options.components 下
// 这就是全局注册的组件能被任意使用的原因
