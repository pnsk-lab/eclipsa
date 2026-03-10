import type { JSX } from "./jsx-runtime.ts";
import { FRAGMENT } from "./shared.ts";

export const renderToString = (inputElementLike: JSX.Element | JSX.Element[]): string => {
  if (Array.isArray(inputElementLike)) {
    let result = "";
    for (let i = 0; i < inputElementLike.length; i++) {
      result += renderToString(inputElementLike[i]);
    }
    return result;
  }
  let elem = inputElementLike;
  while (typeof elem === "function") {
    elem = elem();
  }
  if (elem === false || elem === null || elem === undefined) {
    return "";
  }
  if (Array.isArray(elem)) {
    return renderToString(elem);
  }
  if (typeof elem === "string" || typeof elem === "boolean" || typeof elem === "number") {
    return elem.toString();
  }
  if (typeof elem.type === "function") {
    return `<!-- ecc ${elem.metadata?.fileid} ${elem.metadata?.componentID} -->${renderToString(
      elem.type(elem.props),
    )}<!-- /ecc -->`;
  }
  let attrText = "";
  for (const [k, v] of Object.entries(elem.props)) {
    switch (k) {
      case "children":
        break;
      default: {
        attrText += `${k}="${v}"`;
      }
    }
  }
  let childrenText = "";
  if (Array.isArray(elem.props.children)) {
    for (const child of elem.props.children) {
      childrenText += renderToString(child);
    }
  } else {
    childrenText += renderToString(elem.props.children as JSX.Element);
  }
  const result =
    elem.type === FRAGMENT
      ? childrenText
      : `<${elem.type} ${attrText}>${childrenText}</${elem.type}>`;
  return result;
};
