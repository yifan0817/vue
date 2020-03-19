/* @flow */

import config from "../config";
import { warn } from "./debug";
import { set } from "../observer/index";
import { unicodeRegExp } from "./lang";
import { nativeWatch, hasSymbol } from "./env";

import { ASSET_TYPES, LIFECYCLE_HOOKS } from "shared/constants";

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from "shared/util";

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 * 选项覆盖策略是处理如何将父选项值和子选项值合并为最终值的函数
 * const strats = Vue.config.optionMergeStrategies
 */
const strats = config.optionMergeStrategies;

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== "production") {
  strats.el = strats.propsData = function(parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
          "creation with the `new` keyword."
      );
    }
    return defaultStrat(parent, child); // el和propsData走默认策略
  };
}

/**
 * Helper that recursively merges two data objects together.
 */
function mergeData(to: Object, from: ?Object): Object {
  if (!from) return to;
  let key, toVal, fromVal;

  // parentVal 里面的keys
  const keys = hasSymbol ? Reflect.ownKeys(from) : Object.keys(from);

  // 遍历 parentVal 里的key
  for (let i = 0; i < keys.length; i++) {
    key = keys[i];
    // in case the object is already observed...
    if (key === "__ob__") continue;
    toVal = to[key];
    fromVal = from[key];
    if (!hasOwn(to, key)) {
      set(to, key, fromVal); // 如果from对象中有to对象里没有的属性，则调用set方法（Vue.$set）
    } else if (
      // 如果相同 key 对应的 value 值不一样，且 value 都是对象，那么递归调用 mergeData
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal);
    }
  }
  return to; // 否则以to的值为准，最后返回to对象
}

/**
 * Data
 */
export function mergeDataOrFn(
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 通过Vue.extend/Vue.component调用了mergeOptions方法，data 应该都是函数形式
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal;
    }
    if (!parentVal) {
      return childVal;
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    // 返回一个函数，这个函数返回两个函数返回结果的合并对象
    return function mergedDataFn() {
      return mergeData(
        typeof childVal === "function" ? childVal.call(this, this) : childVal,
        typeof parentVal === "function" ? parentVal.call(this, this) : parentVal
      );
    };
  } else {
    // 调用new新建vue实例触发mergeOptions方法
    return function mergedInstanceDataFn() {
      // instance merge
      const instanceData =
        typeof childVal === "function" ? childVal.call(vm, vm) : childVal;
      const defaultData =
        typeof parentVal === "function" ? parentVal.call(vm, vm) : parentVal;
      if (instanceData) {
        return mergeData(instanceData, defaultData);
      } else {
        return defaultData;
      }
    };
  }
}

strats.data = function(
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    if (childVal && typeof childVal !== "function") {
      process.env.NODE_ENV !== "production" &&
        warn(
          'The "data" option should be a function ' +
            "that returns a per-instance value in component " +
            "definitions.",
          vm
        );

      return parentVal;
    }
    return mergeDataOrFn(parentVal, childVal);
  }

  return mergeDataOrFn(parentVal, childVal, vm);
};

/**
 * Hooks and props are merged as arrays.
 * Hooks and props 都被合并成数组形式
 */
function mergeHook(
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal) // child和parent都存在该属性，则返回concat之后的属性
      : Array.isArray(childVal)
      ? childVal //   child上存在该属性，parent不存在，且child上的该属性是Array，则直接返回child上的该属性
      : [childVal] // child上存在该属性，parent不存在，且child上的该属性不是Array，则把该属性先转换成Array,再返回
    : parentVal; // child options上不存在该属性，parent options上存在,则返回parent上的属性
  return res ? dedupeHooks(res) : res; // 数组去重
}

function dedupeHooks(hooks) {
  const res = [];
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i]);
    }
  }
  return res;
}

// 生命周期函数钩子统一走mergeHook这个策略
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook;
});

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 * 如果没有 childVal，则直接返回 parentVal
 * 如果有 childVal，则直接返回
 * 则合并 childVal 和 parentVal，以 childVal 上的为准
 */
function mergeAssets(
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null);
  if (childVal) {
    process.env.NODE_ENV !== "production" &&
      assertObjectType(key, childVal, vm);
    return extend(res, childVal);
  } else {
    return res;
  }
}

// components/directives/filters的合并策略
ASSET_TYPES.forEach(function(type) {
  strats[type + "s"] = mergeAssets;
});

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function(
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined;
  if (childVal === nativeWatch) childVal = undefined;
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null);
  if (process.env.NODE_ENV !== "production") {
    assertObjectType(key, childVal, vm);
  }
  if (!parentVal) return childVal;
  const ret = {};
  extend(ret, parentVal);
  for (const key in childVal) {
    let parent = ret[key];
    const child = childVal[key];
    if (parent && !Array.isArray(parent)) {
      parent = [parent];
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child)
      ? child
      : [child];
  }
  return ret;
};

/**
 * Other object hashes.
 * props,methods,inject,computed 等属性的合并策略
 */
