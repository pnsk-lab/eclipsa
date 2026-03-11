// @ts-types="@types/babel__core"
import { transformAsync, types as t } from "@babel/core";
// @ts-types="@types/babel__traverse"
import type { Visitor } from "@babel/traverse";
// @ts-expect-error babel does not ship a declaration for this parser helper
import SyntaxJSX from "@babel/plugin-syntax-jsx";
import { getJSXType, getJSXTypeNode, transformChildren, transformProps } from "../shared/jsx.ts";
import { FRAGMENT } from "../../jsx/shared.ts";
import { preprocessTSX } from "../shared/source.ts";

const pluginJSXRuntime = () => ({
  inherits: SyntaxJSX.default,
  visitor: {
    Program: {
      enter(path) {
        const jsxDEV = t.identifier("jsxDEV");
        path.unshiftContainer(
          "body",
          t.importDeclaration(
            [t.importSpecifier(jsxDEV, jsxDEV)],
            t.stringLiteral("eclipsa/jsx-dev-runtime"),
          ),
        );
      },
    },
    JSXElement(path) {
      const openingElement = path.node.openingElement;
      const type = getJSXType(openingElement);
      const jsxTypeExpr = getJSXTypeNode(type);
      const { props, key } = transformProps(openingElement);
      const children = transformChildren(path.node);
      props.properties.push(t.objectProperty(t.stringLiteral("children"), children));

      path.replaceWith(
        t.callExpression(t.identifier("jsxDEV"), [
          jsxTypeExpr,
          props,
          key ?? t.nullLiteral(),
          t.booleanLiteral(false),
          t.objectExpression([]),
        ]),
      );
    },
    JSXFragment(path) {
      const fragmentString = t.jsxIdentifier(FRAGMENT);
      path.replaceWith(
        t.jsxElement(
          t.jsxOpeningElement(fragmentString, [], true),
          t.jsxClosingElement(fragmentString),
          path.node.children,
        ),
      );
    },
  } satisfies Visitor,
});

export const compileSSRModule = async (code: string, id: string): Promise<string> => {
  const preprocessed = await preprocessTSX(code, id);
  const resultCode = (await transformAsync(preprocessed.code, {
    filename: id,
    parserOpts: {
      sourceType: "module",
      plugins: ["jsx"],
    },
    plugins: [pluginJSXRuntime()],
    sourceMaps: "inline",
  }))?.code;

  if (!resultCode) {
    throw new Error("Compiling JSX was failed.");
  }
  return resultCode;
};
