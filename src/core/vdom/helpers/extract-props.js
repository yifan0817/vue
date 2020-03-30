/* @flow */

import {
  tip,
  hasOwn,
  isDef,
  isUndef,
  hyphenate,
  formatComponentName
} from "core/util/index";

export function extractPropsFromVNodeData(
  data: VNodeData,
  Ctor: Class<Component>,
  tag?: string
): ?Object {
  // we are only extracting raw values here.
  // validation and default values are handled in the child
  // component itself.
  const propOptions = Ctor.options.props; // 获取组件的定义的props对象，实际可能不会都用到
  if (isUndef(propOptions)) {
    return;
  }
  const res = {};
  const { attrs, props } = data; // 获取data的attrs属性, props属性，这应该是建立父子组件时的关系
  if (isDef(attrs) || isDef(props)) {
    for (const key in propOptions) {
      const altKey = hyphenate(key); // 驼峰式转换为连字符形式
      if (process.env.NODE_ENV !== "production") {
        const keyInLowerCase = key.toLowerCase();
        if (key !== keyInLowerCase && attrs && hasOwn(attrs, keyInLowerCase)) {
          tip(
            `Prop "${keyInLowerCase}" is passed to component ` +
              `${formatComponentName(
                tag || Ctor
              )}, but the declared prop name is` +
              ` "${key}". ` +
              `Note that HTML attributes are case-insensitive and camelCased ` +
              `props need to use their kebab-case equivalents when using in-DOM ` +
              `templates. You should probably use "${altKey}" instead of "${key}".`
          );
        }
      }
      // 调用checkProp优先从props里拿对应的属性，其次从attrs里拿
      // 对于attrs的话第五个参数为false，即会删除对应的attrs里的属性
      checkProp(res, props, key, altKey, true) ||
        checkProp(res, attrs, key, altKey, false);
    }
  }
  return res;
}

function checkProp(
  res: Object,
  hash: ?Object,
  key: string,
  altKey: string,
  preserve: boolean
): boolean {
  if (isDef(hash)) {
    if (hasOwn(hash, key)) {
      res[key] = hash[key];
      if (!preserve) {
        delete hash[key];
      }
      return true;
    } else if (hasOwn(hash, altKey)) {
      res[key] = hash[altKey];
      if (!preserve) {
        delete hash[altKey];
      }
      return true;
    }
  }
  return false;
}
