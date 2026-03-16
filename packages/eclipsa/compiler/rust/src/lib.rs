mod analyze;

use std::path::Path;
use std::panic::{self, AssertUnwindSafe};

use napi::Error;
use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    CallExpression, ExportDefaultDeclaration, Expression, ImportDeclaration, ImportDeclarationSpecifier,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName,
    JSXExpression, JSXFragment, ModuleExportName, Program,
};
use oxc_ast_visit::{walk, Visit};
use oxc_codegen::Codegen;
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};
use oxc_transformer::{JsxOptions, TransformOptions, Transformer};

use crate::analyze::AnalyzeResponse;

const CLIENT_CREATE_TEMPLATE: &str = "_createTemplate";
const CLIENT_INSERT: &str = "_insert";
const CLIENT_ATTR: &str = "_attr";
const CLIENT_CREATE_COMPONENT: &str = "_createComponent";
const SSR_JSX_DEV: &str = "_jsxDEV";
const SSR_ATTR: &str = "_ssrAttr";
const SSR_TEMPLATE: &str = "_ssrTemplate";
const HMR_INIT: &str = "_initHot";
const HMR_DEFINE_COMPONENT: &str = "_defineHotComponent";
const HMR_CREATE_REGISTRY: &str = "_createHotRegistry";
const HMR_REGISTRY: &str = "__eclipsa$hotRegistry";
const FRAGMENT_NAME: &str = "__ECLIPSA_FRAGMENT";
const DANGEROUSLY_SET_INNER_HTML_PROP: &str = "dangerouslySetInnerHTML";

#[derive(Debug, Clone)]
pub(crate) struct Replacement {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) code: String,
}

#[derive(Debug)]
enum ClientInsertOp {
    Apply { expr: String, path: Vec<usize> },
    Component { component: String, path: Vec<usize>, props: String },
}

#[derive(Debug)]
struct ClientAttrOp {
    name: String,
    path: Vec<usize>,
    value: String,
}

fn to_napi_error(error: String) -> Error {
    Error::from_reason(error)
}

fn panic_payload_to_string(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_string();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "unknown panic payload".to_string()
}

fn run_with_panic_capture<T>(
    label: &str,
    f: impl FnOnce() -> Result<T, String>,
) -> napi::Result<T> {
    match panic::catch_unwind(AssertUnwindSafe(f)) {
        Ok(result) => result.map_err(to_napi_error),
        Err(payload) => Err(to_napi_error(format!(
            "{label} panicked: {}",
            panic_payload_to_string(payload)
        ))),
    }
}

#[napi(js_name = "compileClient")]
pub fn compile_client(source: String, id: String, hmr: Option<bool>) -> napi::Result<String> {
    run_with_panic_capture("compileClient", || {
        transform_client(&source, &id, hmr.unwrap_or(false))
    })
}

#[napi(js_name = "compileSsr")]
pub fn compile_ssr(source: String, id: String) -> napi::Result<String> {
    run_with_panic_capture("compileSsr", || transform_ssr(&source, &id))
}

#[napi(js_name = "analyzeModule")]
pub fn analyze_module(source: String, id: String) -> napi::Result<AnalyzeResponse> {
    run_with_panic_capture("analyzeModule", || analyze::transform_analyze(&source, &id))
}

fn strip_query(id: &str) -> &str {
    id.split_once('?').map_or(id, |(file_id, _)| file_id)
}

pub(crate) fn source_type_for(id: &str) -> SourceType {
    SourceType::from_path(strip_query(id))
        .unwrap_or_else(|_| SourceType::tsx())
        .with_module(true)
        .with_jsx(true)
}

fn strip_typescript_syntax(source: &str, id: &str) -> Result<String, String> {
    let source_type = source_type_for(id);
    if !source_type.is_typescript() {
        return Ok(source.to_string());
    }

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    if parsed.panicked {
        return Err(format!("failed to strip TypeScript syntax for {id}: parser panicked"));
    }
    if !parsed.errors.is_empty() {
        let errors = parsed
            .errors
            .iter()
            .map(|error| error.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("failed to strip TypeScript syntax for {id}:\n{errors}"));
    }

    let mut program = parsed.program;
    let semantic = SemanticBuilder::new().build(&program);
    if !semantic.errors.is_empty() {
        let errors = semantic
            .errors
            .iter()
            .map(|error| error.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("failed semantic analysis for {id}:\n{errors}"));
    }

    let mut options = TransformOptions::default();
    options.jsx = JsxOptions::disable();
    let transformed = Transformer::new(&allocator, Path::new(strip_query(id)), &options)
        .build_with_scoping(semantic.semantic.into_scoping(), &mut program);
    if !transformed.errors.is_empty() {
        let errors = transformed
            .errors
            .iter()
            .map(|error| error.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("failed TypeScript transform for {id}:\n{errors}"));
    }

    Ok(Codegen::new().build(&program).code)
}

