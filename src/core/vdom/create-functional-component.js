/* @flow */

import VNode, { cloneVNode } from "./vnode";
import { createElement } from "./create-element";
import { resolveInject } from "../instance/inject";
import { normalizeChildren } from "../vdom/helpers/normalize-children";
import { resolveSlots } from "../instance/render-helpers/resolve-slots";
import { normalizeScopedSlots } from "../vdom/helpers/normalize-scoped-slots";
import { installRenderHelpers } from "../instance/render-helpers/index";

import {
  isDef,
  isTrue,
  hasOwn,
  camelize,
  emptyObject,
  validateProp
} from "../util/index";

// 创建render函数的上下文
export function FunctionalRenderContext(
  data: VNodeData,
  props: Object,
  children: ?Array<VNode>,
  parent: Component, // parent:调用当前组件的父组件实例
  Ctor: Class<Component>
) {
  const options = Ctor.options;
  // ensure the createElement function in functional components
  // gets a unique context - this is necessary for correct named slot check
  let contextVm;
  // 如果父Vue含有_uid属性(是个Vue实例)
  if (hasOwn(parent, "_uid")) {
    // 以parent为原型，创建一个实例，保存到contextVm里面
    contextVm = Object.create(parent);
    // $flow-disable-line
    contextVm._original = parent;
  } else {
    // the context vm passed in is a functional context as well.
    // in this case we want to make sure we are able to get a hold to the
    // real context instance.
    contextVm = parent;
    // $flow-disable-line
    parent = parent._original;
  }
  const isCompiled = isTrue(options._compiled);
  const needNormalization = !isCompiled;

  this.data = data;
  this.props = props;
  this.children = children;
  this.parent = parent; // parent，也就是引用当前函数组件的Vue实例
  this.listeners = data.on || emptyObject; // 自定义事件
  this.injections = resolveInject(options.inject, parent);
  this.slots = () => {
    if (!this.$slots) {
      normalizeScopedSlots(
        data.scopedSlots,
        (this.$slots = resolveSlots(children, parent))
      );
    }
    return this.$slots;
  };

  Object.defineProperty(
    this,
    "scopedSlots",
    ({
      enumerable: true,
      get() {
        return normalizeScopedSlots(data.scopedSlots, this.slots());
      }
    }: any)
  );

  // support for compiled functional template
  if (isCompiled) {
    // exposing $options for renderStatic()
    this.$options = options;
    // pre-resolve slots for renderSlot()
    this.$slots = this.slots();
    this.$scopedSlots = normalizeScopedSlots(data.scopedSlots, this.$slots);
  }

  if (options._scopeId) {
    this._c = (a, b, c, d) => {
      const vnode = createElement(contextVm, a, b, c, d, needNormalization);
      if (vnode && !Array.isArray(vnode)) {
        vnode.fnScopeId = options._scopeId;
        vnode.fnContext = parent;
      }
      return vnode;
    };
  } else {
    this._c = (a, b, c, d) =>
      createElement(contextVm, a, b, c, d, needNormalization);
  }
}

installRenderHelpers(FunctionalRenderContext.prototype);

export function createFunctionalComponent(
  Ctor: Class<Component>, // Ctor：组件的构造对象(Vue.extend()里的那个Sub函数)
  propsData: ?Object, // propsData：父组件传递过来的数据(还未验证)
  data: VNodeData, // data：组件的数据
  contextVm: Component, // contextVm：Vue实例
  children: ?Array<VNode> // children：引用该组件时定义的子节点
): VNode | Array<VNode> | void {
  const options = Ctor.options;
  const props = {};
  const propOptions = options.props;
  if (isDef(propOptions)) {
    for (const key in propOptions) {
      // 调用validateProp()依次进行检验
      props[key] = validateProp(key, propOptions, propsData || emptyObject);
    }
  } else {
    if (isDef(data.attrs)) mergeProps(props, data.attrs);
    if (isDef(data.props)) mergeProps(props, data.props);
  }

  // 创建一个函数的上下文
  const renderContext = new FunctionalRenderContext(
    data,
    props,
    children,
    contextVm,
    Ctor
  );

  // 执行render函数，也就是我们在组件内定义的render函数
  // 参数1为createElement，参数2为renderContext
  const vnode = options.render.call(null, renderContext._c, renderContext);

  if (vnode instanceof VNode) {
    return cloneAndMarkFunctionalResult(
      vnode,
      data,
      renderContext.parent,
      options,
      renderContext
    );
  } else if (Array.isArray(vnode)) {
    const vnodes = normalizeChildren(vnode) || [];
    const res = new Array(vnodes.length);
    for (let i = 0; i < vnodes.length; i++) {
      res[i] = cloneAndMarkFunctionalResult(
        vnodes[i],
        data,
        renderContext.parent,
        options,
        renderContext
      );
    }
    return res;
  }
}

function cloneAndMarkFunctionalResult(
  vnode,
  data,
  contextVm,
  options,
  renderContext
) {
  // #7817 clone node before setting fnContext, otherwise if the node is reused
  // (e.g. it was from a cached normal slot) the fnContext causes named slots
  // that should not be matched to match.
  const clone = cloneVNode(vnode);
  clone.fnContext = contextVm;
  clone.fnOptions = options;
  if (process.env.NODE_ENV !== "production") {
    (clone.devtoolsMeta =
      clone.devtoolsMeta || {}).renderContext = renderContext;
  }
  if (data.slot) {
    (clone.data || (clone.data = {})).slot = data.slot;
  }
  return clone;
}

function mergeProps(to, from) {
  for (const key in from) {
    to[camelize(key)] = from[key];
  }
}
