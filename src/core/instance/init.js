/* @flow */

import config from "../config";
import { initProxy } from "./proxy";
import { initState } from "./state";
import { initRender } from "./render";
import { initEvents } from "./events";
import { mark, measure } from "../util/perf";
import { initLifecycle, callHook } from "./lifecycle";
import { initProvide, initInjections } from "./inject";
import { extend, mergeOptions, formatComponentName } from "../util/index";

let uid = 0;

export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function(options?: Object) {
    const vm: Component = this;
    // a uid
    vm._uid = uid++; // 一个实例一个唯一的uid，新建Vue实例时（当渲染组件时也会触发）uid都会递增

    let startTag, endTag;
    // 耗时计算：Performance.measure()
    // https://developer.mozilla.org/zh-CN/docs/Web/API/Performance/measure
    // https://segmentfault.com/a/1190000014479800
    // 代码的 if 语句块，在计算覆盖率的时候会被忽略
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`;
      endTag = `vue-perf-end:${vm._uid}`;
      mark(startTag);
    }

    // a flag to avoid this being observed
    // 防止this被observed实例化
    // 解释：observe函数中，如果传入值的_isVue为ture时(即传入的值是Vue实例本身)，则不会新建observer实例(这里可以暂时理解新建observer实例就是让数据响应式)
    vm._isVue = true;

    // merge options 合并配置
    if (options && options._isComponent) {
      // 调用来源：组件的componentOptions.Ctor构造函数执行
      // _isComponent属性来源：src/core/vdom/create-component.js - createComponentInstanceForVnode
      // 是组件时，options._isComponent才会为true，即当前这个Vue实例是组件
      // 优化组件实例，因为动态选项合并很慢，并且也没有组件的选项需要特殊对待
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options);
    } else {
      // 把构造函数的 options 和用户传入的 options 做一层合并，到 vm.$options 上
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // 返回 Vue.options （initGlobalAPI 中定义的）
        options || {},
        vm
      );
    }
    /* istanbul ignore else */
    // 通过Proxy为vm属性添加一些自定义的行为
    if (process.env.NODE_ENV !== "production") {
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }

    // expose real self
    vm._self = vm;
    initLifecycle(vm); // 初始化生命周期相关的属性以及 vm.parent、root、children等
    initEvents(vm); // 初始化事件中心 vm._events、vm._hasHookEvent等
    initRender(vm); // 初始化渲染 vm._vnode、vm._staticTrees、vm.$slots、vm.$scopedSlots、vm.$createElement等
    callHook(vm, "beforeCreate"); // 触发beforeCreate钩子函数
    initInjections(vm); // resolve injections before data/props
    initState(vm); // 初始化 data、props、computed、watcher、methods 等
    initProvide(vm); // resolve provide after data/props
    callHook(vm, "created"); // 触发created钩子函数

    /**
     * 生命周期解释：
     * 在这俩个钩子函数执行的时候，并没有渲染 DOM，所以我们也不能够访问 DOM
     * 一般来说，如果组件在加载的时候需要和后端有交互，放在这俩个钩子函数执行都可以
     * 如果是需要访问 props、data 等数据的话，就需要使用 created 钩子函数
     */

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      vm._name = formatComponentName(vm, false);
      mark(endTag);
      measure(`vue ${vm._name} init`, startTag, endTag);
    }

    if (vm.$options.el) {
      // $mount 这个方法的实现是和平台、构建方式都相关
      // src/platforms/web/runtime/index.js
      vm.$mount(vm.$options.el); // 把模板渲染成最终的 DOM，最终调用的是 core/instance/lifecycle 的 mountComponent方法
    } else {
      // 如果 Vue 实例在实例化时没有收到 el 选项，则它处于“未挂载”状态，没有关联的 DOM 元素
      // 可以使用 vm.$mount() 手动地挂载一个未挂载的实例
    }
  };
}

// 组件 options 处理
export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  // 这里的 vm.constructor 就是子组件的构造函数 Sub
  // 这个options 就是在Vue.extend里创建构造函数时，合并的 options，全局选项和组件设置选项
  const opts = (vm.$options = Object.create(vm.constructor.options)); // 组件的配置信息
  // doing this because it's faster than dynamic enumeration.

  // 保存父节点，外壳节点，兄弟节点等
  const parentVnode = options._parentVnode; // 该组件的占位符VNode
  opts.parent = options.parent; // 父Vue实例
  opts._parentVnode = parentVnode; // 父VNode实例

  // 保存父组件给子组件关联的数据
  const vnodeComponentOptions = parentVnode.componentOptions; // 占位符VNode初始化传入的配置信息
  opts.propsData = vnodeComponentOptions.propsData; // 经过extractPropsFromVNodeData()得到的propsData对象
  opts._parentListeners = vnodeComponentOptions.listeners;
  opts._renderChildren = vnodeComponentOptions.children;
  opts._componentTag = vnodeComponentOptions.tag;

  // 保存渲染函数
  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

export function resolveConstructorOptions(Ctor: Class<Component>) {
  let options = Ctor.options;
  // 有super属性，说明Ctor是Vue.extend构建的子类
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super); // 递归获取父类构造函数Vue的options
    const cachedSuperOptions = Ctor.superOptions; // Vue构造函数上的options
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      // 父类的options改变过了，例如执行了Vue.mixin方法
      Ctor.superOptions = superOptions;
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      if (modifiedOptions) {
        // Ctor.extendOptions是调用Vue.extend时传入的参数
        extend(Ctor.extendOptions, modifiedOptions);
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  // Ctor是Vue本身，则直接换回 Ctor.options
  return options;
}

// 检查出options和sealedOptions中不同的部分
function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified;
  const latest = Ctor.options; // 自身的options
  const sealed = Ctor.sealedOptions; // 这个属性就是方便检查"自身"的options有没有变化
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {};
      modified[key] = latest[key];
    }
  }
  return modified;
}
