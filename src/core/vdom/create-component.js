/* @flow */

import VNode from "./vnode";
import { resolveConstructorOptions } from "core/instance/init";
import { queueActivatedComponent } from "core/observer/scheduler";
import { createFunctionalComponent } from "./create-functional-component";

import { warn, isDef, isUndef, isTrue, isObject } from "../util/index";

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from "./helpers/index";

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from "../instance/lifecycle";

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from "weex/runtime/recycle-list/render-component-template";

// inline hooks to be invoked on component VNodes during patch
// 组件生命周期钩子
const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode; // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      // 调用该方法返回子组件的Vue实例，并保存到vnode.componentInstance属性上
      const child = (vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ));
      // 调用 $mount 方法挂载子组件
      child.$mount(hydrating ? vnode.elm : undefined, hydrating); // 调用 $mount 方法挂载子组件
    }
  },

  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions;
    const child = (vnode.componentInstance = oldVnode.componentInstance);
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    );
  },

  insert(vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode;
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true;
      callHook(componentInstance, "mounted");
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance);
      } else {
        activateChildComponent(componentInstance, true /* direct */);
      }
    }
  },

  destroy(vnode: MountedComponentVNode) {
    const { componentInstance } = vnode;
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy();
      } else {
        deactivateChildComponent(componentInstance, true /* direct */);
      }
    }
  }
};

const hooksToMerge = Object.keys(componentVNodeHooks);

// https://www.cnblogs.com/greatdesert/p/11088574.html
// 在 src/core/vdom/create-element.js 里面的_createElement中被调用
// 3 个关键逻辑：构造子类构造函数，安装组件钩子函数和实例化 vnode
export function createComponent(
  Ctor: Class<Component> | Function | Object | void, // 组件的构造函数、普通函数、组件对象
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return;
  }

  const baseCtor = context.$options._base;

  // plain options object: turn it into a constructor
  // 传入的是组件对象，则执行 Vue.extend 生成对应的构造函数
  // Vue.extend （src/core/global-api/extend.js）
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor);
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 此时 Ctor 还不是一个函数类型的话就需要报错了
  if (typeof Ctor !== "function") {
    if (process.env.NODE_ENV !== "production") {
      warn(`Invalid Component definition: ${String(Ctor)}`, context);
    }
    return;
  }

  // async component 异步组件 (Ctor是注册时的工厂函数)
  let asyncFactory;
  // 只有执行过Vue.extend才会有cid，注册异步组件时传入的是函数故不会走Vue.extend，没有cid
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor;
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor);
    if (Ctor === undefined) {
      // 如果是第一次执行 resolveAsyncComponent
      // 除非使用高级异步组件 0 delay 去创建了一个 loading 组件，否则返回是 undefiend
      // 通过 createAsyncPlaceholder 创建一个注释节点作为占位符
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(asyncFactory, data, context, children, tag);
    }
  }

  data = data || {};

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  resolveConstructorOptions(Ctor);

  // transform component v-model data into props & events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data);
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag);

  // functional component 函数式组件
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children);
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  const listeners = data.on;
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn;

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot;
    data = {};
    if (slot) {
      data.slot = slot;
    }
  }

  // install component management hooks onto the placeholder node
  // 安装/合并组件钩子函数
  installComponentHooks(data);

  // return a placeholder vnode
  // 实例化 VNode
  const name = Ctor.options.name || tag;
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ""}`,
    data,
    undefined,
    undefined,
    undefined,
    context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  );

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode);
  }

  return vnode;
}

// 给 component 【增加定制options】 + 【调用组件构造函数】
export function createComponentInstanceForVnode(
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any // activeInstance in lifecycle state
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true, // 表示它是一个组件
    _parentVnode: vnode, // 外壳节点
    parent // parent 表示当前激活的组件实例（父实例）
  };
  // check inline-template render functions
  // 尝试获取inlineTemplate属性，定义组件时如果指定了inline-template特性，则组件内的子节点都是该组件的
  const inlineTemplate = vnode.data.inlineTemplate;
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render;
    options.staticRenderFns = inlineTemplate.staticRenderFns;
  }
  // 子组件的初始化
  // vnode.componentOptions.Ctor 就是前面 Vue.extend 生成的组件构造函数
  // 然后会调用内部的_init初始化方法：src/core/instance/init.js initInternalComponent
  return new vnode.componentOptions.Ctor(options);
}

// 把 componentVNodeHooks 的钩子函数合并到 data.hook 中
function installComponentHooks(data: VNodeData) {
  const hooks = data.hook || (data.hook = {});
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i];
    const existing = hooks[key]; // 当前已存在的key钩子
    const toMerge = componentVNodeHooks[key]; // 需要合并的key钩子
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge;
    }
  }
}

// 合并两个组件钩子函数，先执行公共的，再执行自行添加的
function mergeHook(f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b);
    f2(a, b);
  };
  merged._merged = true;
  return merged;
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel(options, data: any) {
  const prop = (options.model && options.model.prop) || "value";
  const event = (options.model && options.model.event) || "input";
  (data.attrs || (data.attrs = {}))[prop] = data.model.value;
  const on = data.on || (data.on = {});
  const existing = on[event];
  const callback = data.model.callback;
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing);
    }
  } else {
    on[event] = callback;
  }
}
