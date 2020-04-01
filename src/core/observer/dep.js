/* @flow */

import type Watcher from "./watcher";
import { remove } from "../util/index";
import config from "../config";

let uid = 0;

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor() {
    this.id = uid++;
    this.subs = []; // 保存 watcher 的数组
  }

  // 往 dep.subs 存储器中 中直接添加 watcher
  addSub(sub: Watcher) {
    // 当前的 watcher 订阅到这个数据持有的 dep 的 subs 中
    // 这个目的是为后续数据变化时候能通知到哪些 subs 做准备
    this.subs.push(sub);
  }

  removeSub(sub: Watcher) {
    remove(this.subs, sub);
  }

  depend() {
    if (Dep.target) {
      Dep.target.addDep(this);
    }
  }

  notify() {
    // stabilize the subscriber list first
    const subs = this.subs.slice();
    if (process.env.NODE_ENV !== "production" && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      // 按照id从小到大排序
      subs.sort((a, b) => a.id - b.id);
    }
    // 遍历 subs ，逐个通知依赖，就是逐个调用 watcher.update
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update();
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// 静态属性 target 是一个全局唯一 Watcher
// 在同一时间只能有一个全局的 Watcher 被计算
Dep.target = null;
const targetStack = [];

// 把 Dep.target 赋值为当前的渲染 watcher 并压栈（为了恢复用）
export function pushTarget(target: ?Watcher) {
  targetStack.push(target);
  Dep.target = target;
}

export function popTarget() {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}
