mod analyze;

use std::collections::BTreeMap;
use std::path::Path;
use std::panic::{self, AssertUnwindSafe};

use napi::Error;
use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionExpression, CallExpression, ConditionalExpression, ExportDefaultDeclaration,
    ExportDefaultDeclarationKind, Expression,
    JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement, JSXElementName,
    JSXExpression, JSXFragment, JSXMemberExpressionObject, LogicalExpression, LogicalOperator, Program,
    Statement, StaticMemberExpression, VariableDeclarator,
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
const SSR_RAW: &str = "_ssrRaw";
const SSR_RENDER_ATTR: &str = "_renderSSRAttr";
const SSR_RENDER_MAP: &str = "_renderSSRMap";
const SSR_RENDER_VALUE: &str = "_renderSSRValue";
const SSR_TEMPLATE: &str = "_ssrTemplate";
const COMPILER_FOR: &str = "__eclipsaFor";
const COMPILER_SHOW: &str = "__eclipsaShow";
const HMR_INIT: &str = "_initHot";
const HMR_DEFINE_COMPONENT: &str = "_defineHotComponent";
const HMR_CREATE_REGISTRY: &str = "_createHotRegistry";
const HMR_REGISTRY: &str = "__eclipsa$hotRegistry";
const FRAGMENT_NAME: &str = "__ECLIPSA_FRAGMENT";
const DANGEROUSLY_SET_INNER_HTML_PROP: &str = "dangerouslySetInnerHTML";
const SHOW_VALUE_PARAM: &str = "__e_showValue";

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

struct JsxPresenceCollector {
    found: bool,
}

impl<'a> Visit<'a> for JsxPresenceCollector {
    fn visit_jsx_element(&mut self, _element: &JSXElement<'a>) {
        self.found = true;
    }

    fn visit_jsx_fragment(&mut self, _fragment: &JSXFragment<'a>) {
        self.found = true;
    }
}

fn expression_contains_jsx<'a>(expression: &Expression<'a>) -> bool {
    let mut collector = JsxPresenceCollector { found: false };
    collector.visit_expression(expression);
    collector.found
}

fn render_lazy_branch_expression(expression: &str) -> String {
    format!("({SHOW_VALUE_PARAM}) => ({expression})")
}

fn render_identity_branch() -> String {
    format!("({SHOW_VALUE_PARAM}) => ({SHOW_VALUE_PARAM})")
}

fn get_arrow_expression_body<'a>(expression: &'a ArrowFunctionExpression<'a>) -> Option<&'a Expression<'a>> {
    if !expression.expression || !expression.body.directives.is_empty() || expression.body.statements.len() != 1 {
        return None;
    }

    match &expression.body.statements[0] {
        Statement::ExpressionStatement(statement) => Some(&statement.expression),
        _ => None,
    }
}

fn unwrap_parenthesized_expression<'a>(mut expression: &'a Expression<'a>) -> &'a Expression<'a> {
    while let Expression::ParenthesizedExpression(parenthesized) = expression {
        expression = &parenthesized.expression;
    }
    expression
}

fn is_direct_jsx_map_callback<'a>(callback: &'a ArrowFunctionExpression<'a>) -> bool {
    let Some(body) = get_arrow_expression_body(callback) else {
        return false;
    };
    matches!(
        unwrap_parenthesized_expression(body),
        Expression::JSXElement(_) | Expression::JSXFragment(_)
    )
}

fn get_static_map_callee<'a>(call: &'a CallExpression<'a>) -> Option<&'a StaticMemberExpression<'a>> {
    if call.optional {
        return None;
    }

    match &call.callee {
        Expression::StaticMemberExpression(member) if !member.optional && member.property.name.as_str() == "map" => {
            Some(member)
        }
        _ => None,
    }
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
    if compiler.uses_for {
        prefix.push_str(&format!(
            "import {{ For as {COMPILER_FOR} }} from \"eclipsa\";\n"
        ));
    }
    if compiler.uses_show {
        prefix.push_str(&format!(
            "import {{ Show as {COMPILER_SHOW} }} from \"eclipsa\";\n"
        ));
    }
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
    let mut prefix = format!(
        "import {{ jsxDEV as {SSR_JSX_DEV}, ssrRaw as {SSR_RAW}, ssrTemplate as {SSR_TEMPLATE} }} from \"eclipsa/jsx-dev-runtime\";\nimport {{ renderSSRAttr as {SSR_RENDER_ATTR}, renderSSRMap as {SSR_RENDER_MAP}, renderSSRValue as {SSR_RENDER_VALUE} }} from \"eclipsa\";\n"
    );
    if compiler.uses_for {
        prefix.push_str(&format!(
            "import {{ For as {COMPILER_FOR} }} from \"eclipsa\";\n"
        ));
    }
    if compiler.uses_show {
        prefix.push_str(&format!(
            "import {{ Show as {COMPILER_SHOW} }} from \"eclipsa\";\n"
        ));
    }
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
    name.chars().next().is_some_and(|ch| {
        ch.to_ascii_lowercase() != ch || !ch.is_ascii_alphabetic()
    }) || name.contains('.')
}