strats.props = strats.methods = strats.inject = strats.computed = function(
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== "production") {
    assertObjectType(key, childVal, vm); // 检查 childVal 是否是对象
  }

  if (!parentVal) return childVal; // 如果parent options上没有该属性，则直接返回child options上的该属性

  // 如果parent options和child options都有，则合并parent options和child options并生成一个新的对象。
  // (如果parent和child上有同名属性，合并后的以child options上的为准)
  const ret = Object.create(null);
  extend(ret, parentVal);
  if (childVal) extend(ret, childVal);
  return ret;
};
strats.provide = mergeDataOrFn;

/**
 * Default strategy.
 */
const defaultStrat = function(parentVal: any, childVal: any): any {
  return childVal === undefined ? parentVal : childVal;
};

/**
 * Validate component names
 */
function checkComponents(options: Object) {
  // options.components 是 Object 格式
  for (const key in options.components) {
    validateComponentName(key);
  }
}

/**
 * 验证传入的组件名称是否符合以下特征：
 * 1. 包含数字，字母，下划线，连接符，并且以字母开头
 * 2. 是否和html标签名称或svg标签名称相同
 * 3. 是否和关键字名称相同，如undefined, infinity等
 * 如果满足第一条，并且第2，3条都是不相同的话，那么组件名称可用
 */
export function validateComponentName(name: string) {
  if (
    !new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)
  ) {
    warn(
      'Invalid component name: "' +
        name +
        '". Component names ' +
        "should conform to valid custom element name in html5 specification."
    );
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      "Do not use built-in or reserved HTML elements as component " +
        "id: " +
        name
    );
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 * 确保所有props选项语法均已标准化为对象格式
 */
function normalizeProps(options: Object, vm: ?Component) {
  const props = options.props;
  if (!props) return;
  const res = {};
  let i, val, name;
  if (Array.isArray(props)) {
    i = props.length;
    while (i--) {
      val = props[i];
      if (typeof val === "string") {
        name = camelize(val); // 驼峰式处理props的key值
        res[name] = { type: null }; // value 默认值
      } else if (process.env.NODE_ENV !== "production") {
        warn("props must be strings when using array syntax.");
      }
    }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key];
      name = camelize(key); // 驼峰式处理props的key值
      // 处理这两种情况
      /**
        props: {
          age: {
              type: Number,
            }
          }
        }
        props: {
          height: Number
        }
       */
      res[name] = isPlainObject(val) ? val : { type: val };
    }
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
        `but got ${toRawType(props)}.`,
      vm
    );
  }
  options.props = res;
}

/**
 * Normalize all injections into Object-based format
 * 将所有inject注入标准化为对象格式
 */
function normalizeInject(options: Object, vm: ?Component) {
  const inject = options.inject;
  if (!inject) return;
  const normalized = (options.inject = {});
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] };
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key];
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val };
    }
  } else if (process.env.NODE_ENV !== "production") {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
        `but got ${toRawType(inject)}.`,
      vm
    );
  }
}

/**
 * Normalize raw function directives into object format.
 * 将原始函数指令directives规范化为对象格式
 */
function normalizeDirectives(options: Object) {
  const dirs = options.directives;
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key];
      if (typeof def === "function") {
        dirs[key] = { bind: def, update: def };
      }
    }
  }
}

function assertObjectType(name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
        `but got ${toRawType(value)}.`,
      vm
    );
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 * 实例化和继承中使用的核心方法
 */
export function mergeOptions(
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  if (process.env.NODE_ENV !== "production") {
    checkComponents(child); // 检查组件名称是否合法
  }

  if (typeof child === "function") {
    // 还不清楚什么时候会是函数类型
    child = child.options;
  }

  // 把options中的props,inject,directives属性转换成对象的形式，因为有些传入的时候可能会是数组的形式
  // 参考链接：https://segmentfault.com/a/1190000014707956
  normalizeProps(child, vm); // 规范化props options.props
  normalizeInject(child, vm); // 规范化注入 options.inject
  normalizeDirectives(child); // 规范化自定义指令 options.directive

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  // 传入的options里有mixin或者extends属性时
  // 再次调用mergeOptions方法合并mixins和extends里的内容到实例的构造函数options上（即parent options）
  if (!child._base) {
    if (child.extends) {
      // 类型：Object | Function
      parent = mergeOptions(parent, child.extends, vm);
    }
    if (child.mixins) {
      // 类型：Array<Object>
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm);
      }
    }
  }

  // 参考链接：https://segmentfault.com/a/1190000014738314

  const options = {};
  let key;
  for (key in parent) {
    mergeField(key);
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key);
    }
  }
  function mergeField(key) {
    // strats：所有合并策略
    // defaultStrat：默认合并策略（取child的值）
    const strat = strats[key] || defaultStrat;
    options[key] = strat(parent[key], child[key], vm, key);
  }
  return options;
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset(
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== "string") {
    return;
  }
  const assets = options[type];
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id];
  const camelizedId = camelize(id);
  if (hasOwn(assets, camelizedId)) return assets[camelizedId];
  const PascalCaseId = capitalize(camelizedId);
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId];
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId];
  if (process.env.NODE_ENV !== "production" && warnMissing && !res) {
    warn("Failed to resolve " + type.slice(0, -1) + ": " + id, options);
  }
  return res;
}