fn transform_client(source: &str, id: &str, hmr: bool) -> Result<String, String> {
    let source_type = source_type_for(id);
    let allocator = Allocator::default();
    let program = parse_program(&allocator, source, source_type, id)?;
    let mut compiler = ClientCompiler::new(source, source_type);
    let jsx_source = compiler.apply_root_replacements(&program)?;
    let with_hmr = if hmr { wrap_hot_components(&jsx_source, id)? } else { jsx_source };

    let mut prefix = String::new();
    prefix.push_str(&format!(
        "import {{ createTemplate as {CLIENT_CREATE_TEMPLATE}, insert as {CLIENT_INSERT}, attr as {CLIENT_ATTR}, createComponent as {CLIENT_CREATE_COMPONENT} }} from \"eclipsa/client\";\n"
    ));
    if hmr {
        prefix.push_str(&format!(
            "import {{ initHot as {HMR_INIT}, defineHotComponent as {HMR_DEFINE_COMPONENT}, createHotRegistry as {HMR_CREATE_REGISTRY} }} from \"eclipsa/dev-client\";\n"
        ));
        prefix.push_str(&format!(
            "export var {HMR_REGISTRY} = {HMR_CREATE_REGISTRY}();\n{HMR_INIT}(import.meta.hot, import.meta.url, {HMR_REGISTRY});\n"
        ));
    }
    for (template_id, template_html) in &compiler.templates {
        prefix.push_str(&format!(
            "const {template_id} = {CLIENT_CREATE_TEMPLATE}({});\n",
            js_string(template_html)
        ));
    }

    strip_typescript_syntax(&format!("{prefix}{with_hmr}"), id)
}

fn transform_ssr(source: &str, id: &str) -> Result<String, String> {
    let source_type = source_type_for(id);
    let allocator = Allocator::default();
    let program = parse_program(&allocator, source, source_type, id)?;
    let mut compiler = SsrCompiler::new(source, source_type);
    let transformed = compiler.apply_root_replacements(&program)?;
    let prefix = format!(
        "import {{ jsxDEV as {SSR_JSX_DEV}, ssrAttr as {SSR_ATTR}, ssrTemplate as {SSR_TEMPLATE} }} from \"eclipsa/jsx-dev-runtime\";\n"
    );
    strip_typescript_syntax(&format!("{prefix}{transformed}"), id)
}

pub(crate) fn parse_program<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    source_type: SourceType,
    id: &str,
) -> Result<Program<'a>, String> {
    let parsed = Parser::new(allocator, source, source_type).parse();
    if parsed.panicked {
        let preview = source.chars().take(240).collect::<String>();
        return Err(format!(
            "failed to parse {id}: parser panicked\nsource preview:\n{preview}"
        ));
    }
    if !parsed.errors.is_empty() {
        let errors = parsed
            .errors
            .iter()
            .map(|error| error.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("failed to parse {id}:\n{errors}"));
    }
    Ok(parsed.program)
}

fn parse_expression<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    source_type: SourceType,
    id: &str,
) -> Result<Expression<'a>, String> {
    Parser::new(allocator, source, source_type)
        .parse_expression()
        .map_err(|errors| {
            let errors = errors
                .iter()
                .map(|error| error.to_string())
                .collect::<Vec<_>>()
                .join("\n");
            format!("failed to parse expression in {id}:\n{errors}")
        })
}

pub(crate) fn apply_replacements(source: &str, replacements: &mut Vec<Replacement>) -> Result<String, String> {
    replacements.sort_by(|left, right| right.start.cmp(&left.start));
    let mut output = source.to_string();
    let mut last_start = source.len();
    for replacement in replacements {
        if replacement.end > last_start || replacement.start > replacement.end {
            return Err("optimizer produced overlapping replacements".to_string());
        }
        output.replace_range(replacement.start..replacement.end, &replacement.code);
        last_start = replacement.start;
    }
    Ok(output)
}

fn span_range(span: Span) -> (usize, usize) {
    (span.start as usize, span.end as usize)
}

pub(crate) fn js_string(value: &str) -> String {
    serde_json::to_string(value).expect("failed to encode javascript string literal")
}