fn jsx_member_expression_object_to_string(object: &JSXMemberExpressionObject<'_>) -> Result<String, String> {
    match object {
        JSXMemberExpressionObject::IdentifierReference(identifier) => {
            Ok(identifier.name.as_str().to_string())
        }
        JSXMemberExpressionObject::MemberExpression(expression) => Ok(format!(
            "{}.{}",
            jsx_member_expression_object_to_string(&expression.object)?,
            expression.property.name.as_str(),
        )),
        JSXMemberExpressionObject::ThisExpression(_) => {
            Err("this-based JSX elements are not supported by the optimizer.".to_string())
        }
    }
}

fn jsx_element_name_to_string(name: &JSXElementName<'_>) -> Result<String, String> {
    match name {
        JSXElementName::Identifier(identifier) => Ok(identifier.name.as_str().to_string()),
        JSXElementName::IdentifierReference(identifier) => Ok(identifier.name.as_str().to_string()),
        JSXElementName::NamespacedName(name) => {
            Ok(format!("{}:{}", name.namespace.name.as_str(), name.name.name.as_str()))
        }
        JSXElementName::MemberExpression(expression) => Ok(format!(
            "{}.{}",
            jsx_member_expression_object_to_string(&expression.object)?,
            expression.property.name.as_str(),
        )),
        JSXElementName::ThisExpression(_) => {
            Err("this-based JSX elements are not supported by the optimizer.".to_string())
        }
    }
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
    jsx_element_name_to_string(name)
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
    if name.ends_with('$') {
        return None;
    }
    let event = name.strip_prefix("on")?;
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

fn should_apply_attr_at_runtime(name: &str) -> bool {
    name == "ref" || name == DANGEROUSLY_SET_INNER_HTML_PROP || event_name_from_prop(name).is_some()
}

fn collect_node_lookup_paths(path: &[usize]) -> Vec<Vec<usize>> {
    let mut prefixes = Vec::new();
    for index in 0..path.len() {
        prefixes.push(path[..=index].to_vec());
    }
    prefixes
}

fn build_node_lookup(
    base: &str,
    path: &[usize],
    cached_nodes: &BTreeMap<Vec<usize>, String>,
) -> (String, String) {
    if path.is_empty() {
        return (base.to_string(), base.to_string());
    }

    let marker = cached_nodes
        .get(path)
        .cloned()
        .unwrap_or_else(|| base.to_string());
    let parent = if path.len() > 1 {
        cached_nodes
            .get(&path[..path.len() - 1])
            .cloned()
            .unwrap_or_else(|| base.to_string())
    } else {
        base.to_string()
    };
    (parent, marker)
}

struct ClientCompiler<'s> {
    next_template_index: usize,
    source: &'s str,
    source_type: SourceType,
    templates: Vec<(String, String)>,
    uses_for: bool,
    uses_show: bool,
}

