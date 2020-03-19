import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";

// Function 实现Vue的类，限制只能以 new 的方式去调用
function Vue(options) {
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    // 构造函数里的 this 指向的是实例化之后的对象，因此可以通过 instanceof 判断
    warn("Vue is a constructor and should be called with the `new` keyword");
  }
  // src/core/instance/init.js
  this._init(options); // 在下面的initMixin里面实现了
}

// 给 Vue 的 prototype 上扩展一些方法
initMixin(Vue); // 设置Vue.prototype._init
stateMixin(Vue); // 设置Vue.prototype.$data、$props、$set、$delete、$watch等
eventsMixin(Vue); // 设置Vue.prototype.$on、$emit、$once、$off等
lifecycleMixin(Vue); // 设置Vue.prototype._update、$forceUpdate、$destroy
renderMixin(Vue); // 设置Vue.prototype.$nextTick、_render、及一系列帮助函数

export default Vue;
