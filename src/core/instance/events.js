/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from "../util/index";
import { updateListeners } from "../vdom/helpers/index";

export function initEvents(vm: Component) {
  vm._events = Object.create(null); // 父组件绑定在当前组件上的事件
  /**
   * _events: {
   *  String: [Function]
   * }
   */
  // http://www.tensweets.com/article/5e032df8362e5434baf63394
  vm._hasHookEvent = false; // 表示父组件是否通过"@hook:"把钩子函数绑定在当前组件上
  // init parent attached events 初始化父组件添加的事件
  // https://ustbhuangyi.github.io/vue-analysis/v2/extend/event.html
  const listeners = vm.$options._parentListeners; // 父组件绑定在当前组件上的事件对象
  if (listeners) {
    updateComponentListeners(vm, listeners);
  }
}

let target: any;

function add(event, fn) {
  target.$on(event, fn);
}

function remove(event, fn) {
  target.$off(event, fn);
}

function createOnceHandler(event, fn) {
  const _target = target;
  return function onceHandler() {
    const res = fn.apply(null, arguments);
    if (res !== null) {
      _target.$off(event, onceHandler);
    }
  };
}

// 更新dom事件和自定义事件
export function updateComponentListeners(
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm;
  updateListeners(
    listeners,
    oldListeners || {},
    add,
    remove,
    createOnceHandler,
    vm
  );
  target = undefined;
}

export function eventsMixin(Vue: Class<Component>) {
  const hookRE = /^hook:/;

  // 监听当前实例上的自定义事件。事件可以由vm.$emit触发。
  // 回调函数会接收所有传入事件触发函数的额外参数。
  Vue.prototype.$on = function(
    event: string | Array<string>,
    fn: Function
  ): Component {
    const vm: Component = this;
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn);
      }
    } else {
      (vm._events[event] || (vm._events[event] = [])).push(fn);
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      // 这个bool标志位来表明是否存在钩子，而不需要通过哈希表的方法来查找是否有钩子
      // 这样做可以减少不必要的开销，优化性能
      /**
       * 这种类型
        <child
          @hook:created="hookFromParent"
        >
       */
      if (hookRE.test(event)) {
        vm._hasHookEvent = true;
      }
    }
    return vm;
  };

  // 监听一个自定义事件，但是只触发一次，在第一次触发之后移除监听器。
  Vue.prototype.$once = function(event: string, fn: Function): Component {
    const vm: Component = this;
    function on() {
      // 先移除监听，然后再执行回调函数
      vm.$off(event, on);
      fn.apply(vm, arguments);
    }
    on.fn = fn;
    vm.$on(event, on);
    return vm;
  };

  // 取消监听一个自定义事件或方法
  Vue.prototype.$off = function(
    event?: string | Array<string>,
    fn?: Function
  ): Component {
    const vm: Component = this;
    // all
    // 清空所有父组件绑定在当前实例上的事件，设置为{}
    if (!arguments.length) {
      vm._events = Object.create(null);
      return vm;
    }
    // array of events
    // 多个事件数组类型逐个清空
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn);
      }
      return vm;
    }
    // specific event
    // 清空某个特定的事件的所有监听方法
    const cbs = vm._events[event];
    if (!cbs) {
      return vm;
    }
    if (!fn) {
      vm._events[event] = null;
      return vm;
    }
    // specific handler
    // 清空某个特定的事件的某个特定的监听方法
    let cb;
    let i = cbs.length;
    while (i--) {
      cb = cbs[i];
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1);
        break;
      }
    }
    return vm;
  };

  // 触发一个自定义事件
  Vue.prototype.$emit = function(event: string): Component {
    const vm: Component = this;
    if (process.env.NODE_ENV !== "production") {
      const lowerCaseEvent = event.toLowerCase();
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
            `${formatComponentName(
              vm
            )} but the handler is registered for "${event}". ` +
            `Note that HTML attributes are case-insensitive and you cannot use ` +
            `v-on to listen to camelCase events when using in-DOM templates. ` +
            `You should probably use "${hyphenate(
              event
            )}" instead of "${event}".`
        );
      }
    }
    let cbs = vm._events[event];
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs;
      const args = toArray(arguments, 1);
      const info = `event handler for "${event}"`;
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info);
      }
    }
    return vm;
  };
}
