/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from "core/util/index";

import { createEmptyVNode } from "core/vdom/vnode";
import { currentRenderingInstance } from "core/instance/render";

/**
 * 异步组件实现的本质是 2 次渲染，除了 0 delay 的高级异步组件第一次直接渲染成 loading 组件外
 * 其它都是第一次渲染生成一个注释节点，当异步获取组件成功后，再通过 forceRender 强制重新渲染，这样就能正确渲染出我们异步加载的组件了
 */

// 确保拿到的是构造函数
function ensureCtor(comp: any, base) {
  if (comp.__esModule || (hasSymbol && comp[Symbol.toStringTag] === "Module")) {
    comp = comp.default;
  }
  // 当结果是对象时，则调用Vue.extend生成构造函数
  return isObject(comp) ? base.extend(comp) : comp;
}

// 创建空白占位节点（第二次进来时就可以进行diff）
export function createAsyncPlaceholder(
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode();
  node.asyncFactory = factory;
  node.asyncMeta = { data, context, children, tag };
  return node;
}

// 解析异步组件
export function resolveAsyncComponent(
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp;
  }

  if (isDef(factory.resolved)) {
    return factory.resolved;
  }

  const owner = currentRenderingInstance; // 正在调用 _render 函数的vm实例对象
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner);
  }

  // 如果异步组件加载中并未返回，则会返回 factory.loadingComp，渲染 loading 组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp;
  }

  if (owner && !isDef(factory.owners)) {
    const owners = (factory.owners = [owner]);
    let sync = true;
    let timerLoading = null;
    let timerTimeout = null;

    (owner: any).$on("hook:destroyed", () => remove(owners, owner));

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        // 通过执行 $forceUpdate 可以强制组件重新渲染一次
        (owners[i]: any).$forceUpdate(); // src/core/instance/lifecycle.js
      }

      if (renderCompleted) {
        owners.length = 0;
        if (timerLoading !== null) {
          clearTimeout(timerLoading);
          timerLoading = null;
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout);
          timerTimeout = null;
        }
      }
    };

    // once：确保 resolve 和 reject 函数只执行一次（利用闭包中一个标志位）

    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved 将异步组件的构造函数结果缓存下来，下次直接返回
      factory.resolved = ensureCtor(res, baseCtor); // 异步组件的构造函数
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      // 这个时候因为 sync 已经为 false，则执行 forceRender() 再次执行到 resolveAsyncComponent
      // 直接返回 factory.resolved，渲染成功加载的组件
      if (!sync) {
        forceRender(true);
      } else {
        owners.length = 0;
      }
    });

    const reject = once(reason => {
      process.env.NODE_ENV !== "production" &&
        warn(
          `Failed to resolve async component: ${String(factory)}` +
            (reason ? `\nReason: ${reason}` : "")
        );
      if (isDef(factory.errorComp)) {
        // 把 factory.error 设置为 true，同时执行 forceRender()
        // 再次执行到 resolveAsyncComponent，就返回 factory.errorComp，直接渲染 error 组件。
        factory.error = true;
        forceRender(true);
      }
    });

    // 执行组件的工厂函数，把 resolve 和 reject 函数作为参数传入，异步执行 resolve(res) 逻辑
    const res = factory(resolve, reject);

    if (isObject(res)) {
      if (isPromise(res)) {
        // Promise 异步组件
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject);
        }
      } else if (isPromise(res.component)) {
        // 高级异步组件
        /**
         * const AsyncComponent = () => ({
          // 需要加载的组件 (应该是一个 `Promise` 对象)
          component: import('./MyComponent.vue'),
          // 异步组件加载时使用的组件
          loading: LoadingComponent,
          // 加载失败时使用的组件
          error: ErrorComponent,
          // 展示加载时组件的延时时间。默认值是 200 (毫秒)
          delay: 200,
          // 如果提供了超时时间且组件加载也超时了，
          // 则使用加载失败时使用的组件。默认值是：`Infinity`
          timeout: 3000
        })
         */
        res.component.then(resolve, reject);

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor); // 失败组件构造函数
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor); // 加载中组件构造函数
          if (res.delay === 0) {
            // 展示加载时组件的延时时间（默认200ms）
            factory.loading = true;
          } else {
            timerLoading = setTimeout(() => {
              timerLoading = null;
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true;
                forceRender(false);
              }
            }, res.delay || 200);
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null;
            if (isUndef(factory.resolved)) {
              // 超时则执行reject
              reject(
                process.env.NODE_ENV !== "production"
                  ? `timeout (${res.timeout}ms)`
                  : null
              );
            }
          }, res.timeout);
        }
      }
    }

    sync = false;
    // return in case resolved synchronously
    return factory.loading ? factory.loadingComp : factory.resolved;
  }
}
