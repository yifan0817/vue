/* @flow */

import { warn, invokeWithErrorHandling } from "core/util/index";
import { cached, isUndef, isTrue, isPlainObject } from "shared/util";

// 前面对不同事件修饰符在name上做了标记,如‘~’,现在需要把它们作为Boolean返回并从name去掉
const normalizeEvent = cached((name: string): {
  name: string,
  once: boolean,
  capture: boolean,
  passive: boolean,
  handler?: Function,
  params?: Array<any>
} => {
  // 默认行为会触发
  const passive = name.charAt(0) === "&";
  name = passive ? name.slice(1) : name;
  // 事件只会触发一次
  const once = name.charAt(0) === "~"; // Prefixed last, checked first
  name = once ? name.slice(1) : name;
  // 添加事件监听器时使用事件捕获模式：即内部元素触发的事件先在此处理，然后才交由内部元素进行处理
  const capture = name.charAt(0) === "!";
  name = capture ? name.slice(1) : name;
  return {
    name,
    once,
    capture,
    passive
  };
});

export function createFnInvoker(
  fns: Function | Array<Function>, // 传入一个事件处理器函数 或 处理器数组
  vm: ?Component
): Function {
  function invoker() {
    const fns = invoker.fns;
    if (Array.isArray(fns)) {
      const cloned = fns.slice();
      for (let i = 0; i < cloned.length; i++) {
        // 多个回调函数就依次调用
        invokeWithErrorHandling(cloned[i], null, arguments, vm, `v-on handler`);
      }
    } else {
      // return handler return value for single handlers
      return invokeWithErrorHandling(fns, null, arguments, vm, `v-on handler`);
    }
  }
  invoker.fns = fns; // invoker函数的fns属性用来存放所传入的处理器
  return invoker;
}

/**
 * Vue 支持 2 种事件类型，原生 DOM 事件和自定义事件，它们主要的区别在于添加和删除事件的方式不一样
 * 自定义事件的派发是往当前实例上派发，可以利用在父组件环境定义回调函数来实现父子组件的通讯
 * 另外要注意一点，只有组件节点才可以添加自定义事件，并且添加原生 DOM 事件需要使用 native 修饰符
 * 而普通元素使用 .native 修饰符是没有作用的，也只能添加原生 DOM 事件
 */

/**
 * 遍历 on 去添加事件监听，遍历 oldOn 去移除事件监听
 * 关于监听和移除事件的方法都是外部传入的
 * 因为它既处理原生 DOM 事件的添加删除，也处理自定义事件的添加删除
 */
export function updateListeners(
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  createOnceHandler: Function,
  vm: Component
) {
  let name, def, cur, old, event;
  for (name in on) {
    def = cur = on[name];
    old = oldOn[name];
    event = normalizeEvent(name); // 处理事件名
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler;
      event.params = def.params;
    }
    // 处理事件回调函数
    if (isUndef(cur)) {
      process.env.NODE_ENV !== "production" &&
        warn(
          `Invalid handler for event "${event.name}": got ` + String(cur),
          vm
        );
    } else if (isUndef(old)) {
      // 第一次：未定义旧事件值
      if (isUndef(cur.fns)) {
        // cur.fns未定义时，创建一个回调函数
        cur = on[name] = createFnInvoker(cur, vm);
      }
      if (isTrue(event.once)) {
        // 生成 once 类型的事件
        cur = on[name] = createOnceHandler(event.name, cur, event.capture);
      }
      // 执行新增事件 vm.$on，完成一次事件绑定
      add(event.name, cur, event.capture, event.passive, event.params);
    } else if (cur !== old) {
      // 新老不同时，进行更新
      // 只需要更改 old.fns = cur 把之前绑定的 involer.fns 赋值为新的回调函数即可
      // 并且 通过 on[name] = old 保留引用关系
      // 这样就保证了事件回调只添加一次，之后仅仅去修改它的回调函数的引用
      old.fns = cur;
      on[name] = old;
    }
  }
  // 把老的里面不需要的清理掉
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name);
      remove(event.name, oldOn[name], event.capture);
    }
  }
}
