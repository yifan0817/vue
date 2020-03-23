/* @flow */

import config from "../config";
import { initUse } from "./use";
import { initMixin } from "./mixin";
import { initExtend } from "./extend";
import { initAssetRegisters } from "./assets";
import { set, del } from "../observer/index";
import { ASSET_TYPES } from "shared/constants";
import builtInComponents from "../components/index";
import { observe } from "core/observer/index";

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from "../util/index";

// 给 Vue 这个对象本身扩展全局的静态方法
export function initGlobalAPI(Vue: GlobalAPI) {
  // config
  const configDef = {};
  configDef.get = () => config;
  if (process.env.NODE_ENV !== "production") {
    configDef.set = () => {
      warn(
        "Do not replace the Vue.config object, set individual fields instead."
      );
    };
  }
  Object.defineProperty(Vue, "config", configDef);

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  };

  Vue.set = set;
  Vue.delete = del;
  Vue.nextTick = nextTick;

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj);
    return obj;
  };

  Vue.options = Object.create(null);
  // options中添加components、directives、filters属性
  // Vue.options.components = {}
  // Vue.options.directives = {}
  // Vue.options.filters = {}
  ASSET_TYPES.forEach(type => {
    Vue.options[type + "s"] = Object.create(null);
  });

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // options中添加_base属性
  Vue.options._base = Vue;

  // 把一些内置组件扩展到 Vue.options.components
  // options中components添加 <keep-alive> 组件 Vue.options.components.KeepAlive : {}
  extend(Vue.options.components, builtInComponents);

  initUse(Vue);
  initMixin(Vue);
  initExtend(Vue);
  initAssetRegisters(Vue); // 注册 Vue.component、directive和filter函数
}