fn escape_text(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn escape_attr(value: &str) -> String {
    escape_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn normalize_jsx_text(value: &str) -> Option<String> {
    if value.chars().all(|ch| matches!(ch, '\t' | '\r' | '\n' | ' ')) {
        return None;
    }
    if !value.contains('\r') && !value.contains('\n') {
        return Some(value.to_string());
    }

    let mut result = String::new();
    for (index, line) in value.split(['\r', '\n']).enumerate() {
        let mut normalized = line.replace('\t', " ");
        if index > 0 {
            normalized = normalized.trim_start_matches(' ').to_string();
        }
        if !value.ends_with(line) {
            normalized = normalized.trim_end_matches(' ').to_string();
        }
        if normalized.is_empty() {
            continue;
        }
        if !result.is_empty() {
            result.push(' ');
        }
        result.push_str(&normalized);
    }

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

fn is_component_name(name: &str) -> bool {
    name.chars().next().is_some_and(|ch| ch.is_ascii_uppercase())
}

fn get_jsx_attribute_name(name: &JSXAttributeName<'_>) -> Result<String, String> {
    match name {
        JSXAttributeName::Identifier(identifier) => Ok(identifier.name.as_str().to_string()),
        JSXAttributeName::NamespacedName(name) => {
            Ok(format!("{}:{}", name.namespace.name.as_str(), name.name.name.as_str()))
        }
    }
}

fn get_jsx_element_name(name: &JSXElementName<'_>) -> Result<String, String> {
    match name {
        JSXElementName::Identifier(identifier) => Ok(identifier.name.as_str().to_string()),
        JSXElementName::IdentifierReference(identifier) => Ok(identifier.name.as_str().to_string()),
        JSXElementName::NamespacedName(name) => {
            Ok(format!("{}:{}", name.namespace.name.as_str(), name.name.name.as_str()))
        }
        JSXElementName::MemberExpression(_) => {
            Err("JSX member expressions are not supported by the optimizer.".to_string())
        }
        JSXElementName::ThisExpression(_) => {
            Err("this-based JSX elements are not supported by the optimizer.".to_string())
        }
    }
}

fn try_render_static_attr_expression(name: &str, expression: &Expression<'_>) -> Option<String> {
    match expression {
        Expression::NullLiteral(_) => Some(String::new()),
        Expression::BooleanLiteral(value) => {
            if value.value {
                Some(format!(" {name}"))
            } else {
                Some(String::new())
            }
        }
        Expression::StringLiteral(value) => {
            Some(format!(" {name}=\"{}\"", escape_attr(value.value.as_str())))
        }
        Expression::NumericLiteral(value) => {
            Some(format!(" {name}=\"{}\"", escape_attr(&value.value.to_string())))
        }
        Expression::BigIntLiteral(value) => {
            Some(format!(" {name}=\"{}\"", escape_attr(value.value.as_str())))
        }
        _ => None,
    }
}

fn event_name_from_prop(name: &str) -> Option<String> {
    let rest = name.strip_suffix('$')?;
    let event = rest.strip_prefix("on")?;
    let mut chars = event.chars();
    let first = chars.next()?;
    if !first.is_ascii_uppercase() {
        return None;
    }
    let mut output = String::new();
    output.push(first.to_ascii_lowercase());
    output.extend(chars);
    Some(output)
}

fn build_node_lookup(base: &str, path: &[usize]) -> (String, String) {
    let mut marker = base.to_string();
    let mut parent = base.to_string();
    for (index, item) in path.iter().enumerate() {
        marker = format!("{marker}.childNodes[{item}]");
        if path.len() > 1 && index + 2 == path.len() {
            parent = marker.clone();
        }
    }
    (parent, marker)
}

struct ClientCompiler<'s> {
    next_template_index: usize,
    source: &'s str,
    source_type: SourceType,
    templates: Vec<(String, String)>,
}

impl<'s> ClientCompiler<'s> {
    fn new(source: &'s str, source_type: SourceType) -> Self {
        Self {
            next_template_index: 0,
            source,
            source_type,
            templates: Vec::new(),
        }
    }

    fn apply_root_replacements<'a>(&mut self, program: &Program<'a>) -> Result<String, String> {
        let mut replacements = {
            let mut collector = ClientRootCollector {
                compiler: self,
                jsx_depth: 0,
                replacements: Vec::new(),
            };
            collector.visit_program(program);
            collector.replacements
        };
        apply_replacements(self.source, &mut replacements)
    }

    fn slice(&self, span: Span) -> &str {
        let (start, end) = span_range(span);
        &self.source[start..end]
    }

    fn render_nested_jsx_expression(&mut self, expression: &JSXExpression<'_>) -> Result<String, String> {
        let nested_source = self.slice(expression.span()).to_string();
        let allocator = Allocator::default();
        let parsed = parse_expression(&allocator, &nested_source, self.source_type, "<expression>")?;
        let mut nested_compiler = ClientCompiler {
            next_template_index: self.next_template_index,
            source: &nested_source,
            source_type: self.source_type,
            templates: Vec::new(),
        };
        let mut collector = ClientExpressionCollector {
            compiler: &mut nested_compiler,
            error: None,
            jsx_depth: 0,
            replacements: Vec::new(),
        };
        collector.visit_expression(&parsed);
        if let Some(error) = collector.error {
            return Err(error);
        }
        let mut replacements = collector.replacements;
        let transformed = apply_replacements(&nested_source, &mut replacements)?;
        self.next_template_index = nested_compiler.next_template_index;
        self.templates.extend(nested_compiler.templates);
        Ok(transformed)
    }

    fn next_template_id(&mut self) -> String {
        let identifier = format!("__eclipsaTemplate{}", self.next_template_index);
        self.next_template_index += 1;
        identifier
    }

    fn render_root_fragment(&mut self, fragment: &JSXFragment<'_>) -> Result<String, String> {
        let mut inserts = Vec::new();
        let mut attrs = Vec::new();
        let template = self.render_fragment_children(&fragment.children, &[], &mut inserts, &mut attrs)?;
        self.finish_intrinsic_root(template, inserts, attrs, None)
    }

    fn render_root_element(&mut self, element: &JSXElement<'_>) -> Result<String, String> {
        let name = get_jsx_element_name(&element.opening_element.name)?;
        if is_component_name(&name) {
            let (props, key) = self.render_component_props(&element.opening_element.attributes, &element.children)?;
            let expression = format!("{CLIENT_CREATE_COMPONENT}({name}, {props})");
            if let Some(key) = key {
                return Ok(format!(
                    "(() => {{ var f = {expression}; f.key = {key}; return f; }})()"
                ));
            }
            return Ok(expression);
        }

        let mut inserts = Vec::new();
        let mut attrs = Vec::new();
        let template = self.render_intrinsic_element(element, &[], &mut inserts, &mut attrs)?;
        let key = self.extract_key(&element.opening_element.attributes)?;
        self.finish_intrinsic_root(template, inserts, attrs, key)
    }

    fn finish_intrinsic_root(
        &mut self,
        template_html: String,
        inserts: Vec<ClientInsertOp>,
        attrs: Vec<ClientAttrOp>,
        key: Option<String>,
    ) -> Result<String, String> {
        let template_id = self.next_template_id();
        self.templates.push((template_id.clone(), template_html));
        let mut body = format!("var _cloned = {template_id}();");

        for insert in inserts {
            match insert {
                ClientInsertOp::Apply { expr, path } => {
                    let (parent, marker) = build_node_lookup("_cloned", &path);
                    body.push_str(&format!("{CLIENT_INSERT}(() => {expr}, {parent}, {marker});"));
                }
                ClientInsertOp::Component { component, path, props } => {
                    let (parent, marker) = build_node_lookup("_cloned", &path);
                    body.push_str(&format!(
                        "{CLIENT_INSERT}({CLIENT_CREATE_COMPONENT}({component}, {props}), {parent}, {marker});"
                    ));
                }
            }
        }

        for attr in attrs {
            let (_, marker) = build_node_lookup("_cloned", &attr.path);
            body.push_str(&format!(
                "{CLIENT_ATTR}({marker}, {}, () => {});",
                js_string(&attr.name),
                attr.value
            ));
        }

        body.push_str("return _cloned;");
        let base = format!("() => {{ {body} }}");
        if let Some(key) = key {
            Ok(format!("(() => {{ var f = {base}; f.key = {key}; return f; }})()"))
        } else {
            Ok(format!("({base})()"))
        }
    }

    fn extract_key(&mut self, attributes: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>) -> Result<Option<String>, String> {
        for attribute in attributes {
            let JSXAttributeItem::Attribute(attribute) = attribute else {
                continue;
            };
            if get_jsx_attribute_name(&attribute.name)? != "key" {
                continue;
            }
            let Some(value) = &attribute.value else {
                return Ok(None);
            };
            return match value {
                JSXAttributeValue::StringLiteral(value) => Ok(Some(js_string(value.value.as_str()))),
                JSXAttributeValue::ExpressionContainer(container) => match &container.expression {
                    JSXExpression::EmptyExpression(_) => Ok(None),
                    _ => Ok(Some(self.render_jsx_expression(&container.expression, false)?)),
                },
                JSXAttributeValue::Element(element) => Ok(Some(self.render_root_element(element)?)),
                JSXAttributeValue::Fragment(fragment) => Ok(Some(self.render_root_fragment(fragment)?)),
            };
        }
        Ok(None)
    }

    fn render_component_props(
        &mut self,
        attributes: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>,
        children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
    ) -> Result<(String, Option<String>), String> {
        let mut props = Vec::new();
        let mut key = None;

        for attribute in attributes {
            match attribute {
                JSXAttributeItem::SpreadAttribute(attribute) => {
                    props.push(format!("...{}", self.slice(attribute.argument.span())));
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let name = get_jsx_attribute_name(&attribute.name)?;
                    let property_key = js_string(&name);
                    let is_key = name == "key";

                    let Some(value) = &attribute.value else {
                        props.push(format!("{property_key}: true"));
                        continue;
                    };

                    match value {
                        JSXAttributeValue::StringLiteral(value) => {
                            let literal = js_string(value.value.as_str());
                            if is_key {
                                key = Some(literal.clone());
                            }
                            props.push(format!("{property_key}: {literal}"));
                        }
                        JSXAttributeValue::ExpressionContainer(container) => {
                            let JSXExpression::EmptyExpression(_) = &container.expression else {
                                let expression = self.render_jsx_expression(&container.expression, true)?;
                                if is_key {
                                    key = Some(self.render_jsx_expression(&container.expression, false)?);
                                }
                                if let Some(expression) = self.try_render_static_component_prop(&container.expression)? {
                                    props.push(format!("{property_key}: {expression}"));
                                } else {
                                    props.push(format!("get {property_key}() {{ return {expression}; }}"));
                                }
                                continue;
                            };
                        }
                        JSXAttributeValue::Element(element) => {
                            let expression = format!("() => {}", self.render_root_element(element)?);
                            if is_key {
                                key = Some(self.render_root_element(element)?);
                            }
                            props.push(format!("get {property_key}() {{ return {expression}; }}"));
                        }
                        JSXAttributeValue::Fragment(fragment) => {
                            let expression = format!("() => {}", self.render_root_fragment(fragment)?);
                            if is_key {
                                key = Some(self.render_root_fragment(fragment)?);
                            }
                            props.push(format!("get {property_key}() {{ return {expression}; }}"));
                        }
                    }
                }
            }
        }

        let children_expr = self.render_component_children(children)?;
        if !children_expr.is_empty() {
            props.push(format!("children: [{}]", children_expr.join(", ")));
        }

        Ok((format!("{{ {} }}", props.join(", ")), key))
    }

    fn try_render_static_component_prop(&mut self, expression: &JSXExpression<'_>) -> Result<Option<String>, String> {
        match expression {
            JSXExpression::BooleanLiteral(_)
            | JSXExpression::NullLiteral(_)
            | JSXExpression::NumericLiteral(_)
            | JSXExpression::BigIntLiteral(_)
            | JSXExpression::RegExpLiteral(_)
            | JSXExpression::StringLiteral(_) => Ok(Some(self.slice(expression.span()).to_string())),
            JSXExpression::EmptyExpression(_) => Ok(None),
            _ => Ok(None),
        }
    }

    fn render_component_children(
        &mut self,
        children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
    ) -> Result<Vec<String>, String> {
        let mut output = Vec::new();
        for child in children {
            match child {
                JSXChild::Text(text) => {
                    if let Some(normalized) = normalize_jsx_text(text.value.as_str()) {
                        output.push(js_string(&normalized));
                    }
                }
                JSXChild::ExpressionContainer(container) => {
                    if let JSXExpression::EmptyExpression(_) = &container.expression {
                        continue;
                    }
                    output.push(self.render_jsx_expression(&container.expression, true)?);
                }
                JSXChild::Element(element) => output.push(format!("() => {}", self.render_root_element(element)?)),
                JSXChild::Fragment(fragment) => output.extend(self.render_component_children(&fragment.children)?),
                JSXChild::Spread(_) => {}
            }
        }
        Ok(output)
    }

    fn render_jsx_expression(&mut self, expression: &JSXExpression<'_>, defer_jsx: bool) -> Result<String, String> {
        match expression {
            JSXExpression::EmptyExpression(_) => Ok(String::new()),
            JSXExpression::JSXElement(element) => {
                let compiled = self.render_root_element(element)?;
                if defer_jsx {
                    Ok(format!("() => {compiled}"))
                } else {
                    Ok(compiled)
                }
            }
            JSXExpression::JSXFragment(fragment) => {
                let compiled = self.render_root_fragment(fragment)?;
                if defer_jsx {
                    Ok(format!("() => {compiled}"))
                } else {
                    Ok(compiled)
                }
            }
            _ => self.render_nested_jsx_expression(expression),
        }
    }

    fn render_fragment_children(
        &mut self,
        children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
        path: &[usize],
        inserts: &mut Vec<ClientInsertOp>,
        attrs: &mut Vec<ClientAttrOp>,
    ) -> Result<String, String> {
        let mut html = String::new();
        let mut path_index = 0usize;

        for child in children {
            match child {
                JSXChild::Text(text) => {
                    if let Some(normalized) = normalize_jsx_text(text.value.as_str()) {
                        html.push_str(&normalized);
                        path_index += 1;
                    }
                }
                JSXChild::ExpressionContainer(container) => {
                    if let JSXExpression::EmptyExpression(_) = &container.expression {
                        continue;
                    }
                    let child_path = path.iter().copied().chain([path_index]).collect::<Vec<_>>();
                    html.push_str(&format!("<!-- {} -->", child_path.iter().map(|part| part.to_string()).collect::<Vec<_>>().join(",")));
                    inserts.push(ClientInsertOp::Apply {
                        expr: self.render_jsx_expression(&container.expression, false)?,
                        path: child_path,
                    });
                    path_index += 1;
                }
                JSXChild::Element(element) => {
                    let child_path = path.iter().copied().chain([path_index]).collect::<Vec<_>>();
                    let name = get_jsx_element_name(&element.opening_element.name)?;
                    if is_component_name(&name) {
                        let (props, _) =
                            self.render_component_props(&element.opening_element.attributes, &element.children)?;
                        html.push_str(&format!(
                            "<!-- {} -->",
                            child_path.iter().map(|part| part.to_string()).collect::<Vec<_>>().join(",")
                        ));
                        inserts.push(ClientInsertOp::Component { component: name, path: child_path, props });
                    } else {
                        html.push_str(&self.render_intrinsic_element(element, &child_path, inserts, attrs)?);
                    }
                    path_index += 1;
                }
                JSXChild::Fragment(fragment) => {
                    let child_path = path.iter().copied().chain([path_index]).collect::<Vec<_>>();
                    html.push_str(&self.render_fragment_children(&fragment.children, &child_path, inserts, attrs)?);
                    path_index += 1;
                }
                JSXChild::Spread(_) => {
                    return Err("JSXSpreadChild is not supported.".to_string());
                }
            }
        }

        Ok(html)
    }

    fn render_intrinsic_element(
        &mut self,
        element: &JSXElement<'_>,
        path: &[usize],
        inserts: &mut Vec<ClientInsertOp>,
        attrs: &mut Vec<ClientAttrOp>,
    ) -> Result<String, String> {
        let name = get_jsx_element_name(&element.opening_element.name)?;

        for attribute in &element.opening_element.attributes {
            match attribute {
                JSXAttributeItem::SpreadAttribute(_) => {
                    return Err("JSXSpreadAttribute is not supported.".to_string());
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let attr_name = get_jsx_attribute_name(&attribute.name)?;
                    let value = match &attribute.value {
                        None => "true".to_string(),
                        Some(JSXAttributeValue::StringLiteral(value)) => js_string(value.value.as_str()),
                        Some(JSXAttributeValue::ExpressionContainer(container)) => {
                            if let JSXExpression::EmptyExpression(_) = &container.expression {
                                return Err("JSXEmptyExpression as an attribute value is not supported.".to_string());
                            }
                            self.render_jsx_expression(&container.expression, false)?
                        }
                        Some(JSXAttributeValue::Element(element)) => self.render_root_element(element)?,
                        Some(JSXAttributeValue::Fragment(fragment)) => self.render_root_fragment(fragment)?,
                    };
                    attrs.push(ClientAttrOp { name: attr_name, path: path.to_vec(), value });
                }
            }
        }

        let children = self.render_fragment_children(&element.children, path, inserts, attrs)?;
        Ok(format!("<{name}>{children}</{name}>"))
    }
}

struct ClientRootCollector<'c, 's> {
    compiler: &'c mut ClientCompiler<'s>,
    jsx_depth: usize,
    replacements: Vec<Replacement>,
}

struct ClientExpressionCollector<'c, 's> {
    compiler: &'c mut ClientCompiler<'s>,
    error: Option<String>,
    jsx_depth: usize,
    replacements: Vec<Replacement>,
}

impl<'a, 'c, 's> Visit<'a> for ClientRootCollector<'c, 's> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        if self.jsx_depth == 0 {
            if let Ok(code) = self.compiler.render_root_element(element) {
                let (start, end) = span_range(element.span);
                self.replacements.push(Replacement { start, end, code });
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_element(self, element);
        self.jsx_depth -= 1;
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) {
        if self.jsx_depth == 0 {
            if let Ok(code) = self.compiler.render_root_fragment(fragment) {
                let (start, end) = span_range(fragment.span);
                self.replacements.push(Replacement { start, end, code });
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_fragment(self, fragment);
        self.jsx_depth -= 1;
    }
}

impl<'a, 'c, 's> Visit<'a> for ClientExpressionCollector<'c, 's> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.jsx_depth == 0 {
            match self.compiler.render_root_element(element) {
                Ok(code) => {
                    let (start, end) = span_range(element.span);
                    self.replacements.push(Replacement { start, end, code });
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_element(self, element);
        self.jsx_depth -= 1;
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.jsx_depth == 0 {
            match self.compiler.render_root_fragment(fragment) {
                Ok(code) => {
                    let (start, end) = span_range(fragment.span);
                    self.replacements.push(Replacement { start, end, code });
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_fragment(self, fragment);
        self.jsx_depth -= 1;
    }
}

struct SsrCompiler<'s> {
    source: &'s str,
    source_type: SourceType,
}

impl<'s> SsrCompiler<'s> {
    fn new(source: &'s str, source_type: SourceType) -> Self {
        Self { source, source_type }
    }

    fn apply_root_replacements<'a>(&mut self, program: &Program<'a>) -> Result<String, String> {
        let mut replacements = {
            let mut collector = SsrRootCollector {
                compiler: self,
                jsx_depth: 0,
                replacements: Vec::new(),
            };
            collector.visit_program(program);
            collector.replacements
        };
        apply_replacements(self.source, &mut replacements)
    }

    fn slice(&self, span: Span) -> &str {
        let (start, end) = span_range(span);
        &self.source[start..end]
    }

    fn render_nested_jsx_expression(&mut self, expression: &JSXExpression<'_>) -> Result<String, String> {
        let nested_source = self.slice(expression.span()).to_string();
        let allocator = Allocator::default();
        let parsed = parse_expression(&allocator, &nested_source, self.source_type, "<expression>")?;
        let mut nested_compiler = SsrCompiler {
            source: &nested_source,
            source_type: self.source_type,
        };
        let mut collector = SsrExpressionCollector {
            compiler: &mut nested_compiler,
            error: None,
            jsx_depth: 0,
            replacements: Vec::new(),
        };
        collector.visit_expression(&parsed);
        if let Some(error) = collector.error {
            return Err(error);
        }
        let mut replacements = collector.replacements;
        apply_replacements(&nested_source, &mut replacements)
    }

    fn render_jsx_expression(&mut self, expression: &JSXExpression<'_>) -> Result<String, String> {
        match expression {
            JSXExpression::EmptyExpression(_) => Ok(String::new()),
            JSXExpression::JSXElement(element) => self.render_root_element(element),
            JSXExpression::JSXFragment(fragment) => self.render_root_fragment(fragment),
            _ => self.render_nested_jsx_expression(expression),
        }
    }

    fn render_root_element(&mut self, element: &JSXElement<'_>) -> Result<String, String> {
        if let Some(fast_path) = self.try_render_fast_path_element(element)? {
            return Ok(fast_path);
        }
        self.render_generic_element(element)
    }

    fn render_root_fragment(&mut self, fragment: &JSXFragment<'_>) -> Result<String, String> {
        if let Some(fast_path) = self.try_render_fast_path_fragment(fragment)? {
            return Ok(fast_path);
        }
        let children = self.render_children_array(&fragment.children)?;
        Ok(format!(
            "{SSR_JSX_DEV}({}, {{ \"children\": [{}] }}, null, false, {{}})",
            js_string(FRAGMENT_NAME),
            children.join(", ")
        ))
    }

    fn render_generic_element(&mut self, element: &JSXElement<'_>) -> Result<String, String> {
        let name = get_jsx_element_name(&element.opening_element.name)?;
        let (props, key) = self.render_props(&element.opening_element.attributes, &element.children)?;
        let key = key.unwrap_or_else(|| "null".to_string());
        let jsx_type = if is_component_name(&name) { name } else { js_string(&name) };
        Ok(format!("{SSR_JSX_DEV}({jsx_type}, {props}, {key}, false, {{}})"))
    }

    fn render_props(
        &mut self,
        attributes: &oxc_allocator::Vec<'_, JSXAttributeItem<'_>>,
        children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
    ) -> Result<(String, Option<String>), String> {
        let mut props = Vec::new();
        let mut key = None;

        for attribute in attributes {
            match attribute {
                JSXAttributeItem::SpreadAttribute(attribute) => {
                    props.push(format!("...{}", self.slice(attribute.argument.span())));
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let name = get_jsx_attribute_name(&attribute.name)?;
                    let property_key = js_string(&name);
                    let is_key = name == "key";

                    let Some(value) = &attribute.value else {
                        props.push(format!("{property_key}: true"));
                        continue;
                    };

                    match value {
                        JSXAttributeValue::StringLiteral(value) => {
                            let literal = js_string(value.value.as_str());
                            if is_key {
                                key = Some(literal.clone());
                            }
                            props.push(format!("{property_key}: {literal}"));
                        }
                        JSXAttributeValue::ExpressionContainer(container) => {
                            if let JSXExpression::EmptyExpression(_) = &container.expression {
                                continue;
                            }
                            let expression = self.render_jsx_expression(&container.expression)?;
                            if is_key {
                                key = Some(expression.clone());
                            }
                            if matches!(
                                &container.expression,
                                JSXExpression::BooleanLiteral(_)
                                    | JSXExpression::NullLiteral(_)
                                    | JSXExpression::NumericLiteral(_)
                                    | JSXExpression::BigIntLiteral(_)
                                    | JSXExpression::RegExpLiteral(_)
                                    | JSXExpression::StringLiteral(_)
                            ) {
                                props.push(format!("{property_key}: {expression}"));
                            } else {
                                props.push(format!("get {property_key}() {{ return {expression}; }}"));
                            }
                        }
                        JSXAttributeValue::Element(element) => {
                            let expression = self.render_root_element(element)?;
                            if is_key {
                                key = Some(expression.clone());
                            }
                            props.push(format!("get {property_key}() {{ return {expression}; }}"));
                        }
                        JSXAttributeValue::Fragment(fragment) => {
                            let expression = self.render_root_fragment(fragment)?;
                            if is_key {
                                key = Some(expression.clone());
                            }
                            props.push(format!("get {property_key}() {{ return {expression}; }}"));
                        }
                    }
                }
            }
        }

        let children_array = self.render_children_array(children)?;
        props.push(format!("\"children\": [{}]", children_array.join(", ")));

        Ok((format!("{{ {} }}", props.join(", ")), key))
    }

    fn render_children_array(
        &mut self,
        children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
    ) -> Result<Vec<String>, String> {
        let mut output = Vec::new();
        for child in children {
            match child {
                JSXChild::Text(text) => {
                    if let Some(normalized) = normalize_jsx_text(text.value.as_str()) {
                        output.push(js_string(&normalized));
                    }
                }
                JSXChild::ExpressionContainer(container) => {
                    if let JSXExpression::EmptyExpression(_) = &container.expression {
                        continue;
                    }
                    output.push(self.render_jsx_expression(&container.expression)?);
                }
                JSXChild::Element(element) => output.push(self.render_root_element(element)?),
                JSXChild::Fragment(fragment) => output.extend(self.render_children_array(&fragment.children)?),
                JSXChild::Spread(_) => {}
            }
        }
        Ok(output)
    }

    fn try_render_fast_path_element(&mut self, element: &JSXElement<'_>) -> Result<Option<String>, String> {
        let name = get_jsx_element_name(&element.opening_element.name)?;
        if is_component_name(&name) || name == "body" {
            return Ok(None);
        }

        let mut strings = vec![format!("<{name}")];
        let mut values = Vec::new();

        for attribute in &element.opening_element.attributes {
            let JSXAttributeItem::Attribute(attribute) = attribute else {
                return Ok(None);
            };
            let attr_name = get_jsx_attribute_name(&attribute.name)?;
            if attr_name == "ref"
                || attr_name == DANGEROUSLY_SET_INNER_HTML_PROP
                || event_name_from_prop(&attr_name).is_some()
            {
                return Ok(None);
            }

            let Some(value) = &attribute.value else {
                strings.last_mut().unwrap().push_str(&format!(" {attr_name}"));
                continue;
            };

            match value {
                JSXAttributeValue::StringLiteral(value) => {
                    strings
                        .last_mut()
                        .unwrap()
                        .push_str(&format!(" {attr_name}=\"{}\"", escape_attr(value.value.as_str())));
                }
                JSXAttributeValue::ExpressionContainer(container) => {
                    if let JSXExpression::EmptyExpression(_) = &container.expression {
                        continue;
                    }
                    let expression = self.render_jsx_expression(&container.expression)?;
                    if let Some(static_value) = match &container.expression {
                        JSXExpression::BooleanLiteral(value) => {
                            if value.value {
                                Some(format!(" {attr_name}"))
                            } else {
                                Some(String::new())
                            }
                        }
                        JSXExpression::NullLiteral(_) => Some(String::new()),
                        JSXExpression::NumericLiteral(_)
                        | JSXExpression::BigIntLiteral(_)
                        | JSXExpression::StringLiteral(_) => {
                            try_render_static_attr_expression(&attr_name, &container.expression.to_expression())
                        }
                        _ => None,
                    } {
                        strings.last_mut().unwrap().push_str(&static_value);
                    } else {
                        values.push(format!("{SSR_ATTR}({}, {expression})", js_string(&attr_name)));
                        strings.push(String::new());
                    }
                }
                JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_) => {
                    return Ok(None);
                }
            }
        }

        strings.last_mut().unwrap().push('>');
        for child in &element.children {
            if !self.append_fast_child(child, &mut strings, &mut values)? {
                return Ok(None);
            }
        }
        strings.last_mut().unwrap().push_str(&format!("</{name}>"));

        Ok(Some(render_ssr_template_call(&strings, &values)))
    }

    fn try_render_fast_path_fragment(&mut self, fragment: &JSXFragment<'_>) -> Result<Option<String>, String> {
        let mut strings = vec![String::new()];
        let mut values = Vec::new();
        for child in &fragment.children {
            if !self.append_fast_child(child, &mut strings, &mut values)? {
                return Ok(None);
            }
        }
        Ok(Some(render_ssr_template_call(&strings, &values)))
    }

    fn append_fast_child(
        &mut self,
        child: &JSXChild<'_>,
        strings: &mut Vec<String>,
        values: &mut Vec<String>,
    ) -> Result<bool, String> {
        match child {
            JSXChild::Text(text) => {
                if let Some(normalized) = normalize_jsx_text(text.value.as_str()) {
                    strings.last_mut().unwrap().push_str(&escape_text(&normalized));
                }
                Ok(true)
            }
            JSXChild::ExpressionContainer(container) => {
                if let JSXExpression::EmptyExpression(_) = &container.expression {
                    return Ok(true);
                }
                if let Some(static_text) = match &container.expression {
                    JSXExpression::BooleanLiteral(value) => Some(escape_text(&value.value.to_string())),
                    JSXExpression::NullLiteral(_) => Some(String::new()),
                    JSXExpression::NumericLiteral(value) => Some(escape_text(&value.value.to_string())),
                    JSXExpression::BigIntLiteral(value) => Some(escape_text(value.value.as_str())),
                    JSXExpression::StringLiteral(value) => Some(escape_text(value.value.as_str())),
                    _ => None,
                } {
                    strings.last_mut().unwrap().push_str(&static_text);
                } else {
                    values.push(self.render_jsx_expression(&container.expression)?);
                    strings.push(String::new());
                }
                Ok(true)
            }
            JSXChild::Element(element) => {
                if let Some(fast_path) = self.try_render_fast_path_element(element)? {
                    values.push(fast_path);
                } else {
                    values.push(self.render_generic_element(element)?);
                }
                strings.push(String::new());
                Ok(true)
            }
            JSXChild::Fragment(fragment) => {
                if let Some(fast_path) = self.try_render_fast_path_fragment(fragment)? {
                    values.push(fast_path);
                    strings.push(String::new());
                    return Ok(true);
                }
                values.push(self.render_root_fragment(fragment)?);
                strings.push(String::new());
                Ok(true)
            }
            JSXChild::Spread(_) => Ok(false),
        }
    }
}

struct SsrRootCollector<'c, 's> {
    compiler: &'c mut SsrCompiler<'s>,
    jsx_depth: usize,
    replacements: Vec<Replacement>,
}

struct SsrExpressionCollector<'c, 's> {
    compiler: &'c mut SsrCompiler<'s>,
    error: Option<String>,
    jsx_depth: usize,
    replacements: Vec<Replacement>,
}

impl<'a, 'c, 's> Visit<'a> for SsrRootCollector<'c, 's> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        if self.jsx_depth == 0 {
            if let Ok(code) = self.compiler.render_root_element(element) {
                let (start, end) = span_range(element.span);
                self.replacements.push(Replacement { start, end, code });
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_element(self, element);
        self.jsx_depth -= 1;
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) {
        if self.jsx_depth == 0 {
            if let Ok(code) = self.compiler.render_root_fragment(fragment) {
                let (start, end) = span_range(fragment.span);
                self.replacements.push(Replacement { start, end, code });
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_fragment(self, fragment);
        self.jsx_depth -= 1;
    }
}

impl<'a, 'c, 's> Visit<'a> for SsrExpressionCollector<'c, 's> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.jsx_depth == 0 {
            match self.compiler.render_root_element(element) {
                Ok(code) => {
                    let (start, end) = span_range(element.span);
                    self.replacements.push(Replacement { start, end, code });
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_element(self, element);
        self.jsx_depth -= 1;
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.jsx_depth == 0 {
            match self.compiler.render_root_fragment(fragment) {
                Ok(code) => {
                    let (start, end) = span_range(fragment.span);
                    self.replacements.push(Replacement { start, end, code });
                }
                Err(error) => {
                    self.error = Some(error);
                }
            }
            return;
        }
        self.jsx_depth += 1;
        walk::walk_jsx_fragment(self, fragment);
        self.jsx_depth -= 1;
    }
}

fn render_ssr_template_call(strings: &[String], values: &[String]) -> String {
    let strings_array = strings
        .iter()
        .map(|entry| js_string(entry))
        .collect::<Vec<_>>()
        .join(", ");
    if values.is_empty() {
        format!("{SSR_TEMPLATE}([{strings_array}])")
    } else {
        format!("{SSR_TEMPLATE}([{strings_array}], {})", values.join(", "))
    }
}

fn wrap_hot_components(source: &str, id: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let program = parse_program(&allocator, source, source_type_for(id), id)?;
    let mut collector = HmrCollector {
        component_local_name: None,
        export_default_depth: 0,
        replacements: Vec::new(),
        source,
    };
    collector.visit_program(&program);
    apply_replacements(source, &mut collector.replacements)
}

struct HmrCollector<'s> {
    component_local_name: Option<String>,
    export_default_depth: usize,
    replacements: Vec<Replacement>,
    source: &'s str,
}

impl<'s> HmrCollector<'s> {
    fn slice(&self, span: Span) -> &str {
        let (start, end) = span_range(span);
        &self.source[start..end]
    }
}

impl<'a, 's> Visit<'a> for HmrCollector<'s> {
    fn visit_import_declaration(&mut self, declaration: &ImportDeclaration<'a>) {
        if declaration.source.value.as_str() == "eclipsa" {
            if let Some(specifiers) = &declaration.specifiers {
                for specifier in specifiers {
                    let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                        continue;
                    };
                    let imported_name = match &specifier.imported {
                        ModuleExportName::IdentifierName(name) => name.name.as_str(),
                        ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                        ModuleExportName::StringLiteral(name) => name.value.as_str(),
                    };
                    if imported_name == "component$" {
                        self.component_local_name = Some(specifier.local.name.as_str().to_string());
                    }
                }
            }
        }
        walk::walk_import_declaration(self, declaration);
    }

    fn visit_export_default_declaration(&mut self, declaration: &ExportDefaultDeclaration<'a>) {
        self.export_default_depth += 1;
        walk::walk_export_default_declaration(self, declaration);
        self.export_default_depth -= 1;
    }

    fn visit_call_expression(&mut self, expression: &CallExpression<'a>) {
        if let Expression::Identifier(identifier) = &expression.callee {
            if self.component_local_name.as_deref() == Some(identifier.name.as_str()) {
                let original = self.slice(expression.span);
                let name = if self.export_default_depth > 0 {
                    js_string("default")
                } else {
                    "null".to_string()
                };
                let code = format!(
                    "{HMR_DEFINE_COMPONENT}({original}, {{ registry: {HMR_REGISTRY}, name: {name} }})"
                );
                let (start, end) = span_range(expression.span);
                self.replacements.push(Replacement { start, end, code });
                return;
            }
        }
        walk::walk_call_expression(self, expression);
    }
}
