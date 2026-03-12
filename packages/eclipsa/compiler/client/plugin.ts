// @ts-types="@types/babel__traverse"
import type { Visitor } from "@babel/traverse";
import SyntaxJSX from "@babel/plugin-syntax-jsx";
import { getJSXType, transformChildren, transformProps } from "../shared/jsx.ts";
import * as t from "@babel/types";

export const pluginClientJSX = (options?: {
  hmr?: boolean;
}) => {
  const hmr = options?.hmr ?? true;
  // Imported from eclipsa or eclipsa/client
  let createTemplate!: t.Identifier;
  let insert!: t.Identifier;
  let attr!: t.Identifier;
  let createComponent!: t.Identifier;
  let component$Id: t.Identifier | null = null;
  let initHot!: t.Identifier;
  let defineHotComponent!: t.Identifier;
  let createHotRegistry!: t.Identifier;

  let hotRegistry!: t.Identifier;

  const templates: {
    id: t.Identifier;
    tmpl: string;
  }[] = [];

  return {
    inherits: SyntaxJSX.default,
    visitor: {
      Program: {
        enter(path) {
          createTemplate = path.scope.generateUidIdentifier("createTemplate");
          insert = path.scope.generateUidIdentifier("insert");
          attr = path.scope.generateUidIdentifier("attr");
          createComponent = path.scope.generateUidIdentifier("createComponent");

          const specifiers = [
            t.importSpecifier(createTemplate, t.identifier("createTemplate")),
            t.importSpecifier(insert, t.identifier("insert")),
            t.importSpecifier(attr, t.identifier("attr")),
            t.importSpecifier(createComponent, t.identifier("createComponent")),
          ];

          if (hmr) {
            defineHotComponent = path.scope.generateUidIdentifier("defineHotComponent");
            initHot = path.scope.generateUidIdentifier("initHot");
            createHotRegistry = path.scope.generateUidIdentifier("createHotRegistry");
            hotRegistry = t.identifier("__eclipsa$hotRegistry");
            path.unshiftContainer(
              "body",
              t.expressionStatement(
                t.callExpression(initHot, [
                  t.memberExpression(
                    t.memberExpression(t.identifier("import"), t.identifier("meta")),
                    t.identifier("hot"),
                  ),
                  t.memberExpression(
                    t.memberExpression(t.identifier("import"), t.identifier("meta")),
                    t.identifier("url"),
                  ),
                  hotRegistry,
                ]),
              ),
            );
            path.unshiftContainer(
              "body",
              t.exportNamedDeclaration(
                t.variableDeclaration("var", [
                  t.variableDeclarator(hotRegistry, t.callExpression(createHotRegistry, [])),
                ]),
              ),
            );
          }

          const runtimeImport = t.importDeclaration(
            specifiers,
            t.stringLiteral("eclipsa/client"),
          );
          path.unshiftContainer("body", runtimeImport);
          if (hmr) {
            path.unshiftContainer(
              "body",
              t.importDeclaration(
                [
                  t.importSpecifier(initHot, t.identifier("initHot")),
                  t.importSpecifier(defineHotComponent, t.identifier("defineHotComponent")),
                  t.importSpecifier(createHotRegistry, t.identifier("createHotRegistry")),
                ],
                t.stringLiteral("eclipsa/dev-client"),
              ),
            );
          }
        },
        exit(path) {
          for (const template of templates) {
            const declaration = t.variableDeclaration("var", [
              t.variableDeclarator(
                template.id,
                t.callExpression(createTemplate, [t.stringLiteral(template.tmpl)]),
              ),
            ]);
            path.unshiftContainer("body", declaration);
          }
        },
      },
      ImportDeclaration: {
        enter(path) {
          if (path.node.source.value === "eclipsa") {
            for (const specifier of path.node.specifiers) {
              if (t.isImportSpecifier(specifier)) {
                const importedName = t.isStringLiteral(specifier.imported)
                  ? specifier.imported.value
                  : specifier.imported.name;
                if (importedName === "component$") {
                  component$Id = specifier.local;
                  break;
                }
              }
            }
          }
        },
      },
      JSXElement(path) {
        type Path = number[];
        const applies: {
          path: Path;
          expr: t.Expression;
        }[] = [];
        const attrs: {
          path: Path;
          name: string;
          value: t.Expression;
        }[] = [];
        const components: {
          path: Path;
          id: t.Identifier;
          props: t.ObjectExpression;
        }[] = [];
        const processChildren = (children: t.JSXElement["children"], path: Path) => {
          let text = "";
          let pathIndex = 0;
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childPath = [...path, pathIndex];
            if (t.isJSXText(child)) {
              if (child.value.replaceAll(/[\n ]/g, "") === "") {
                continue;
              }
              text += child.value;
            } else if (t.isJSXExpressionContainer(child)) {
              text += `<!-- ${childPath.join(",")} -->`;
              applies.push({
                expr: child.expression as t.Expression,
                path: childPath,
              });
            } else if (t.isJSXElement(child)) {
              text += processJSXElement(child, childPath);
            } else if (t.isJSXFragment(child)) {
              text += processChildren(child.children, childPath);
            } else {
              throw new Error(`${child.type} is not supported.`);
            }
            pathIndex++;
          }
          return text;
        };
        const processJSXElement = (elem: t.JSXElement, path: Path) => {
          const jsxType = getJSXType(elem.openingElement);
          if (jsxType.type !== "element") {
            const componentId = t.identifier(jsxType.name);
            const { props } = transformProps(elem.openingElement);
            if (elem.children.length > 0) {
              props.properties.push(
                t.objectProperty(
                  t.identifier("children"),
                  transformChildren(elem),
                ),
              );
            }
            components.push({
              path,
              id: componentId,
              props,
            });
            return `<!-- ${path.join(",")} -->`;
          }

          for (const attr of elem.openingElement.attributes) {
            if (attr.type === "JSXAttribute") {
              const name =
                typeof attr.name.name === "string" ? attr.name.name : attr.name.name.name;

              if (
                attr.value?.type !== "JSXExpressionContainer" &&
                attr.value?.type !== "StringLiteral"
              ) {
                throw new Error(`${attr.value?.type} as a event handler is not supported`);
              }
              const expr =
                "expression" in attr.value
                  ? attr.value.expression
                  : t.stringLiteral(attr.value.value);
              if (t.isJSXEmptyExpression(expr)) {
                throw new Error("JSXEmptyExpression as a event handler is not supported.");
              }
              attrs.push({
                path,
                name,
                value: t.arrowFunctionExpression([], expr),
              });
              continue;
            }
            throw new Error(`${attr.type} is not supported.`);
          }
          return `<${jsxType.name}>${processChildren(elem.children, path)}</${jsxType.name}>`;
        };
        const tmplHTML = processJSXElement(path.node, []);
        const tmplID = path.scope.generateUidIdentifier("template");
        templates.push({
          id: tmplID,
          tmpl: tmplHTML,
        });

        const clonedID = path.scope.generateUidIdentifier("cloned");
        const varDecolation = t.variableDeclaration("var", [
          t.variableDeclarator(clonedID, t.callExpression(tmplID, [])),
        ]);
        const createParentAndMarker = (path: Path) => {
          let marker: t.Expression = clonedID;
          let parent: t.Expression = clonedID;
          for (let i = 0; i < path.length; i++) {
            const thisPath = path[i];
            marker = t.memberExpression(
              t.memberExpression(marker, t.identifier("childNodes")),
              t.numericLiteral(thisPath),
              true,
            );
            if (i + 2 === path.length && path.length > 1) {
              parent = marker;
            }
          }
          return { marker, parent };
        };
        const insertDecolations = applies.map((apply) => {
          const { parent, marker } = createParentAndMarker(apply.path);
          return t.expressionStatement(
            t.callExpression(insert, [t.arrowFunctionExpression([], apply.expr), parent, marker]),
          );
        });
        const eventDecolations = attrs.map(({ path, name, value }) =>
          t.expressionStatement(
            t.callExpression(attr, [
              createParentAndMarker(path).marker,
              t.stringLiteral(name),
              value,
            ]),
          ),
        );
        const componentDecolations = components.map((component) => {
          const { parent, marker } = createParentAndMarker(component.path);
          const createdComponent = t.callExpression(createComponent, [
            component.id,
            component.props,
          ]);
          return t.expressionStatement(
            t.callExpression(insert, [createdComponent, parent, marker]),
          );
        });
        const keyNode = path.node.openingElement.attributes.find((attr) => {
          if (attr.type !== "JSXAttribute") {
            return;
          }
          return (
            (typeof attr.name.name === "string" ? attr.name.name : attr.name.name.name) === "key"
          );
        });
        const key = keyNode
          ? (((keyNode as t.JSXAttribute).value as t.JSXExpressionContainer)
              .expression as t.Expression)
          : undefined;
        let resultExpr: t.Expression;
        const baseElementFnBlock = t.blockStatement([
          varDecolation,
          ...insertDecolations,
          ...eventDecolations,
          ...componentDecolations,
          t.returnStatement(clonedID),
        ]);
        t.addComment(baseElementFnBlock, "inner", tmplHTML);
        const baseElementFn = t.arrowFunctionExpression([], baseElementFnBlock);
        if (key) {
          const id = t.identifier("f");
          resultExpr = t.callExpression(
            t.arrowFunctionExpression(
              [],
              t.blockStatement([
                t.variableDeclaration("var", [t.variableDeclarator(id, baseElementFn)]),
                t.expressionStatement(
                  t.assignmentExpression("=", t.memberExpression(id, t.identifier("key")), key),
                ),
                t.returnStatement(id),
              ]),
            ),
            [],
          );
        } else {
          resultExpr = t.callExpression(baseElementFn, []);
        }
        path.replaceWith(resultExpr);
      },
      CallExpression: {
        exit(path) {
          if (!hmr) {
            return;
          }
          if (t.isIdentifier(path.node.callee) && component$Id?.name === path.node.callee.name) {
            if (
              t.isCallExpression(path.parent) &&
              t.isIdentifier(path.parent.callee) &&
              path.parent.callee.name === defineHotComponent.name
            ) {
              return;
            }
            let name: string | null = null;
            if (t.isExportDeclaration(path.parent)) {
              name = "default";
            }
            path.replaceWith(
              t.callExpression(defineHotComponent, [
                path.node,
                t.objectExpression([
                  t.objectProperty(t.identifier("registry"), hotRegistry),
                  t.objectProperty(
                    t.identifier("name"),
                    name ? t.stringLiteral(name) : t.nullLiteral(),
                  ),
                ]),
              ]),
            );
          }
        },
      },
    } satisfies Visitor,
  };
};