impl<'s> ClientCompiler<'s> {
    fn new(source: &'s str, source_type: SourceType) -> Self {
        Self {
            next_template_index: 0,
            source,
            source_type,
            templates: Vec::new(),
            uses_for: false,
            uses_show: false,
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

    fn render_nested_expression_span(
        &mut self,
        span: Span,
        allow_flow_lowering: bool,
    ) -> Result<String, String> {
        let nested_source = self.slice(span).to_string();
        let allocator = Allocator::default();
        let parsed = parse_expression(&allocator, &nested_source, self.source_type, "<expression>")?;
        let mut nested_compiler = ClientCompiler {
            next_template_index: self.next_template_index,
            source: &nested_source,
            source_type: self.source_type,
            templates: Vec::new(),
            uses_for: false,
            uses_show: false,
        };
        let mut collector = ClientExpressionCollector {
            allow_flow_lowering,
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
        self.uses_for |= nested_compiler.uses_for;
        self.uses_show |= nested_compiler.uses_show;
        Ok(transformed)
    }

    fn render_nested_jsx_expression(
        &mut self,
        expression: &JSXExpression<'_>,
        allow_flow_lowering: bool,
    ) -> Result<String, String> {
        self.render_nested_expression_span(expression.span(), allow_flow_lowering)
    }

    fn render_compiler_show(&mut self, when: String, children: String, fallback: String) -> String {
        self.uses_show = true;
        format!(
            "{CLIENT_CREATE_COMPONENT}({COMPILER_SHOW}, {{ when: {when}, children: {children}, fallback: {fallback} }})"
        )
    }

    fn render_compiler_for(
        &mut self,
        arr: String,
        callback: String,
        key_callback: Option<String>,
    ) -> String {
        self.uses_for = true;
        match key_callback {
            Some(key_callback) => format!(
                "{CLIENT_CREATE_COMPONENT}({COMPILER_FOR}, {{ arr: {arr}, fn: {callback}, key: {key_callback} }})"
            ),
            None => format!("{CLIENT_CREATE_COMPONENT}({COMPILER_FOR}, {{ arr: {arr}, fn: {callback} }})"),
        }
    }

    fn try_render_conditional_show(
        &mut self,
        expression: &ConditionalExpression<'_>,
    ) -> Result<Option<String>, String> {
        if !expression_contains_jsx(&expression.consequent)
            && !expression_contains_jsx(&expression.alternate)
        {
            return Ok(None);
        }

        let test = self.render_nested_expression_span(expression.test.span(), true)?;
        let consequent = self.render_nested_expression_span(expression.consequent.span(), true)?;
        let alternate = self.render_nested_expression_span(expression.alternate.span(), true)?;
        Ok(Some(self.render_compiler_show(
            test,
            render_lazy_branch_expression(&consequent),
            render_lazy_branch_expression(&alternate),
        )))
    }

    fn try_render_logical_show(
        &mut self,
        expression: &LogicalExpression<'_>,
    ) -> Result<Option<String>, String> {
        match expression.operator {
            LogicalOperator::And => {
                if !expression_contains_jsx(&expression.right) {
                    return Ok(None);
                }

                let left = self.render_nested_expression_span(expression.left.span(), true)?;
                let right = self.render_nested_expression_span(expression.right.span(), true)?;
                Ok(Some(self.render_compiler_show(
                    left,
                    render_lazy_branch_expression(&right),
                    render_identity_branch(),
                )))
            }
            LogicalOperator::Or => {
                if !expression_contains_jsx(&expression.left)
                    && !expression_contains_jsx(&expression.right)
                {
                    return Ok(None);
                }

                let left = self.render_nested_expression_span(expression.left.span(), true)?;
                let right = self.render_nested_expression_span(expression.right.span(), true)?;
                Ok(Some(self.render_compiler_show(
                    left,
                    render_identity_branch(),
                    render_lazy_branch_expression(&right),
                )))
            }
            LogicalOperator::Coalesce => Ok(None),
        }
    }

    fn try_render_map_for(&mut self, expression: &CallExpression<'_>) -> Result<Option<String>, String> {
        let Some(member) = get_static_map_callee(expression) else {
            return Ok(None);
        };
        if expression.arguments.len() != 1 {
            return Ok(None);
        }

        let callback = match &expression.arguments[0] {
            oxc_ast::ast::Argument::ArrowFunctionExpression(callback) if is_direct_jsx_map_callback(callback) => callback,
            _ => return Ok(None),
        };

        let arr = self.render_nested_expression_span(member.object.span(), true)?;
        let compiled_callback = self.render_nested_expression_span(callback.span(), true)?;
        let params = self.slice(callback.params.span).to_string();
        let key_callback = self
            .extract_map_callback_key(callback)?
            .map(|key_expression| format!("{params} => {key_expression}"));
        Ok(Some(self.render_compiler_for(arr, compiled_callback, key_callback)))
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
        let mut lookup_paths = Vec::new();

        for insert in &inserts {
            let path = match insert {
                ClientInsertOp::Apply { path, .. } => path,
                ClientInsertOp::Component { path, .. } => path,
            };
            for prefix in collect_node_lookup_paths(path) {
                if !lookup_paths.contains(&prefix) {
                    lookup_paths.push(prefix);
                }
            }
        }

        for attr in &attrs {
            for prefix in collect_node_lookup_paths(&attr.path) {
                if !lookup_paths.contains(&prefix) {
                    lookup_paths.push(prefix);
                }
            }
        }

        lookup_paths.sort_by(|left, right| left.len().cmp(&right.len()).then(left.cmp(right)));

        let mut cached_nodes = BTreeMap::new();
        for (index, path) in lookup_paths.iter().enumerate() {
            let variable = format!("__eclipsaNode{index}");
            let lookup = if path.len() == 1 {
                format!("_cloned.childNodes[{}]", path[0])
            } else {
                let parent = cached_nodes
                    .get(&path[..path.len() - 1])
                    .expect("parent lookup should be cached before children");
                format!("{parent}.childNodes[{}]", path[path.len() - 1])
            };
            body.push_str(&format!("var {variable} = {lookup};"));
            cached_nodes.insert(path.clone(), variable);
        }

        for insert in inserts {
            match insert {
                ClientInsertOp::Apply { expr, path } => {
                    let (parent, marker) = build_node_lookup("_cloned", &path, &cached_nodes);
                    body.push_str(&format!("{CLIENT_INSERT}(() => {expr}, {parent}, {marker});"));
                }
                ClientInsertOp::Component { component, path, props } => {
                    let (parent, marker) = build_node_lookup("_cloned", &path, &cached_nodes);
                    body.push_str(&format!(
                        "{CLIENT_INSERT}({CLIENT_CREATE_COMPONENT}({component}, {props}), {parent}, {marker});"
                    ));
                }
            }
        }

        for attr in attrs {
            let (_, marker) = build_node_lookup("_cloned", &attr.path, &cached_nodes);
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

    fn extract_map_callback_key(
        &mut self,
        callback: &ArrowFunctionExpression<'_>,
    ) -> Result<Option<String>, String> {
        let Some(body) = get_arrow_expression_body(callback) else {
            return Ok(None);
        };

        match unwrap_parenthesized_expression(body) {
            Expression::JSXElement(element) => self.extract_key(&element.opening_element.attributes),
            _ => Ok(None),
        }
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
                                let expression =
                                    self.render_jsx_expression(&container.expression, true)?;
                                if is_key {
                                    key = Some(self.render_jsx_expression(&container.expression, true)?);
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

    fn render_jsx_expression(
        &mut self,
        expression: &JSXExpression<'_>,
        defer_jsx: bool,
    ) -> Result<String, String> {
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
            _ => self.render_nested_jsx_expression(expression, !defer_jsx),
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
        let mut html = format!("<{name}");

        for attribute in &element.opening_element.attributes {
            match attribute {
                JSXAttributeItem::SpreadAttribute(_) => {
                    return Err("JSXSpreadAttribute is not supported.".to_string());
                }
                JSXAttributeItem::Attribute(attribute) => {
                    let attr_name = get_jsx_attribute_name(&attribute.name)?;
                    if !should_apply_attr_at_runtime(&attr_name) {
                        match &attribute.value {
                            None => {
                                html.push_str(&format!(" {attr_name}"));
                                continue;
                            }
                            Some(JSXAttributeValue::StringLiteral(value)) => {
                                html.push_str(&format!(
                                    " {attr_name}=\"{}\"",
                                    escape_attr(value.value.as_str())
                                ));
                                continue;
                            }
                            _ => {}
                        }
                    }

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

        html.push('>');
        let children = self.render_fragment_children(&element.children, path, inserts, attrs)?;
        html.push_str(&children);
        html.push_str(&format!("</{name}>"));
        Ok(html)
    }
}

struct ClientRootCollector<'c, 's> {
    compiler: &'c mut ClientCompiler<'s>,
    jsx_depth: usize,
    replacements: Vec<Replacement>,
}

struct ClientExpressionCollector<'c, 's> {
    allow_flow_lowering: bool,
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
    fn visit_call_expression(&mut self, expression: &CallExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.allow_flow_lowering && self.jsx_depth == 0 {
            match self.compiler.try_render_map_for(expression) {
                Ok(Some(code)) => {
                    let (start, end) = span_range(expression.span);
                    self.replacements.push(Replacement { start, end, code });
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
        walk::walk_call_expression(self, expression);
    }

    fn visit_conditional_expression(&mut self, expression: &ConditionalExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.allow_flow_lowering && self.jsx_depth == 0 {
            match self.compiler.try_render_conditional_show(expression) {
                Ok(Some(code)) => {
                    let (start, end) = span_range(expression.span);
                    self.replacements.push(Replacement { start, end, code });
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
        walk::walk_conditional_expression(self, expression);
    }

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

    fn visit_logical_expression(&mut self, expression: &LogicalExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.allow_flow_lowering && self.jsx_depth == 0 {
            match self.compiler.try_render_logical_show(expression) {
                Ok(Some(code)) => {
                    let (start, end) = span_range(expression.span);
                    self.replacements.push(Replacement { start, end, code });
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
        walk::walk_logical_expression(self, expression);
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
    uses_for: bool,
    uses_show: bool,
}

impl<'s> SsrCompiler<'s> {
    fn new(source: &'s str, source_type: SourceType) -> Self {
        Self {
            source,
            source_type,
            uses_for: false,
            uses_show: false,
        }
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

    fn render_nested_expression_span(
        &mut self,
        span: Span,
        allow_flow_lowering: bool,
    ) -> Result<String, String> {
        let nested_source = self.slice(span).to_string();
        let allocator = Allocator::default();
        let parsed = parse_expression(&allocator, &nested_source, self.source_type, "<expression>")?;
        let mut nested_compiler = SsrCompiler {
            source: &nested_source,
            source_type: self.source_type,
            uses_for: false,
            uses_show: false,
        };
        let mut collector = SsrExpressionCollector {
            allow_flow_lowering,
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
        self.uses_for |= nested_compiler.uses_for;
        self.uses_show |= nested_compiler.uses_show;
        Ok(transformed)
    }

    fn render_nested_jsx_expression(
        &mut self,
        expression: &JSXExpression<'_>,
        allow_flow_lowering: bool,
    ) -> Result<String, String> {
        self.render_nested_expression_span(expression.span(), allow_flow_lowering)
    }

    fn render_compiler_show(&mut self, when: String, children: String, fallback: String) -> String {
        self.uses_show = true;
        format!(
            "{SSR_JSX_DEV}({COMPILER_SHOW}, {{ \"when\": {when}, \"children\": {children}, \"fallback\": {fallback} }}, null, false, {{}})"
        )
    }

    fn render_compiler_for(&mut self, arr: String, callback: String) -> String {
        self.uses_for = true;
        format!(
            "{SSR_JSX_DEV}({COMPILER_FOR}, {{ \"arr\": {arr}, \"fn\": {callback} }}, null, false, {{}})"
        )
    }

    fn try_render_conditional_show(
        &mut self,
        expression: &ConditionalExpression<'_>,
    ) -> Result<Option<String>, String> {
        if !expression_contains_jsx(&expression.consequent)
            && !expression_contains_jsx(&expression.alternate)
        {
            return Ok(None);
        }

        let test = self.render_nested_expression_span(expression.test.span(), true)?;
        let consequent = self.render_nested_expression_span(expression.consequent.span(), true)?;
        let alternate = self.render_nested_expression_span(expression.alternate.span(), true)?;
        Ok(Some(self.render_compiler_show(
            test,
            render_lazy_branch_expression(&consequent),
            render_lazy_branch_expression(&alternate),
        )))
    }

    fn try_render_logical_show(
        &mut self,
        expression: &LogicalExpression<'_>,
    ) -> Result<Option<String>, String> {
        match expression.operator {
            LogicalOperator::And => {
                if !expression_contains_jsx(&expression.right) {
                    return Ok(None);
                }

                let left = self.render_nested_expression_span(expression.left.span(), true)?;
                let right = self.render_nested_expression_span(expression.right.span(), true)?;
                Ok(Some(self.render_compiler_show(
                    left,
                    render_lazy_branch_expression(&right),
                    render_identity_branch(),
                )))
            }
            LogicalOperator::Or => {
                if !expression_contains_jsx(&expression.left)
                    && !expression_contains_jsx(&expression.right)
                {
                    return Ok(None);
                }

                let left = self.render_nested_expression_span(expression.left.span(), true)?;
                let right = self.render_nested_expression_span(expression.right.span(), true)?;
                Ok(Some(self.render_compiler_show(
                    left,
                    render_identity_branch(),
                    render_lazy_branch_expression(&right),
                )))
            }
            LogicalOperator::Coalesce => Ok(None),
        }
    }

    fn try_render_map_for(&mut self, expression: &CallExpression<'_>) -> Result<Option<String>, String> {
        let Some(member) = get_static_map_callee(expression) else {
            return Ok(None);
        };
        if expression.arguments.len() != 1 {
            return Ok(None);
        }

        let callback = match &expression.arguments[0] {
            oxc_ast::ast::Argument::ArrowFunctionExpression(callback) if is_direct_jsx_map_callback(callback) => callback,
            _ => return Ok(None),
        };

        let arr = self.render_nested_expression_span(member.object.span(), true)?;
        let compiled_callback = self.render_nested_expression_span(callback.span(), true)?;
        Ok(Some(self.render_compiler_for(arr, compiled_callback)))
    }

    fn render_expression_to_ssr_string(
        &mut self,
        expression: &Expression<'_>,
        allow_flow_lowering: bool,
    ) -> Result<String, String> {
        match unwrap_parenthesized_expression(expression) {
            Expression::JSXElement(element) => {
                if let Some(fast_path) = self.try_render_fast_path_element_string(element)? {
                    Ok(fast_path)
                } else {
                    Ok(format!(
                        "{SSR_RENDER_VALUE}({})",
                        self.render_root_element(element)?
                    ))
                }
            }
            Expression::JSXFragment(fragment) => {
                if let Some(fast_path) = self.try_render_fast_path_fragment_string(fragment)? {
                    Ok(fast_path)
                } else {
                    Ok(format!(
                        "{SSR_RENDER_VALUE}({})",
                        self.render_root_fragment(fragment)?
                    ))
                }
            }
            Expression::CallExpression(call) => {
                if let Some(map_string) = self.try_render_map_string(call, allow_flow_lowering)? {
                    Ok(map_string)
                } else {
                    Ok(format!(
                        "{SSR_RENDER_VALUE}({})",
                        self.render_nested_expression_span(expression.span(), allow_flow_lowering)?
                    ))
                }
            }
            _ => Ok(format!(
                "{SSR_RENDER_VALUE}({})",
                self.render_nested_expression_span(expression.span(), allow_flow_lowering)?
            )),
        }
    }

    fn try_render_map_string(
        &mut self,
        expression: &CallExpression<'_>,
        allow_flow_lowering: bool,
    ) -> Result<Option<String>, String> {
        let Some(member) = get_static_map_callee(expression) else {
            return Ok(None);
        };
        if expression.arguments.len() != 1 {
            return Ok(None);
        }

        let callback = match &expression.arguments[0] {
            oxc_ast::ast::Argument::ArrowFunctionExpression(callback) if is_direct_jsx_map_callback(callback) => callback,
            _ => return Ok(None),
        };

        let Some(body) = get_arrow_expression_body(callback) else {
            return Ok(None);
        };

        let arr = self.render_nested_expression_span(member.object.span(), allow_flow_lowering)?;
        let params = self.slice(callback.params.span).to_string();
        let body_string =
            self.render_expression_to_ssr_string(unwrap_parenthesized_expression(body), allow_flow_lowering)?;
        Ok(Some(format!("{SSR_RENDER_MAP}({arr}, {params} => {body_string})")))
    }

    fn render_jsx_expression(
        &mut self,
        expression: &JSXExpression<'_>,
        allow_flow_lowering: bool,
    ) -> Result<String, String> {
        match expression {
            JSXExpression::EmptyExpression(_) => Ok(String::new()),
            JSXExpression::JSXElement(element) => self.render_root_element(element),
            JSXExpression::JSXFragment(fragment) => self.render_root_fragment(fragment),
            _ => self.render_nested_jsx_expression(expression, allow_flow_lowering),
        }
    }

    fn render_root_element(&mut self, element: &JSXElement<'_>) -> Result<String, String> {
        if let Some(fast_path) = self.try_render_fast_path_element_string(element)? {
            return Ok(format!("{SSR_RAW}({fast_path})"));
        }
        self.render_generic_element(element)
    }

    fn render_root_fragment(&mut self, fragment: &JSXFragment<'_>) -> Result<String, String> {
        if let Some(fast_path) = self.try_render_fast_path_fragment_string(fragment)? {
            return Ok(format!("{SSR_RAW}({fast_path})"));
        }
        let children = self.render_children_array(&fragment.children, true)?;
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
                            let expression = self.render_jsx_expression(&container.expression, false)?;
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

        let children_array = self.render_children_array(children, false)?;
        props.push(format!("\"children\": [{}]", children_array.join(", ")));

        Ok((format!("{{ {} }}", props.join(", ")), key))
    }

    fn render_children_array(
        &mut self,
        children: &oxc_allocator::Vec<'_, JSXChild<'_>>,
        allow_flow_lowering: bool,
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
                    output.push(self.render_jsx_expression(
                        &container.expression,
                        allow_flow_lowering,
                    )?);
                }
                JSXChild::Element(element) => output.push(self.render_root_element(element)?),
                JSXChild::Fragment(fragment) => {
                    output.extend(self.render_children_array(&fragment.children, allow_flow_lowering)?)
                }
                JSXChild::Spread(_) => {}
            }
        }
        Ok(output)
    }

    fn try_render_fast_path_element_string(
        &mut self,
        element: &JSXElement<'_>,
    ) -> Result<Option<String>, String> {
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
            if attr_name == "key" {
                continue;
            }
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
                    let expression = self.render_jsx_expression(&container.expression, true)?;
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
                        values.push(format!(
                            "{SSR_RENDER_ATTR}({}, {expression})",
                            js_string(&attr_name)
                        ));
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

        Ok(Some(render_ssr_string_expression(&strings, &values)))
    }

    fn try_render_fast_path_fragment_string(
        &mut self,
        fragment: &JSXFragment<'_>,
    ) -> Result<Option<String>, String> {
        let mut strings = vec![String::new()];
        let mut values = Vec::new();
        for child in &fragment.children {
            if !self.append_fast_child(child, &mut strings, &mut values)? {
                return Ok(None);
            }
        }
        Ok(Some(render_ssr_string_expression(&strings, &values)))
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
                if let Expression::CallExpression(call) = container.expression.to_expression() {
                    if let Some(map_string) = self.try_render_map_string(call, true)? {
                        values.push(map_string);
                        strings.push(String::new());
                        return Ok(true);
                    }
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
                    values.push(format!(
                        "{SSR_RENDER_VALUE}({})",
                        self.render_jsx_expression(&container.expression, true)?
                    ));
                    strings.push(String::new());
                }
                Ok(true)
            }
            JSXChild::Element(element) => {
                if let Some(fast_path) = self.try_render_fast_path_element_string(element)? {
                    values.push(fast_path);
                } else {
                    values.push(format!(
                        "{SSR_RENDER_VALUE}({})",
                        self.render_generic_element(element)?
                    ));
                }
                strings.push(String::new());
                Ok(true)
            }
            JSXChild::Fragment(fragment) => {
                if let Some(fast_path) = self.try_render_fast_path_fragment_string(fragment)? {
                    values.push(fast_path);
                    strings.push(String::new());
                    return Ok(true);
                }
                values.push(format!(
                    "{SSR_RENDER_VALUE}({})",
                    self.render_root_fragment(fragment)?
                ));
                strings.push(String::new());
                Ok(true)
            }
            JSXChild::Spread(_) => Ok(false),
        }
    }
}

fn render_ssr_string_expression(strings: &[String], values: &[String]) -> String {
    let mut parts = Vec::new();
    for (index, string_part) in strings.iter().enumerate() {
        if !string_part.is_empty() {
            parts.push(js_string(string_part));
        }
        if let Some(value_part) = values.get(index) {
            parts.push(value_part.clone());
        }
    }
    if parts.is_empty() {
        js_string("")
    } else {
        parts.join(" + ")
    }
}

struct SsrRootCollector<'c, 's> {
    compiler: &'c mut SsrCompiler<'s>,
    jsx_depth: usize,
    replacements: Vec<Replacement>,
}

struct SsrExpressionCollector<'c, 's> {
    allow_flow_lowering: bool,
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
    fn visit_call_expression(&mut self, expression: &CallExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.allow_flow_lowering && self.jsx_depth == 0 {
            match self.compiler.try_render_map_for(expression) {
                Ok(Some(code)) => {
                    let (start, end) = span_range(expression.span);
                    self.replacements.push(Replacement { start, end, code });
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
        walk::walk_call_expression(self, expression);
    }

    fn visit_conditional_expression(&mut self, expression: &ConditionalExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.allow_flow_lowering && self.jsx_depth == 0 {
            match self.compiler.try_render_conditional_show(expression) {
                Ok(Some(code)) => {
                    let (start, end) = span_range(expression.span);
                    self.replacements.push(Replacement { start, end, code });
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
        walk::walk_conditional_expression(self, expression);
    }

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

    fn visit_logical_expression(&mut self, expression: &LogicalExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        if self.allow_flow_lowering && self.jsx_depth == 0 {
            match self.compiler.try_render_logical_show(expression) {
                Ok(Some(code)) => {
                    let (start, end) = span_range(expression.span);
                    self.replacements.push(Replacement { start, end, code });
                    return;
                }
                Ok(None) => {}
                Err(error) => {
                    self.error = Some(error);
                    return;
                }
            }
        }
        walk::walk_logical_expression(self, expression);
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

fn component_expression_span(expression: &Expression<'_>) -> Option<Span> {
    match expression {
        Expression::ArrowFunctionExpression(function) => Some(function.span),
        Expression::FunctionExpression(function) => Some(function.span),
        Expression::ParenthesizedExpression(expression) => {
            component_expression_span(&expression.expression)
        }
        _ => None,
    }
}

fn wrap_hot_components(source: &str, id: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let program = parse_program(&allocator, source, source_type_for(id), id)?;
    let mut collector = HmrCollector {
        export_default_depth: 0,
        replacements: Vec::new(),
        source,
    };
    collector.visit_program(&program);
    apply_replacements(source, &mut collector.replacements)
}

struct HmrCollector<'s> {
    export_default_depth: usize,
    replacements: Vec<Replacement>,
    source: &'s str,
}

impl<'s> HmrCollector<'s> {
    fn slice(&self, span: Span) -> &str {
        let (start, end) = span_range(span);
        &self.source[start..end]
    }

    fn push_component_replacement(&mut self, span: Span, name: String) {
        let original = self.slice(span);
        let code = format!(
            "{HMR_DEFINE_COMPONENT}({original}, {{ registry: {HMR_REGISTRY}, name: {name} }})"
        );
        let (start, end) = span_range(span);
        self.replacements.push(Replacement { start, end, code });
    }
}

impl<'a, 's> Visit<'a> for HmrCollector<'s> {
    fn visit_export_default_declaration(&mut self, declaration: &ExportDefaultDeclaration<'a>) {
        self.export_default_depth += 1;
        walk::walk_export_default_declaration(self, declaration);
        self.export_default_depth -= 1;

        let span = match &declaration.declaration {
            ExportDefaultDeclarationKind::ArrowFunctionExpression(function) => Some(function.span),
            ExportDefaultDeclarationKind::FunctionExpression(function)
            | ExportDefaultDeclarationKind::FunctionDeclaration(function) => Some(function.span),
            ExportDefaultDeclarationKind::ParenthesizedExpression(expression) => {
                component_expression_span(&expression.expression)
            }
            _ => None,
        };
        if let Some(span) = span {
            self.push_component_replacement(span, js_string("default"));
        }
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        walk::walk_variable_declarator(self, declarator);
        let oxc_ast::ast::BindingPatternKind::BindingIdentifier(identifier) = &declarator.id.kind else {
            return;
        };
        if !is_component_name(identifier.name.as_str()) {
            return;
        }
        let Some(init) = &declarator.init else {
            return;
        };
        let span = component_expression_span(init);
        if let Some(span) = span {
            self.push_component_replacement(span, js_string(identifier.name.as_str()));
        }
    }

    fn visit_call_expression(&mut self, expression: &CallExpression<'a>) {
        if let Expression::Identifier(identifier) = &expression.callee {
            if identifier.name.as_str() == "__eclipsaComponent" {
                let name = if self.export_default_depth > 0 { js_string("default") } else { "null".to_string() };
                self.push_component_replacement(expression.span, name);
                return;
            }
        }
        walk::walk_call_expression(self, expression);
    }
}
