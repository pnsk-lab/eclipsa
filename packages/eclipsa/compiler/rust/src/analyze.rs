use std::{
    cell::Cell,
    collections::{BTreeSet, HashMap, HashSet},
};

use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::{
    AstKind,
    ast::{
        Argument, ArrayExpressionElement, ArrowFunctionExpression, AssignmentExpression, AssignmentTarget, CallExpression,
        ExportDefaultDeclaration, ExportDefaultDeclarationKind, Expression, Function,
        ImportDeclarationSpecifier, JSXAttributeName, JSXElementName, JSXExpression,
        ObjectProperty, ObjectPropertyKind, Program, PropertyKind, ReturnStatement, Statement,
        TSType, TSTypeAnnotation, VariableDeclarationKind, VariableDeclarator,
    },
};
use oxc_ast_visit::{Visit, walk};
use oxc_semantic::{ScopeFlags, ScopeId, Semantic, SemanticBuilder, SymbolFlags, SymbolId};
use oxc_span::{GetSpan, Span};
use serde::Serialize;
use xxhash_rust::xxh32::xxh32;

use crate::{Replacement, apply_replacements, js_string, parse_program, source_type_for};

const INTERNAL_IMPORT: &str = "eclipsa/internal";
const EVENT_PROP_REGEX_PREFIX: &str = "on";
const DEPRECATED_EVENT_PROP_REGEX_SUFFIX: &str = "$";

const HELPER_ACTION: &str = "__eclipsaAction";
const HELPER_COMPONENT: &str = "__eclipsaComponent";
const HELPER_EVENT: &str = "__eclipsaEvent";
const HELPER_LAZY: &str = "__eclipsaLazy";
const HELPER_LOADER: &str = "__eclipsaLoader";
const HELPER_WATCH: &str = "__eclipsaWatch";
const HELPER_SIGNAL_META: &str = "getSignalMeta";

const INTERNAL_HELPERS: [&str; 7] = [
    HELPER_ACTION,
    HELPER_COMPONENT,
    HELPER_EVENT,
    HELPER_LAZY,
    HELPER_LOADER,
    HELPER_WATCH,
    HELPER_SIGNAL_META,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct SpanKey {
    start: u32,
    end: u32,
}

impl SpanKey {
    fn from_span(span: Span) -> Self {
        Self { start: span.start, end: span.end }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
#[napi(string_enum = "lowercase")]
pub enum SymbolKind {
    Action,
    Component,
    Event,
    Lazy,
    Loader,
    Watch,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct SymbolRef {
    pub file_path: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ResumeSymbol {
    pub captures: Vec<String>,
    pub code: String,
    pub file_path: String,
    pub id: String,
    pub kind: SymbolKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ResumeHmrSymbolEntry {
    pub captures: Vec<String>,
    pub hmr_key: String,
    pub id: String,
    pub kind: SymbolKind,
    pub owner_component_key: Option<String>,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ResumeHmrComponentEntry {
    pub captures: Vec<String>,
    pub hmr_key: String,
    pub id: String,
    pub local_symbol_keys: Vec<String>,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ResumeHmrManifest {
    pub components: Vec<(String, ResumeHmrComponentEntry)>,
    pub symbols: Vec<(String, ResumeHmrSymbolEntry)>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct AnalyzeResponse {
    pub actions: Vec<(String, SymbolRef)>,
    pub code: String,
    pub hmr_manifest: ResumeHmrManifest,
    pub loaders: Vec<(String, SymbolRef)>,
    pub symbols: Vec<(String, ResumeSymbol)>,
}

#[derive(Debug)]
struct ImportBindings {
    action_identifier: Option<String>,
    atom_identifier: Option<String>,
    deprecated_action_identifier: Option<String>,
    deprecated_lazy_identifier: Option<String>,
    deprecated_loader_identifier: Option<String>,
    loader_identifier: Option<String>,
    react_island_identifier: Option<String>,
    signal_identifier: Option<String>,
    vue_island_identifier: Option<String>,
    visible_identifier: Option<String>,
    watch_identifier: Option<String>,
}

#[derive(Debug, Clone)]
struct ComponentInfo {
    hmr_key: String,
    local_symbol_keys: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExternalFactoryKind {
    React,
    Vue,
}

impl ExternalFactoryKind {
    fn as_runtime_kind(self) -> &'static str {
        match self {
            ExternalFactoryKind::React => "react",
            ExternalFactoryKind::Vue => "vue",
        }
    }
}

#[derive(Debug, Clone)]
struct FunctionContext {
    span_key: SpanKey,
}

#[derive(Debug, Clone)]
struct SymbolBuild {
    captures: Vec<String>,
    code: String,
    signature_code: String,
}

#[derive(Debug, Clone)]
struct LocalDefinition {
    kind: Option<VariableDeclarationKind>,
    span: Span,
}

#[derive(Debug, Clone)]
struct CollectedDependencies {
    captures: Vec<String>,
    import_spans: Vec<Span>,
    local_definitions: Vec<LocalDefinition>,
}

#[derive(Debug, Clone, Copy)]
enum NodeMarker {
    AssignmentExpression(Option<&'static str>),
    ExportDefaultDeclaration,
    Other,
    VariableDeclarator(Option<&'static str>),
}

fn source_text(source: &str, span: Span) -> &str {
    &source[span.start as usize..span.end as usize]
}

fn variable_declaration_kind_source(kind: VariableDeclarationKind) -> &'static str {
    match kind {
        VariableDeclarationKind::Var => "var",
        VariableDeclarationKind::Let => "let",
        VariableDeclarationKind::Const => "const",
        VariableDeclarationKind::Using => "using",
        VariableDeclarationKind::AwaitUsing => "await using",
    }
}

fn create_symbol_id(file_path: &str, kind: &SymbolKind, code: &str) -> String {
    let kind_name = match kind {
        SymbolKind::Action => "action",
        SymbolKind::Component => "component",
        SymbolKind::Event => "event",
        SymbolKind::Lazy => "lazy",
        SymbolKind::Loader => "loader",
        SymbolKind::Watch => "watch",
    };
    base36(xxh32(format!("{file_path}:{kind_name}:{code}").as_bytes(), 0))
}

fn create_symbol_signature(kind: &SymbolKind, code: &str) -> String {
    let kind_name = match kind {
        SymbolKind::Action => "action",
        SymbolKind::Component => "component",
        SymbolKind::Event => "event",
        SymbolKind::Lazy => "lazy",
        SymbolKind::Loader => "loader",
        SymbolKind::Watch => "watch",
    };
    base36(xxh32(format!("{kind_name}:{code}").as_bytes(), 0))
}

fn base36(value: u32) -> String {
    if value == 0 {
        return "0".to_string();
    }
    let mut remaining = value as u64;
    let mut chars = Vec::new();
    while remaining > 0 {
        let digit = (remaining % 36) as u8;
        chars.push(if digit < 10 {
            (b'0' + digit) as char
        } else {
            (b'a' + (digit - 10)) as char
        });
        remaining /= 36;
    }
    chars.iter().rev().collect()
}

fn create_indexed_key(base: &str, count: usize) -> String {
    if count == 0 {
        base.to_string()
    } else {
        format!("{base}:{count}")
    }
}

fn to_event_name(prop_name: &str) -> Option<String> {
    if !prop_name.starts_with(EVENT_PROP_REGEX_PREFIX)
        || prop_name.ends_with(DEPRECATED_EVENT_PROP_REGEX_SUFFIX)
    {
        return None;
    }
    let middle = &prop_name[EVENT_PROP_REGEX_PREFIX.len()..];
    let mut chars = middle.chars();
    let first = chars.next()?;
    if !first.is_ascii_uppercase() {
        return None;
    }
    Some(format!("{}{}", first.to_ascii_lowercase(), chars.collect::<String>()))
}

fn get_jsx_attribute_name(name: &JSXAttributeName<'_>) -> String {
    match name {
        JSXAttributeName::Identifier(name) => name.name.as_str().to_string(),
        JSXAttributeName::NamespacedName(name) => {
            format!("{}:{}", name.namespace.name.as_str(), name.name.name.as_str())
        }
    }
}

fn imports_from_eclipsa(program: &Program<'_>) -> ImportBindings {
    let mut bindings = ImportBindings {
        action_identifier: None,
        atom_identifier: None,
        deprecated_action_identifier: None,
        deprecated_lazy_identifier: None,
        deprecated_loader_identifier: None,
        loader_identifier: None,
        react_island_identifier: None,
        signal_identifier: None,
        vue_island_identifier: None,
        visible_identifier: None,
        watch_identifier: None,
    };

    for statement in &program.body {
        let oxc_ast::ast::Statement::ImportDeclaration(import_decl) = statement else {
            continue;
        };
        let source = import_decl.source.value.as_str();
        let Some(specifiers) = &import_decl.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            let local = specifier.local.name.as_str().to_string();
            match source {
                "eclipsa" => match imported {
                    "action" => bindings.action_identifier = Some(local),
                    "action$" => bindings.deprecated_action_identifier = Some(local),
                    "$" => bindings.deprecated_lazy_identifier = Some(local),
                    "loader" => bindings.loader_identifier = Some(local),
                    "loader$" => bindings.deprecated_loader_identifier = Some(local),
                    "onVisible" => bindings.visible_identifier = Some(local),
                    "useSignal" => bindings.signal_identifier = Some(local),
                    "useWatch" => bindings.watch_identifier = Some(local),
                    _ => {}
                },
                "eclipsa/atom" => match imported {
                    "useAtom" => bindings.atom_identifier = Some(local),
                    _ => {}
                },
                "@eclipsa/react" => match imported {
                    "eclipsifyReact" => bindings.react_island_identifier = Some(local),
                    _ => {}
                },
                "@eclipsa/vue" => match imported {
                    "eclipsifyVue" => bindings.vue_island_identifier = Some(local),
                    _ => {}
                },
                _ => {}
            }
        }
    }

    bindings
}

fn is_function_argument(argument: &Argument<'_>) -> bool {
    matches!(argument, Argument::ArrowFunctionExpression(_) | Argument::FunctionExpression(_))
}

fn function_argument_span(argument: &Argument<'_>) -> Option<Span> {
    match argument {
        Argument::ArrowFunctionExpression(expression) => Some(expression.span),
        Argument::FunctionExpression(expression) => Some(expression.span),
        _ => None,
    }
}

fn function_argument_scope(argument: &Argument<'_>) -> Option<ScopeId> {
    match argument {
        Argument::ArrowFunctionExpression(expression) => Some(expression.scope_id()),
        Argument::FunctionExpression(expression) => Some(expression.scope_id()),
        _ => None,
    }
}

fn function_expression_span(expression: &Expression<'_>) -> Option<Span> {
    match expression {
        Expression::ArrowFunctionExpression(function) => Some(function.span),
        Expression::FunctionExpression(function) => Some(function.span),
        Expression::ParenthesizedExpression(expression) => {
            function_expression_span(&expression.expression)
        }
        _ => None,
    }
}

fn function_expression_scope(expression: &Expression<'_>) -> Option<ScopeId> {
    match expression {
        Expression::ArrowFunctionExpression(function) => Some(function.scope_id()),
        Expression::FunctionExpression(function) => Some(function.scope_id()),
        Expression::ParenthesizedExpression(expression) => {
            function_expression_scope(&expression.expression)
        }
        _ => None,
    }
}

fn is_component_name(name: &str) -> bool {
    name.chars().next().is_some_and(|ch| {
        ch.to_ascii_lowercase() != ch || !ch.is_ascii_alphabetic()
    }) || name.contains('.')
}

fn is_hook_name(name: &str) -> bool {
    let Some(suffix) = name.strip_prefix("use") else {
        return false;
    };
    suffix.chars().next().is_some_and(|ch| {
        ch.to_ascii_lowercase() != ch || !ch.is_ascii_alphabetic()
    })
}

fn render_span_with_replacements(source: &str, span: Span, replacements: &[Replacement]) -> Result<String, String> {
    let mut nested = replacements
        .iter()
        .filter(|replacement| {
            replacement.start >= span.start as usize
                && replacement.end <= span.end as usize
                && !(replacement.start == span.start as usize && replacement.end == span.end as usize)
        })
        .cloned()
        .collect::<Vec<_>>();

    let base = source_text(source, span);
    for replacement in &mut nested {
        replacement.start -= span.start as usize;
        replacement.end -= span.start as usize;
    }
    apply_replacements(base, &mut nested)
}

fn inject_scope_parameter(function_source: &str, local_prefix: Option<&str>) -> Result<String, String> {
    let allocator = Allocator::default();
    let module = format!("export default {function_source};");
    let program = parse_program(
        &allocator,
        &module,
        source_type_for("symbol.tsx"),
        "symbol.tsx",
    )?;
    let Some(statement) = program.body.first() else {
        return Err("failed to build symbol module: missing export default statement".to_string());
    };
    let Statement::ExportDefaultDeclaration(declaration) = statement else {
        return Err("failed to build symbol module: expected export default statement".to_string());
    };

    let (params_span, body_replacement) = match &declaration.declaration {
        ExportDefaultDeclarationKind::ArrowFunctionExpression(function) => {
            let replacement = local_prefix.map(|prefix| {
                if function.expression {
                    let body_range = function.body.span.start as usize..function.body.span.end as usize;
                    Replacement {
                        start: body_range.start,
                        end: body_range.end,
                        code: format!("{{\n{prefix}\nreturn {};\n}}", &module[body_range]),
                    }
                } else {
                    let insertion = if let Some(last_directive) = function.body.directives.last() {
                        last_directive.span.end as usize
                    } else {
                        function.body.span.start as usize + 1
                    };
                    Replacement {
                        start: insertion,
                        end: insertion,
                        code: format!("\n{prefix}\n"),
                    }
                }
            });
            (function.params.span, replacement)
        }
        ExportDefaultDeclarationKind::FunctionExpression(function)
        | ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
            let body = function
                .body
                .as_ref()
                .ok_or_else(|| "failed to build symbol module: exported symbol must have a body".to_string())?;
            let replacement = local_prefix.map(|prefix| {
                let insertion = if let Some(last_directive) = body.directives.last() {
                    last_directive.span.end as usize
                } else {
                    body.span.start as usize + 1
                };
                Replacement {
                    start: insertion,
                    end: insertion,
                    code: format!("\n{prefix}\n"),
                }
            });
            (function.params.span, replacement)
        }
        _ => {
            return Err(
                "failed to build symbol module: exported symbol must be a function".to_string()
            );
        }
    };
    let params_range = params_span.start as usize..params_span.end as usize;
    let params_source = &module[params_range.clone()];
    let replacement = if params_source.starts_with('(') && params_source.ends_with(')') {
        let inner = &params_source[1..params_source.len().saturating_sub(1)];
        if inner.trim().is_empty() {
            "(__scope)".to_string()
        } else {
            format!("(__scope, {inner})")
        }
    } else {
        format!("(__scope, {params_source})")
    };

    let mut replacements = vec![Replacement {
        start: params_range.start,
        end: params_range.end,
        code: replacement,
    }];
    if let Some(body_replacement) = body_replacement {
        replacements.push(body_replacement);
    }

    apply_replacements(&module, &mut replacements)
}

fn props_expression_property(expression: &Expression<'_>, props_name: &str) -> Option<String> {
    let member = expression.get_member_expr()?;
    let Expression::Identifier(identifier) = member.object() else {
        return None;
    };
    if identifier.name.as_str() != props_name {
        return None;
    }
    member.static_property_name().map(ToString::to_string)
}

fn jsx_expression_property(expression: &JSXExpression<'_>, props_name: &str) -> Option<String> {
    match expression {
        JSXExpression::StaticMemberExpression(member) => {
            let Expression::Identifier(identifier) = &member.object else {
                return None;
            };
            if identifier.name.as_str() != props_name {
                return None;
            }
            Some(member.property.name.as_str().to_string())
        }
        JSXExpression::ComputedMemberExpression(member) => {
            let Expression::Identifier(identifier) = &member.object else {
                return None;
            };
            if identifier.name.as_str() != props_name {
                return None;
            }
            member.static_property_name().map(|name| name.as_str().to_string())
        }
        _ => None,
    }
}

struct ProjectionSlotCollector {
    direct_counts: HashMap<String, usize>,
    in_jsx_attribute: usize,
    props_name: String,
    total_counts: HashMap<String, usize>,
}

impl ProjectionSlotCollector {
    fn collect_arrow(function: &ArrowFunctionExpression<'_>) -> Result<Option<Vec<(String, usize)>>, String> {
        let Some(first_param) = function.params.items.first() else {
            return Ok(None);
        };
        let oxc_ast::ast::BindingPatternKind::BindingIdentifier(identifier) = &first_param.pattern.kind else {
            return Ok(None);
        };

        let mut collector = Self {
            direct_counts: HashMap::new(),
            in_jsx_attribute: 0,
            props_name: identifier.name.as_str().to_string(),
            total_counts: HashMap::new(),
        };
        collector.visit_arrow_function_expression(function);
        collector.finalize()
    }

    fn collect_function(function: &Function<'_>) -> Result<Option<Vec<(String, usize)>>, String> {
        let Some(first_param) = function.params.items.first() else {
            return Ok(None);
        };
        let oxc_ast::ast::BindingPatternKind::BindingIdentifier(identifier) = &first_param.pattern.kind else {
            return Ok(None);
        };

        let mut collector = Self {
            direct_counts: HashMap::new(),
            in_jsx_attribute: 0,
            props_name: identifier.name.as_str().to_string(),
            total_counts: HashMap::new(),
        };
        collector.visit_function(function, ScopeFlags::empty());
        collector.finalize()
    }

    fn finalize(self) -> Result<Option<Vec<(String, usize)>>, String> {
        if self.direct_counts.is_empty() {
            return Ok(None);
        }

        for property in self.direct_counts.keys() {
            let direct = self.direct_counts[property];
            let total = self.total_counts.get(property).copied().unwrap_or_default();
            if total > direct {
                return Err(format!(
                    "Projection slot prop \"{}\" must be rendered directly as {{{}.{}}} inside JSX.",
                    property, self.props_name, property
                ));
            }
        }

        let mut entries = self.direct_counts.into_iter().collect::<Vec<_>>();
        entries.sort_by(|left, right| left.0.cmp(&right.0));
        Ok(Some(entries))
    }
}

impl<'a> Visit<'a> for ProjectionSlotCollector {
    fn visit_expression(&mut self, expression: &Expression<'a>) {
        if let Some(property) = props_expression_property(expression, &self.props_name) {
            *self.total_counts.entry(property).or_insert(0) += 1;
        }
        walk::walk_expression(self, expression);
    }

    fn visit_jsx_attribute(&mut self, attribute: &oxc_ast::ast::JSXAttribute<'a>) {
        self.in_jsx_attribute += 1;
        walk::walk_jsx_attribute(self, attribute);
        self.in_jsx_attribute -= 1;
    }

    fn visit_jsx_expression_container(
        &mut self,
        container: &oxc_ast::ast::JSXExpressionContainer<'a>,
    ) {
        if self.in_jsx_attribute == 0 {
            if let Some(property) = jsx_expression_property(&container.expression, &self.props_name)
            {
                *self.direct_counts.entry(property).or_insert(0) += 1;
            }
        }
        walk::walk_jsx_expression_container(self, container);
    }
}

fn collect_projection_slots_from_expression(expression: &Expression<'_>) -> Result<Option<Vec<(String, usize)>>, String> {
    match expression {
        Expression::ArrowFunctionExpression(function) => ProjectionSlotCollector::collect_arrow(function),
        Expression::FunctionExpression(function) => ProjectionSlotCollector::collect_function(function),
        Expression::ParenthesizedExpression(expression) => {
            collect_projection_slots_from_expression(&expression.expression)
        }
        _ => Ok(None),
    }
}

fn collect_projection_slots_from_export_default(
    declaration: &ExportDefaultDeclarationKind<'_>,
) -> Result<Option<Vec<(String, usize)>>, String> {
    match declaration {
        ExportDefaultDeclarationKind::ArrowFunctionExpression(function) => {
            ProjectionSlotCollector::collect_arrow(function)
        }
        ExportDefaultDeclarationKind::FunctionExpression(function)
        | ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
            ProjectionSlotCollector::collect_function(function)
        }
        ExportDefaultDeclarationKind::ParenthesizedExpression(expression) => {
            collect_projection_slots_from_expression(&expression.expression)
        }
        _ => Ok(None),
    }
}

fn collect_projection_slots_from_argument(argument: &Argument<'_>) -> Result<Option<Vec<(String, usize)>>, String> {
    match argument {
        Argument::ArrowFunctionExpression(function) => ProjectionSlotCollector::collect_arrow(function),
        Argument::FunctionExpression(function) => ProjectionSlotCollector::collect_function(function),
        _ => Ok(None),
    }
}

fn is_supported_external_component_target_expression(expression: &Expression<'_>) -> bool {
    match expression {
        Expression::Identifier(_) | Expression::StaticMemberExpression(_) => true,
        Expression::ParenthesizedExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        Expression::TSAsExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        Expression::TSSatisfiesExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        Expression::TSNonNullExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        _ => false,
    }
}

fn is_supported_external_component_target(argument: &Argument<'_>) -> bool {
    match argument {
        Argument::Identifier(_) | Argument::StaticMemberExpression(_) => true,
        Argument::ParenthesizedExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        Argument::TSAsExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        Argument::TSSatisfiesExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        Argument::TSNonNullExpression(expression) => {
            is_supported_external_component_target_expression(&expression.expression)
        }
        _ => false,
    }
}

fn collect_external_projection_slots(
    expression: &CallExpression<'_>,
) -> Result<Vec<(String, usize)>, String> {
    let Some(options) = expression.arguments.get(1) else {
        return Ok(vec![("children".to_string(), 1)]);
    };

    let Argument::ObjectExpression(object) = options else {
        return Err("eclipsify*() options must be a static object literal when provided.".to_string());
    };

    for property in &object.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else {
            return Err("eclipsify*() options must not use spreads.".to_string());
        };
        if property.kind != PropertyKind::Init || property.computed || property.method {
            return Err("eclipsify*() options must use plain object properties.".to_string());
        }
        let Some(property_name) = property
            .key
            .static_name()
            .map(|name| name.to_string()) else {
            return Err("eclipsify*() options keys must be static.".to_string());
        };
        if property_name != "slots" {
            return Err(format!("Unsupported eclipsify*() option \"{property_name}\"."));
        }

        let Expression::ArrayExpression(array) = &property.value else {
            return Err("eclipsify*() slots must be a static string array.".to_string());
        };

        let mut entries = Vec::new();
        for element in &array.elements {
            match element {
                ArrayExpressionElement::Elision(_) => {
                    return Err("eclipsify*() slots arrays cannot be sparse.".to_string());
                }
                ArrayExpressionElement::SpreadElement(_) => {
                    return Err("eclipsify*() slots must be string literals.".to_string());
                }
                ArrayExpressionElement::StringLiteral(literal) => {
                    entries.push((literal.value.as_str().to_string(), 1));
                }
                _ => {
                    return Err("eclipsify*() slots must be string literals.".to_string());
                }
            }
        }
        if entries.is_empty() {
            return Ok(vec![]);
        }
        return Ok(entries);
    }

    Ok(vec![("children".to_string(), 1)])
}

struct CaptureCollector<'a, 's> {
    capture_indices: HashMap<String, usize>,
    capture_outer_scope_bindings: bool,
    current_scope_stack: Vec<ScopeId>,
    error: Option<String>,
    function_scope: ScopeId,
    import_spans: HashSet<SpanKey>,
    local_definitions: HashMap<SpanKey, LocalDefinition>,
    program: &'a Program<'a>,
    semantic: &'s Semantic<'a>,
}

impl<'a, 's> CaptureCollector<'a, 's> {
    fn collect(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        _source: &'s str,
        root_scope: ScopeId,
        argument: &Argument<'a>,
    ) -> Result<CollectedDependencies, String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            capture_outer_scope_bindings: false,
            current_scope_stack: Vec::new(),
            error: None,
            function_scope: root_scope,
            import_spans: HashSet::new(),
            local_definitions: HashMap::new(),
            program,
            semantic,
        };
        collector.visit_argument(argument);
        collector.finish()
    }

    fn collect_jsx_expression(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        _source: &'s str,
        root_scope: ScopeId,
        expression: &JSXExpression<'a>,
    ) -> Result<CollectedDependencies, String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            capture_outer_scope_bindings: false,
            current_scope_stack: Vec::new(),
            error: None,
            function_scope: root_scope,
            import_spans: HashSet::new(),
            local_definitions: HashMap::new(),
            program,
            semantic,
        };
        collector.visit_jsx_expression(expression);
        collector.finish()
    }

    fn collect_expression(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        root_scope: ScopeId,
        expression: &Expression<'a>,
    ) -> Result<CollectedDependencies, String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            capture_outer_scope_bindings: false,
            current_scope_stack: Vec::new(),
            error: None,
            function_scope: root_scope,
            import_spans: HashSet::new(),
            local_definitions: HashMap::new(),
            program,
            semantic,
        };
        collector.visit_expression(expression);
        collector.finish()
    }

    fn collect_module_call_expression(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        expression: &CallExpression<'a>,
    ) -> Result<CollectedDependencies, String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            capture_outer_scope_bindings: true,
            current_scope_stack: Vec::new(),
            error: None,
            function_scope: program.scope_id(),
            import_spans: HashSet::new(),
            local_definitions: HashMap::new(),
            program,
            semantic,
        };
        collector.visit_call_expression(expression);
        collector.finish()
    }

    fn collect_arrow(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        function: &ArrowFunctionExpression<'a>,
    ) -> Result<CollectedDependencies, String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            capture_outer_scope_bindings: false,
            current_scope_stack: Vec::new(),
            error: None,
            function_scope: function.scope_id(),
            import_spans: HashSet::new(),
            local_definitions: HashMap::new(),
            program,
            semantic,
        };
        collector.visit_arrow_function_expression(function);
        collector.finish()
    }

    fn collect_function(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        function: &Function<'a>,
    ) -> Result<CollectedDependencies, String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            capture_outer_scope_bindings: false,
            current_scope_stack: Vec::new(),
            error: None,
            function_scope: function.scope_id(),
            import_spans: HashSet::new(),
            local_definitions: HashMap::new(),
            program,
            semantic,
        };
        collector.visit_function(function, ScopeFlags::empty());
        collector.finish()
    }

    fn current_scope(&self) -> ScopeId {
        *self.current_scope_stack.last().unwrap_or(&self.program.scope_id())
    }

    fn finish(self) -> Result<CollectedDependencies, String> {
        if let Some(error) = self.error {
            return Err(error);
        }

        let mut captures = self.capture_indices.into_iter().collect::<Vec<_>>();
        captures.sort_by_key(|(_, index)| *index);
        let mut import_spans = self
            .import_spans
            .into_iter()
            .map(|span| Span::new(span.start, span.end))
            .collect::<Vec<_>>();
        import_spans.sort_by_key(|span| span.start);
        let mut local_definitions = self.local_definitions.into_iter().collect::<Vec<_>>();
        local_definitions.sort_by_key(|(span, _)| (span.start, span.end));

        Ok(CollectedDependencies {
            captures: captures.into_iter().map(|(name, _)| name).collect(),
            import_spans,
            local_definitions: local_definitions
                .into_iter()
                .map(|(_, definition)| definition)
                .collect(),
        })
    }

    fn fail(&mut self, message: impl Into<String>) {
        if self.error.is_none() {
            self.error = Some(message.into());
        }
    }

    fn is_reachable_from_function_scope(&self, symbol_scope: ScopeId) -> bool {
        if self.capture_outer_scope_bindings {
            return false;
        }
        self.semantic
            .scoping()
            .scope_ancestors(symbol_scope)
            .any(|scope_id| scope_id == self.function_scope)
    }

    fn is_local_to_current_traversal(&self, symbol_scope: ScopeId) -> bool {
        if symbol_scope == self.program.scope_id() {
            return false;
        }
        self.current_scope_stack.iter().copied().any(|scope| {
            self.semantic
                .scoping()
                .scope_ancestors(symbol_scope)
                .any(|ancestor| ancestor == scope)
        })
    }

    fn add_capture(&mut self, name: &str) {
        if self.capture_indices.contains_key(name) {
            return;
        }
        let index = self.capture_indices.len();
        self.capture_indices.insert(name.to_string(), index);
    }

    fn add_import_from_symbol(&mut self, symbol_id: SymbolId) {
        let declaration = self.semantic.symbol_declaration(symbol_id);
        let nodes = self.semantic.nodes();
        for ancestor in nodes.ancestors(declaration.id()) {
            if let AstKind::ImportDeclaration(import_decl) = ancestor.kind() {
                self.import_spans.insert(SpanKey::from_span(import_decl.span));
                break;
            }
        }
    }

    fn can_inline_symbol(&self, flags: SymbolFlags, symbol_id: SymbolId) -> bool {
        if self.semantic.symbol_scope(symbol_id) != self.program.scope_id() {
            return false;
        }
        if flags.is_function() || flags.is_class() {
            return true;
        }
        if !flags.is_variable() || !flags.is_const_variable() {
            return false;
        }
        let declaration = self.semantic.symbol_declaration(symbol_id);
        let AstKind::VariableDeclarator(variable) = declaration.kind() else {
            return false;
        };
        let Some(init) = &variable.init else {
            return false;
        };
        matches!(
            init,
            Expression::ArrowFunctionExpression(_)
                | Expression::FunctionExpression(_)
                | Expression::ClassExpression(_)
        )
    }

    fn can_inline_outer_scope_symbol(&self, flags: SymbolFlags, symbol_id: SymbolId) -> bool {
        self.capture_outer_scope_bindings
            && self.semantic.symbol_scope(symbol_id) == self.program.scope_id()
            && (flags.is_function()
                || flags.is_class()
                || (flags.is_variable() && flags.is_const_variable()))
    }

    fn add_local_definition_from_symbol(&mut self, symbol_id: SymbolId) {
        let declaration = self.semantic.symbol_declaration(symbol_id);
        match declaration.kind() {
            AstKind::VariableDeclarator(variable) => {
                let key = SpanKey::from_span(variable.span);
                if self.local_definitions.contains_key(&key) {
                    return;
                }
                self.local_definitions.insert(
                    key,
                    LocalDefinition {
                        kind: Some(variable.kind),
                        span: variable.span,
                    },
                );
                walk::walk_variable_declarator(self, variable);
            }
            AstKind::Function(function) => {
                let key = SpanKey::from_span(function.span);
                if self.local_definitions.contains_key(&key) {
                    return;
                }
                self.local_definitions.insert(
                    key,
                    LocalDefinition {
                        kind: None,
                        span: function.span,
                    },
                );
                self.visit_function(function, ScopeFlags::empty());
            }
            AstKind::Class(class) => {
                let key = SpanKey::from_span(class.span);
                if self.local_definitions.contains_key(&key) {
                    return;
                }
                self.local_definitions.insert(
                    key,
                    LocalDefinition {
                        kind: None,
                        span: class.span,
                    },
                );
                walk::walk_class(self, class);
            }
            _ => {}
        }
    }

    fn validate_capture(&self, name: &str, flags: SymbolFlags, symbol_id: SymbolId) -> Result<(), String> {
        if flags.is_import() {
            return Ok(());
        }
        if flags.is_function() || flags.is_class() {
            return Err(format!(
                "Unsupported resumable capture \"{name}\". Capture a lazy symbol or JSON value instead."
            ));
        }
        if flags.is_variable() && !flags.is_const_variable() {
            return Err(format!(
                "Unsupported resumable capture \"{name}\". Mutable locals are not resumable. Read the needed value into a const before the resumable callback (for example, `const value = props.foo`) or store runtime state in a signal/atom."
            ));
        }
        let declaration = self.semantic.symbol_declaration(symbol_id);
        if let AstKind::VariableDeclarator(variable) = declaration.kind() {
            if let Some(init) = &variable.init {
                if matches!(
                    init,
                    Expression::ArrowFunctionExpression(_)
                        | Expression::FunctionExpression(_)
                        | Expression::ClassExpression(_)
                ) {
                    let local_function = match init {
                        Expression::ArrowFunctionExpression(_) => {
                            self.semantic.symbol_scope(symbol_id) != self.program.scope_id()
                        }
                        Expression::FunctionExpression(_) => {
                            self.semantic.symbol_scope(symbol_id) != self.program.scope_id()
                        }
                        _ => false,
                    };
                    if local_function {
                        return Ok(());
                    }
                    return Err(format!(
                        "Unsupported resumable capture \"{name}\". Functions and classes must not be captured directly."
                    ));
                }
            }
        }
        Ok(())
    }
}

impl<'a, 's> Visit<'a> for CaptureCollector<'a, 's> {
    fn enter_scope(&mut self, _flags: ScopeFlags, scope_id: &Cell<Option<ScopeId>>) {
        self.current_scope_stack.push(scope_id.get().unwrap());
    }

    fn leave_scope(&mut self) {
        self.current_scope_stack.pop();
    }

    fn visit_identifier_reference(&mut self, identifier: &oxc_ast::ast::IdentifierReference<'a>) {
        let reference = self.semantic.scoping().get_reference(identifier.reference_id());
        let Some(symbol_id) = reference.symbol_id() else {
            return;
        };
        let flags = self.semantic.scoping().symbol_flags(symbol_id);
        if flags.is_import() {
            self.add_import_from_symbol(symbol_id);
            return;
        }
        let symbol_scope = self.semantic.symbol_scope(symbol_id);
        if self.is_local_to_current_traversal(symbol_scope)
            || self.is_reachable_from_function_scope(symbol_scope)
        {
            return;
        }
        if self.can_inline_outer_scope_symbol(flags, symbol_id) {
            self.add_local_definition_from_symbol(symbol_id);
            return;
        }
        if self.can_inline_symbol(flags, symbol_id) {
            self.add_local_definition_from_symbol(symbol_id);
            return;
        }
        if let Err(error) = self.validate_capture(identifier.name.as_str(), flags, symbol_id) {
            self.fail(error);
            return;
        }
        self.add_capture(identifier.name.as_str());
    }

    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}

    fn visit_ts_type(&mut self, _it: &TSType<'a>) {}

    fn visit_jsx_element_name(&mut self, name: &JSXElementName<'a>) {
        if let JSXElementName::IdentifierReference(reference) = name {
            let symbol_id = self
                .semantic
                .scoping()
                .find_binding(self.current_scope(), reference.name.as_str());
            let Some(symbol_id) = symbol_id else {
                return;
            };
            let flags = self.semantic.scoping().symbol_flags(symbol_id);
            if flags.is_import() {
                self.add_import_from_symbol(symbol_id);
                return;
            }
            let symbol_scope = self.semantic.symbol_scope(symbol_id);
            if self.is_local_to_current_traversal(symbol_scope)
                || self.is_reachable_from_function_scope(symbol_scope)
            {
                return;
            }
            if flags.is_variable()
                && flags.is_const_variable()
                && self.semantic.symbol_scope(symbol_id) == self.program.scope_id()
            {
                self.add_local_definition_from_symbol(symbol_id);
                return;
            }
            if self.can_inline_outer_scope_symbol(flags, symbol_id) {
                self.add_local_definition_from_symbol(symbol_id);
                return;
            }
            if self.can_inline_symbol(flags, symbol_id) {
                self.add_local_definition_from_symbol(symbol_id);
                return;
            }
            self.fail(format!(
                "Unsupported resumable component reference \"{}\". Import the component from a module.",
                reference.name.as_str()
            ));
            return;
        }
        walk::walk_jsx_element_name(self, name);
    }
}


pub(crate) fn transform_analyze(source: &str, id: &str) -> Result<AnalyzeResponse, String> {
    let allocator = Allocator::default();
    let program = parse_program(&allocator, source, source_type_for(id), id)?;
    let semantic_builder = SemanticBuilder::new().with_check_syntax_error(true).build(&program);
    if !semantic_builder.errors.is_empty() {
        let message = semantic_builder
            .errors
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join("\n");
        return Err(message);
    }
    let semantic = semantic_builder.semantic;
    let imports = imports_from_eclipsa(&program);
    let mut visitor = AnalyzeVisitor::new(source, id, &program, &semantic, imports);
    visitor.visit_program(&program);
    visitor.finish()
}

struct AnalyzeVisitor<'a, 's> {
    actions: Vec<(String, SymbolRef)>,
    component_counts: HashMap<String, usize>,
    component_info_by_span: HashMap<SpanKey, ComponentInfo>,
    current_functions: Vec<FunctionContext>,
    current_scope_stack: Vec<ScopeId>,
    error: Option<String>,
    hmr_components: Vec<(String, ResumeHmrComponentEntry)>,
    hmr_key_by_symbol_id: HashMap<String, String>,
    hmr_symbols: Vec<(String, ResumeHmrSymbolEntry)>,
    hook_functions: HashSet<SpanKey>,
    imports: ImportBindings,
    lazy_symbol_ids_by_span: HashMap<SpanKey, String>,
    file_id: String,
    loaders: Vec<(String, SymbolRef)>,
    node_stack: Vec<NodeMarker>,
    owner_symbol_counts: HashMap<String, usize>,
    program: &'a Program<'a>,
    replacements: Vec<Replacement>,
    semantic: &'s Semantic<'a>,
    source: &'s str,
    symbols: Vec<(String, ResumeSymbol)>,
    used_helpers: BTreeSet<String>,
}

impl<'a, 's> AnalyzeVisitor<'a, 's> {
    fn new(
        source: &'s str,
        file_id: &str,
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        imports: ImportBindings,
    ) -> Self {
        Self {
            actions: Vec::new(),
            component_counts: HashMap::new(),
            component_info_by_span: HashMap::new(),
            current_functions: Vec::new(),
            current_scope_stack: Vec::new(),
            error: None,
            hmr_components: Vec::new(),
            hmr_key_by_symbol_id: HashMap::new(),
            hmr_symbols: Vec::new(),
            hook_functions: HashSet::new(),
            imports,
            lazy_symbol_ids_by_span: HashMap::new(),
            file_id: file_id.to_string(),
            loaders: Vec::new(),
            node_stack: Vec::new(),
            owner_symbol_counts: HashMap::new(),
            program,
            replacements: Vec::new(),
            semantic,
            source,
            symbols: Vec::new(),
            used_helpers: BTreeSet::new(),
        }
    }

    fn finish(mut self) -> Result<AnalyzeResponse, String> {
        if let Some(error) = self.error.take() {
            return Err(error);
        }
        let mut code = apply_replacements(self.source, &mut self.replacements)?;
        if !self.used_helpers.is_empty() {
            let helper_import = format!(
                "import {{ {} }} from \"{}\";\n",
                self.used_helpers.iter().cloned().collect::<Vec<_>>().join(", "),
                INTERNAL_IMPORT
            );
            code = format!("{helper_import}{code}");
        }

        Ok(AnalyzeResponse {
            actions: self.actions,
            code,
            hmr_manifest: ResumeHmrManifest {
                components: self.hmr_components,
                symbols: self.hmr_symbols,
            },
            loaders: self.loaders,
            symbols: self.symbols,
        })
    }

    fn current_owner_component_key(&self) -> Option<String> {
        for function in self.current_functions.iter().rev() {
            if let Some(info) = self.component_info_by_span.get(&function.span_key) {
                return Some(info.hmr_key.clone());
            }
        }
        None
    }

    fn current_function_is_component_or_hook(&self) -> bool {
        self.current_functions.last().is_some_and(|context| {
            self.component_info_by_span.contains_key(&context.span_key)
                || self.hook_functions.contains(&context.span_key)
        })
    }

    fn push_owner_local_symbol_key(&mut self, symbol_key: &str) {
        for function in self.current_functions.iter().rev() {
            if let Some(info) = self.component_info_by_span.get_mut(&function.span_key) {
                info.local_symbol_keys.push(symbol_key.to_string());
                return;
            }
        }
    }

    fn next_owned_symbol_key(&mut self, base: String) -> String {
        let count = self.owner_symbol_counts.get(&base).copied().unwrap_or(0);
        self.owner_symbol_counts.insert(base.clone(), count + 1);
        create_indexed_key(&base, count)
    }

    fn push_replacement(&mut self, start: usize, end: usize, code: String) {
        self.replacements.retain(|replacement| !(replacement.start >= start && replacement.end <= end));
        self.replacements.push(Replacement { start, end, code });
    }

    fn fail(&mut self, message: impl Into<String>) {
        if self.error.is_none() {
            self.error = Some(message.into());
        }
    }

    fn collect_symbol_dependencies(
        &self,
        argument: &Argument<'a>,
    ) -> Result<CollectedDependencies, String> {
        let Some(root_scope) = function_argument_scope(argument) else {
            return Err("Expected function argument.".to_string());
        };
        CaptureCollector::collect(self.program, self.semantic, self.source, root_scope, argument)
    }

    fn collect_jsx_symbol_dependencies(
        &self,
        expression: &JSXExpression<'a>,
        root_scope: ScopeId,
    ) -> Result<CollectedDependencies, String> {
        CaptureCollector::collect_jsx_expression(
            self.program,
            self.semantic,
            self.source,
            root_scope,
            expression,
        )
    }

    fn collect_symbol_dependencies_from_expression(
        &self,
        expression: &Expression<'a>,
    ) -> Result<CollectedDependencies, String> {
        let Some(root_scope) = function_expression_scope(expression) else {
            return Err("Expected function expression.".to_string());
        };
        CaptureCollector::collect_expression(self.program, self.semantic, root_scope, expression)
    }

    fn collect_symbol_dependencies_from_module_call_expression(
        &self,
        expression: &CallExpression<'a>,
    ) -> Result<CollectedDependencies, String> {
        CaptureCollector::collect_module_call_expression(self.program, self.semantic, expression)
    }

    fn collect_symbol_dependencies_from_export_default(
        &self,
        declaration: &ExportDefaultDeclarationKind<'a>,
    ) -> Result<CollectedDependencies, String> {
        match declaration {
            ExportDefaultDeclarationKind::ArrowFunctionExpression(function) => {
                CaptureCollector::collect_arrow(self.program, self.semantic, function)
            }
            ExportDefaultDeclarationKind::FunctionExpression(function)
            | ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                CaptureCollector::collect_function(self.program, self.semantic, function)
            }
            ExportDefaultDeclarationKind::ParenthesizedExpression(expression) => {
                self.collect_symbol_dependencies_from_expression(&expression.expression)
            }
            _ => Err("Expected function export default.".to_string()),
        }
    }

    fn add_resume_symbol(
        &mut self,
        symbol_id: String,
        hmr_key: String,
        owner_component_key: Option<String>,
        kind: SymbolKind,
        build: SymbolBuild,
    ) {
        self.hmr_key_by_symbol_id.insert(symbol_id.clone(), hmr_key.clone());
        self.symbols.push((
            symbol_id.clone(),
            ResumeSymbol {
                captures: build.captures.clone(),
                code: build.code.clone(),
                file_path: self.file_id.clone(),
                id: symbol_id.clone(),
                kind: kind.clone(),
            },
        ));
        let signature = create_symbol_signature(&kind, &build.signature_code);
        self.hmr_symbols.push((
            hmr_key,
            ResumeHmrSymbolEntry {
                captures: build.captures,
                hmr_key: self
                    .hmr_key_by_symbol_id
                    .get(&symbol_id)
                    .cloned()
                    .unwrap_or_default(),
                id: symbol_id,
                kind,
                owner_component_key,
                signature,
            },
        ));
    }

    fn build_capture_getter(captures: &[String]) -> String {
        format!("()=>[{}]", captures.join(", "))
    }

    fn plain_event_handler_error(attribute_name: &str, handler_name: Option<&str>) -> String {
        let label = handler_name
            .map(|name| format!(" \"{name}\""))
            .unwrap_or_default();
        format!(
            "Unsupported plain event handler{label} for \"{attribute_name}\". Use an inline function, a component-local function declaration, or a component-local const function value."
        )
    }

    fn ensure_lazy_symbol_for_function(
        &mut self,
        function_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        local_definitions: Vec<LocalDefinition>,
    ) -> String {
        let span_key = SpanKey::from_span(function_span);
        if let Some(symbol_id) = self.lazy_symbol_ids_by_span.get(&span_key) {
            return symbol_id.clone();
        }

        let raw_code = source_text(self.source, function_span);
        let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Lazy, raw_code);
        let build = self
            .build_symbol(
                function_span,
                captures.clone(),
                import_spans,
                local_definitions,
                false,
            )
            .unwrap();
        let owner = self.current_owner_component_key();
        let base = format!("{}:lazy:slot", owner.clone().unwrap_or_else(|| "file".to_string()));
        let hmr_key = self.next_owned_symbol_key(base);
        if owner.is_some() {
            self.push_owner_local_symbol_key(&hmr_key);
        }
        self.used_helpers.insert(HELPER_LAZY.to_string());
        self.add_resume_symbol(symbol_id.clone(), hmr_key, owner, SymbolKind::Lazy, build);
        self.lazy_symbol_ids_by_span.insert(span_key, symbol_id.clone());
        symbol_id
    }

    fn emit_lazy_symbol_from_function(
        &mut self,
        function_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        local_definitions: Vec<LocalDefinition>,
    ) -> String {
        let symbol_id = self.ensure_lazy_symbol_for_function(
            function_span,
            captures.clone(),
            import_spans,
            local_definitions,
        );
        format!(
            "{HELPER_LAZY}({}, {}, {})",
            js_string(&symbol_id),
            render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
            Self::build_capture_getter(&captures),
        )
    }

    fn maybe_emit_local_lazy_symbol(&mut self, expression: &Expression<'a>) {
        if self.current_owner_component_key().is_none() {
            return;
        }
        let Some(function_span) = function_expression_span(expression) else {
            return;
        };
        if self.component_info_by_span.contains_key(&SpanKey::from_span(function_span)) {
            return;
        }
        if let Expression::ParenthesizedExpression(expression) = expression {
            self.maybe_emit_local_lazy_symbol(&expression.expression);
            return;
        }
        let dependencies = match self.collect_symbol_dependencies_from_expression(expression) {
            Ok(dependencies) => dependencies,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        let replacement_code = self.emit_lazy_symbol_from_function(
            function_span,
            dependencies.captures,
            dependencies.import_spans,
            dependencies.local_definitions,
        );
        self.push_replacement(
            function_span.start as usize,
            function_span.end as usize,
            replacement_code,
        );
    }

    fn maybe_emit_lazy_symbol_for_return_object(&mut self, expression: &Expression<'a>) {
        match expression {
            Expression::ParenthesizedExpression(expression) => {
                self.maybe_emit_lazy_symbol_for_return_object(&expression.expression);
            }
            Expression::ObjectExpression(object) => {
                for property in &object.properties {
                    let ObjectPropertyKind::ObjectProperty(property) = property else {
                        continue;
                    };
                    self.maybe_emit_lazy_symbol_for_return_property(property);
                }
            }
            _ => {}
        }
    }

    fn maybe_emit_lazy_symbol_for_return_property(&mut self, property: &ObjectProperty<'a>) {
        if property.kind != PropertyKind::Init || property.computed || property.method {
            return;
        }

        self.maybe_emit_lazy_symbol_for_return_property_value(property, &property.value);
    }

    fn maybe_emit_lazy_symbol_for_return_property_value(
        &mut self,
        property: &ObjectProperty<'a>,
        value: &Expression<'a>,
    ) {
        match value {
            Expression::ParenthesizedExpression(expression) => {
                self.maybe_emit_lazy_symbol_for_return_property_value(property, &expression.expression);
            }
            Expression::ArrowFunctionExpression(function) => {
                let dependencies = match self.collect_symbol_dependencies_from_expression(value) {
                    Ok(dependencies) => dependencies,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let replacement_code = self.emit_lazy_symbol_from_function(
                    function.span,
                    dependencies.captures,
                    dependencies.import_spans,
                    dependencies.local_definitions,
                );
                self.push_replacement(
                    property.value.span().start as usize,
                    property.value.span().end as usize,
                    replacement_code,
                );
            }
            Expression::FunctionExpression(function) => {
                let dependencies = match self.collect_symbol_dependencies_from_expression(value) {
                    Ok(dependencies) => dependencies,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let replacement_code = self.emit_lazy_symbol_from_function(
                    function.span,
                    dependencies.captures,
                    dependencies.import_spans,
                    dependencies.local_definitions,
                );
                self.push_replacement(
                    property.value.span().start as usize,
                    property.value.span().end as usize,
                    replacement_code,
                );
            }
            Expression::Identifier(identifier) => {
                let reference = self.semantic.scoping().get_reference(identifier.reference_id());
                let Some(symbol_id) = reference.symbol_id() else {
                    return;
                };
                let flags = self.semantic.scoping().symbol_flags(symbol_id);
                let symbol_scope = self.semantic.symbol_scope(symbol_id);
                if flags.is_import() || symbol_scope == self.program.scope_id() {
                    return;
                }

                let replacement_code = match self.semantic.symbol_declaration(symbol_id).kind() {
                    AstKind::VariableDeclarator(variable) => {
                        if !flags.is_const_variable() {
                            return;
                        }
                        let Some(init) = variable.init.as_ref() else {
                            return;
                        };
                        let Some(function_span) = function_expression_span(init) else {
                            return;
                        };
                        if self.lazy_symbol_ids_by_span.contains_key(&SpanKey::from_span(function_span)) {
                            return;
                        }
                        let dependencies = match self.collect_symbol_dependencies_from_expression(init) {
                            Ok(dependencies) => dependencies,
                            Err(error) => {
                                self.fail(error);
                                return;
                            }
                        };
                        self.emit_lazy_symbol_from_function(
                            function_span,
                            dependencies.captures,
                            dependencies.import_spans,
                            dependencies.local_definitions,
                        )
                    }
                    AstKind::Function(function) => {
                        if self.lazy_symbol_ids_by_span.contains_key(&SpanKey::from_span(function.span)) {
                            return;
                        }
                        let dependencies = match CaptureCollector::collect_function(
                            self.program,
                            self.semantic,
                            function,
                        ) {
                            Ok(dependencies) => dependencies,
                            Err(error) => {
                                self.fail(error);
                                return;
                            }
                        };
                        self.emit_lazy_symbol_from_function(
                            function.span,
                            dependencies.captures,
                            dependencies.import_spans,
                            dependencies.local_definitions,
                        )
                    }
                    _ => return,
                };

                if property.shorthand {
                    let key_source =
                        render_span_with_replacements(self.source, property.key.span(), &self.replacements)
                            .unwrap();
                    self.push_replacement(
                        property.span.start as usize,
                        property.span.end as usize,
                        format!("{key_source}: {replacement_code}"),
                    );
                    return;
                }

                self.push_replacement(
                    property.value.span().start as usize,
                    property.value.span().end as usize,
                    replacement_code,
                );
            }
            _ => {}
        }
    }

    fn resolve_plain_event_handler_identifier(
        &mut self,
        attribute_name: &str,
        container: &oxc_ast::ast::JSXExpressionContainer<'a>,
        identifier: &oxc_ast::ast::IdentifierReference<'a>,
    ) {
        let reference = self.semantic.scoping().get_reference(identifier.reference_id());
        let Some(symbol_id) = reference.symbol_id() else {
            self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
            return;
        };
        let flags = self.semantic.scoping().symbol_flags(symbol_id);
        let symbol_scope = self.semantic.symbol_scope(symbol_id);
        if flags.is_import() || symbol_scope == self.program.scope_id() {
            self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
            return;
        }

        match self.semantic.symbol_declaration(symbol_id).kind() {
            AstKind::VariableDeclarator(variable) => {
                if !flags.is_const_variable() {
                    self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
                    return;
                }
                let Some(init) = variable.init.as_ref() else {
                    self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
                    return;
                };
                let Some(function_span) = function_expression_span(init) else {
                    self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
                    return;
                };
                if self.component_info_by_span.contains_key(&SpanKey::from_span(function_span)) {
                    self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
                    return;
                }
                let dependencies = match self.collect_symbol_dependencies_from_expression(init) {
                    Ok(dependencies) => dependencies,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let replacement_code = self.emit_lazy_symbol_from_function(
                    function_span,
                    dependencies.captures,
                    dependencies.import_spans,
                    dependencies.local_definitions,
                );
                self.push_replacement(
                    function_span.start as usize,
                    function_span.end as usize,
                    replacement_code,
                );
            }
            AstKind::Function(function) => {
                if self.component_info_by_span.contains_key(&SpanKey::from_span(function.span)) {
                    self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
                    return;
                }
                let dependencies = match CaptureCollector::collect_function(
                    self.program,
                    self.semantic,
                    function,
                ) {
                    Ok(dependencies) => dependencies,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let replacement_code = self.emit_lazy_symbol_from_function(
                    function.span,
                    dependencies.captures,
                    dependencies.import_spans,
                    dependencies.local_definitions,
                );
                self.push_replacement(
                    container.span.start as usize,
                    container.span.end as usize,
                    format!("{{{replacement_code}}}"),
                );
            }
            _ => {
                self.fail(Self::plain_event_handler_error(attribute_name, Some(identifier.name.as_str())));
            }
        }
    }

    fn component_base_from_stack(&self) -> Option<String> {
        if !self.current_functions.is_empty() {
            return None;
        }
        for marker in self.node_stack.iter().rev().skip(1) {
            match marker {
                NodeMarker::ExportDefaultDeclaration => {
                    return Some("component:default".to_string());
                }
                NodeMarker::VariableDeclarator(Some(name))
                | NodeMarker::AssignmentExpression(Some(name))
                    if is_component_name(name) =>
                {
                    return Some(format!("component:{name}"));
                }
                _ => {}
            }
        }
        None
    }

    fn hook_base_from_stack(&self) -> Option<String> {
        if !self.current_functions.is_empty() {
            return None;
        }
        for marker in self.node_stack.iter().rev().skip(1) {
            match marker {
                NodeMarker::VariableDeclarator(Some(name))
                | NodeMarker::AssignmentExpression(Some(name))
                    if is_hook_name(name) =>
                {
                    return Some(name.to_string());
                }
                _ => {}
            }
        }
        None
    }

    fn register_component_with_base(&mut self, span_key: SpanKey, base: String) {
        if self.component_info_by_span.contains_key(&span_key) {
            return;
        }
        let count = self.component_counts.get(&base).copied().unwrap_or(0);
        self.component_counts.insert(base.clone(), count + 1);
        self.component_info_by_span.insert(
            span_key,
            ComponentInfo {
                hmr_key: create_indexed_key(&base, count),
                local_symbol_keys: Vec::new(),
            },
        );
    }

    fn register_component_if_needed(&mut self, span_key: SpanKey) {
        let Some(base) = self.component_base_from_stack() else {
            return;
        };
        self.register_component_with_base(span_key, base);
    }

    fn register_hook_if_needed(&mut self, span_key: SpanKey) {
        if self.hook_functions.contains(&span_key) {
            return;
        }
        if self.hook_base_from_stack().is_some() {
            self.hook_functions.insert(span_key);
        }
    }

    fn emit_component_symbol(
        &mut self,
        symbol_id: String,
        function_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        local_definitions: Vec<LocalDefinition>,
        projection_slots: Option<Vec<(String, usize)>>,
    ) {
        let build = self
            .build_symbol(
                function_span,
                captures.clone(),
                import_spans,
                local_definitions,
                true,
            )
            .unwrap();
        let span_key = SpanKey::from_span(function_span);
        let component_info = self.component_info_by_span.get(&span_key).cloned().unwrap();
        self.hmr_key_by_symbol_id
            .insert(symbol_id.clone(), component_info.hmr_key.clone());
        self.symbols.push((
            symbol_id.clone(),
            ResumeSymbol {
                captures: build.captures.clone(),
                code: build.code.clone(),
                file_path: self.file_id.clone(),
                id: symbol_id.clone(),
                kind: SymbolKind::Component,
            },
        ));
        let signature = create_symbol_signature(&SymbolKind::Component, &build.signature_code);
        self.hmr_symbols.push((
            component_info.hmr_key.clone(),
            ResumeHmrSymbolEntry {
                captures: build.captures.clone(),
                hmr_key: component_info.hmr_key.clone(),
                id: symbol_id.clone(),
                kind: SymbolKind::Component,
                owner_component_key: None,
                signature: signature.clone(),
            },
        ));
        self.hmr_components.push((
            component_info.hmr_key.clone(),
            ResumeHmrComponentEntry {
                captures: build.captures.clone(),
                hmr_key: component_info.hmr_key.clone(),
                id: symbol_id.clone(),
                local_symbol_keys: component_info.local_symbol_keys.clone(),
                signature,
            },
        ));
        self.used_helpers.insert(HELPER_COMPONENT.to_string());
        let projection_literal = projection_slots
            .map(|entries| {
                let body = entries
                    .into_iter()
                    .map(|(name, count)| format!("{name}: {count}"))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!(", {{ {body} }}")
            })
            .unwrap_or_default();
        self.push_replacement(
            function_span.start as usize,
            function_span.end as usize,
            format!(
                "{HELPER_COMPONENT}({}, {}, {}{})",
                render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
                js_string(&symbol_id),
                Self::build_capture_getter(&captures),
                projection_literal,
            ),
        );
    }

    fn emit_prewrapped_component_symbol(
        &mut self,
        symbol_id: String,
        function_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        local_definitions: Vec<LocalDefinition>,
        projection_slots: Option<Vec<(String, usize)>>,
    ) {
        let build = self
            .build_symbol(
                function_span,
                captures.clone(),
                import_spans,
                local_definitions,
                true,
            )
            .unwrap();
        let span_key = SpanKey::from_span(function_span);
        let component_info = self.component_info_by_span.get(&span_key).cloned().unwrap();
        self.hmr_key_by_symbol_id
            .insert(symbol_id.clone(), component_info.hmr_key.clone());
        self.symbols.push((
            symbol_id.clone(),
            ResumeSymbol {
                captures: build.captures.clone(),
                code: build.code.clone(),
                file_path: self.file_id.clone(),
                id: symbol_id.clone(),
                kind: SymbolKind::Component,
            },
        ));
        let signature = create_symbol_signature(&SymbolKind::Component, &build.signature_code);
        self.hmr_symbols.push((
            component_info.hmr_key.clone(),
            ResumeHmrSymbolEntry {
                captures: build.captures.clone(),
                hmr_key: component_info.hmr_key.clone(),
                id: symbol_id.clone(),
                kind: SymbolKind::Component,
                owner_component_key: None,
                signature: signature.clone(),
            },
        ));
        self.hmr_components.push((
            component_info.hmr_key.clone(),
            ResumeHmrComponentEntry {
                captures: build.captures.clone(),
                hmr_key: component_info.hmr_key.clone(),
                id: symbol_id,
                local_symbol_keys: component_info.local_symbol_keys.clone(),
                signature,
            },
        ));
        let _ = projection_slots;
    }

    fn emit_component_symbol_for_expression(&mut self, expression: &Expression<'a>) {
        if let Expression::CallExpression(call) = expression {
            if let Expression::Identifier(identifier) = &call.callee {
                if identifier.name.as_str() == HELPER_COMPONENT {
                    let Some(function_argument) = call.arguments.first() else {
                        return;
                    };
                    let Some(function_span) = function_argument_span(function_argument) else {
                        return;
                    };
                    let Some(symbol_argument) = call.arguments.get(1) else {
                        return;
                    };
                    let Argument::StringLiteral(symbol_literal) = symbol_argument else {
                        return;
                    };
                    if !self.component_info_by_span.contains_key(&SpanKey::from_span(function_span)) {
                        return;
                    }
                    let Some(captures_argument) = call.arguments.get(2) else {
                        return;
                    };
                    let dependencies = match self.collect_symbol_dependencies(function_argument) {
                        Ok(dependencies) => dependencies,
                        Err(error) => {
                            self.fail(error);
                            return;
                        }
                    };
                    let projection_slots = match collect_projection_slots_from_argument(function_argument) {
                        Ok(value) => value,
                        Err(error) => {
                            self.fail(error);
                            return;
                        }
                    };
                    self.push_replacement(
                        captures_argument.span().start as usize,
                        captures_argument.span().end as usize,
                        Self::build_capture_getter(&dependencies.captures),
                    );
                    self.emit_prewrapped_component_symbol(
                        symbol_literal.value.as_str().to_string(),
                        function_span,
                        dependencies.captures,
                        dependencies.import_spans,
                        dependencies.local_definitions,
                        projection_slots,
                    );
                    return;
                }
            }
        }
        let Some(function_span) = function_expression_span(expression) else {
            return;
        };
        if !self.component_info_by_span.contains_key(&SpanKey::from_span(function_span)) {
            return;
        }
        let dependencies = match self.collect_symbol_dependencies_from_expression(expression) {
            Ok(dependencies) => dependencies,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        let projection_slots = match collect_projection_slots_from_expression(expression) {
            Ok(value) => value,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        self.emit_component_symbol(
            create_symbol_id(&self.file_id, &SymbolKind::Component, source_text(self.source, function_span)),
            function_span,
            dependencies.captures,
            dependencies.import_spans,
            dependencies.local_definitions,
            projection_slots,
        );
    }

    fn emit_component_symbol_for_export_default(
        &mut self,
        declaration: &ExportDefaultDeclarationKind<'a>,
    ) {
        let function_span = match declaration {
            ExportDefaultDeclarationKind::ArrowFunctionExpression(function) => function.span,
            ExportDefaultDeclarationKind::FunctionExpression(function)
            | ExportDefaultDeclarationKind::FunctionDeclaration(function) => function.span,
            ExportDefaultDeclarationKind::ParenthesizedExpression(expression) => {
                let Some(function_span) = function_expression_span(&expression.expression) else {
                    return;
                };
                function_span
            }
            _ => return,
        };
        if !self.component_info_by_span.contains_key(&SpanKey::from_span(function_span)) {
            return;
        }
        let dependencies = match self.collect_symbol_dependencies_from_export_default(declaration) {
            Ok(dependencies) => dependencies,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        let projection_slots = match collect_projection_slots_from_export_default(declaration) {
            Ok(value) => value,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        self.emit_component_symbol(
            create_symbol_id(&self.file_id, &SymbolKind::Component, source_text(self.source, function_span)),
            function_span,
            dependencies.captures,
            dependencies.import_spans,
            dependencies.local_definitions,
            projection_slots,
        );
    }

    fn build_external_component_symbol(
        &self,
        expression_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        local_definitions: Vec<LocalDefinition>,
        normalize_symbol_ids: bool,
    ) -> Result<SymbolBuild, String> {
        let expression_source =
            render_span_with_replacements(self.source, expression_span, &self.replacements)?;
        let local_prefix = local_definitions
            .iter()
            .map(|definition| self.render_local_definition(definition))
            .collect::<Result<Vec<_>, _>>()?
            .join("\n");
        let standalone_module = if local_prefix.is_empty() {
            format!("const __e_component = {expression_source};\nexport default __e_component;\n")
        } else {
            format!(
                "{local_prefix}\nconst __e_component = {expression_source};\nexport default __e_component;\n"
            )
        };
        let allocator = Allocator::default();
        let standalone_program = parse_program(
            &allocator,
            &standalone_module,
            source_type_for("symbol.tsx"),
            "symbol.tsx",
        )?;
        let semantic_builder =
            SemanticBuilder::new().with_check_syntax_error(true).build(&standalone_program);
        if !semantic_builder.errors.is_empty() {
            let message = semantic_builder
                .errors
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("\n");
            return Err(message);
        }
        let standalone_semantic = semantic_builder.semantic;

        let mut replacements = Vec::new();
        let capture_indices = captures
            .iter()
            .enumerate()
            .map(|(index, capture)| (capture.clone(), index))
            .collect::<HashMap<_, _>>();
        let mut helper_imports = BTreeSet::new();

        struct StandaloneCaptureVisitor<'b> {
            capture_indices: &'b HashMap<String, usize>,
            helper_imports: &'b mut BTreeSet<String>,
            replacements: &'b mut Vec<Replacement>,
            semantic: &'b Semantic<'b>,
        }

        impl<'a> Visit<'a> for StandaloneCaptureVisitor<'_> {
            fn visit_identifier_reference(
                &mut self,
                identifier: &oxc_ast::ast::IdentifierReference<'a>,
            ) {
                let reference = self.semantic.scoping().get_reference(identifier.reference_id());
                if reference.symbol_id().is_none() {
                    let name = identifier.name.as_str().to_string();
                    if let Some(index) = self.capture_indices.get(&name) {
                        self.replacements.push(Replacement {
                            start: identifier.span.start as usize,
                            end: identifier.span.end as usize,
                            code: format!("__scope[{index}]"),
                        });
                    } else if INTERNAL_HELPERS.contains(&name.as_str()) {
                        self.helper_imports.insert(name);
                    }
                }
            }
        }

        let mut visitor = StandaloneCaptureVisitor {
            capture_indices: &capture_indices,
            helper_imports: &mut helper_imports,
            replacements: &mut replacements,
            semantic: &standalone_semantic,
        };
        visitor.visit_program(&standalone_program);
        let mut code = apply_replacements(&standalone_module, &mut replacements)?;
        code = format!("const __scope = [] as unknown[];\n{code}");
        let mut signature_code = code.clone();

        if normalize_symbol_ids {
            let mut pairs = self.hmr_key_by_symbol_id.iter().collect::<Vec<_>>();
            pairs.sort_by(|left, right| left.0.cmp(right.0));
            for (symbol_id, hmr_key) in pairs {
                signature_code = signature_code.replace(&js_string(symbol_id), &js_string(hmr_key));
            }
        }

        let import_code = import_spans
            .iter()
            .map(|span| source_text(self.source, *span))
            .collect::<Vec<_>>();
        let internal_import = if helper_imports.is_empty() {
            String::new()
        } else {
            format!(
                "import {{ {} }} from \"{}\";\n",
                helper_imports.iter().cloned().collect::<Vec<_>>().join(", "),
                INTERNAL_IMPORT
            )
        };
        let import_prefix = if import_code.is_empty() {
            String::new()
        } else {
            format!("{}\n", import_code.join("\n"))
        };
        let prefixed = format!("{import_prefix}{internal_import}{code}");
        let prefixed_signature = format!("{import_prefix}{internal_import}{signature_code}");

        Ok(SymbolBuild {
            captures,
            code: prefixed,
            signature_code: prefixed_signature,
        })
    }

    fn emit_external_component_symbol(
        &mut self,
        expression: &CallExpression<'a>,
        kind: ExternalFactoryKind,
        base: String,
    ) {
        let span_key = SpanKey::from_span(expression.span);
        self.register_component_with_base(span_key, base);

        let Some(target) = expression.arguments.first() else {
            self.fail("eclipsify*() expects the external component as the first argument.");
            return;
        };
        if !is_supported_external_component_target(target) {
            self.fail(
                "eclipsify*() requires a static component reference as the first argument. Dynamic targets are not supported.",
            );
            return;
        }

        let projection_slots = match collect_external_projection_slots(expression) {
            Ok(value) => value,
            Err(error) => {
                self.fail(error);
                return;
            }
        };

        let dependencies = match self.collect_symbol_dependencies_from_module_call_expression(expression) {
            Ok(dependencies) => dependencies,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        if !dependencies.captures.is_empty() {
            self.fail(
                "eclipsify*() arguments must only reference imports or top-level inlinable symbols.",
            );
            return;
        }
        let symbol_id =
            create_symbol_id(&self.file_id, &SymbolKind::Component, source_text(self.source, expression.span));
        let build = match self.build_external_component_symbol(
            expression.span,
            dependencies.captures.clone(),
            dependencies.import_spans,
            dependencies.local_definitions,
            true,
        ) {
            Ok(build) => build,
            Err(error) => {
                self.fail(error);
                return;
            }
        };
        let component_info = self.component_info_by_span.get(&span_key).cloned().unwrap();
        self.hmr_key_by_symbol_id
            .insert(symbol_id.clone(), component_info.hmr_key.clone());
        self.symbols.push((
            symbol_id.clone(),
            ResumeSymbol {
                captures: build.captures.clone(),
                code: build.code.clone(),
                file_path: self.file_id.clone(),
                id: symbol_id.clone(),
                kind: SymbolKind::Component,
            },
        ));
        let signature = create_symbol_signature(&SymbolKind::Component, &build.signature_code);
        self.hmr_symbols.push((
            component_info.hmr_key.clone(),
            ResumeHmrSymbolEntry {
                captures: build.captures.clone(),
                hmr_key: component_info.hmr_key.clone(),
                id: symbol_id.clone(),
                kind: SymbolKind::Component,
                owner_component_key: None,
                signature: signature.clone(),
            },
        ));
        self.hmr_components.push((
            component_info.hmr_key.clone(),
            ResumeHmrComponentEntry {
                captures: build.captures,
                hmr_key: component_info.hmr_key.clone(),
                id: symbol_id.clone(),
                local_symbol_keys: component_info.local_symbol_keys,
                signature,
            },
        ));
        self.used_helpers.insert(HELPER_COMPONENT.to_string());

        let projection_literal = if projection_slots.is_empty() {
            String::new()
        } else {
            let body = projection_slots
                .iter()
                .map(|(name, count)| format!("{name}: {count}"))
                .collect::<Vec<_>>()
                .join(", ");
            format!(", {{ {body} }}")
        };
        let slots_literal = format!(
            "[{}]",
            projection_slots
                .iter()
                .map(|(name, _)| js_string(name))
                .collect::<Vec<_>>()
                .join(", ")
        );
        let options_literal = format!(
            "{{ external: {{ kind: {}, slots: {} }} }}",
            js_string(kind.as_runtime_kind()),
            slots_literal,
        );
        self.push_replacement(
            expression.span.start as usize,
            expression.span.end as usize,
            format!(
                "{HELPER_COMPONENT}({}, {}, {}{}, {})",
                render_span_with_replacements(self.source, expression.span, &self.replacements).unwrap(),
                js_string(&symbol_id),
                Self::build_capture_getter(&dependencies.captures),
                projection_literal,
                options_literal,
            ),
        );
    }

    fn build_symbol(
        &self,
        function_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        local_definitions: Vec<LocalDefinition>,
        normalize_symbol_ids: bool,
    ) -> Result<SymbolBuild, String> {
        let standalone_source = render_span_with_replacements(self.source, function_span, &self.replacements)?;
        let local_prefix = local_definitions
            .iter()
            .map(|definition| self.render_local_definition(definition))
            .collect::<Result<Vec<_>, _>>()?
            .join("\n");
        let standalone_module = inject_scope_parameter(
            &standalone_source,
            (!local_prefix.is_empty()).then_some(local_prefix.as_str()),
        )?;
        let allocator = Allocator::default();
        let standalone_program = parse_program(
            &allocator,
            &standalone_module,
            source_type_for("symbol.tsx"),
            "symbol.tsx",
        )?;
        let semantic_builder = SemanticBuilder::new().with_check_syntax_error(true).build(&standalone_program);
        if !semantic_builder.errors.is_empty() {
            let message = semantic_builder
                .errors
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("\n");
            return Err(message);
        }
        let standalone_semantic = semantic_builder.semantic;

        let mut replacements = Vec::new();
        let capture_indices = captures
            .iter()
            .enumerate()
            .map(|(index, capture)| (capture.clone(), index))
            .collect::<HashMap<_, _>>();
        let mut helper_imports = BTreeSet::new();

        struct StandaloneCaptureVisitor<'b> {
            capture_indices: &'b HashMap<String, usize>,
            helper_imports: &'b mut BTreeSet<String>,
            replacements: &'b mut Vec<Replacement>,
            semantic: &'b Semantic<'b>,
        }

        impl<'a> Visit<'a> for StandaloneCaptureVisitor<'_> {
            fn visit_identifier_reference(&mut self, identifier: &oxc_ast::ast::IdentifierReference<'a>) {
                let reference = self.semantic.scoping().get_reference(identifier.reference_id());
                if reference.symbol_id().is_none() {
                    let name = identifier.name.as_str().to_string();
                    if let Some(index) = self.capture_indices.get(&name) {
                        self.replacements.push(Replacement {
                            start: identifier.span.start as usize,
                            end: identifier.span.end as usize,
                            code: format!("__scope[{index}]"),
                        });
                    } else if INTERNAL_HELPERS.contains(&name.as_str()) {
                        self.helper_imports.insert(name);
                    }
                }
            }
        }

        let mut visitor = StandaloneCaptureVisitor {
            capture_indices: &capture_indices,
            helper_imports: &mut helper_imports,
            replacements: &mut replacements,
            semantic: &standalone_semantic,
        };
        visitor.visit_program(&standalone_program);
        let code = apply_replacements(&standalone_module, &mut replacements)?;
        let mut signature_code = code.clone();

        if normalize_symbol_ids {
            let mut pairs = self.hmr_key_by_symbol_id.iter().collect::<Vec<_>>();
            pairs.sort_by(|left, right| left.0.cmp(right.0));
            for (symbol_id, hmr_key) in pairs {
                signature_code = signature_code.replace(&js_string(symbol_id), &js_string(hmr_key));
            }
        }

        let import_code = import_spans
            .iter()
            .map(|span| source_text(self.source, *span))
            .collect::<Vec<_>>();
        let internal_import = if helper_imports.is_empty() {
            String::new()
        } else {
            format!(
                "import {{ {} }} from \"{}\";\n",
                helper_imports.iter().cloned().collect::<Vec<_>>().join(", "),
                INTERNAL_IMPORT
            )
        };
        let import_prefix = if import_code.is_empty() {
            String::new()
        } else {
            format!("{}\n", import_code.join("\n"))
        };
        let prefixed = format!("{import_prefix}{internal_import}{code}");
        let prefixed_signature = format!("{import_prefix}{internal_import}{signature_code}");

        Ok(SymbolBuild {
            captures,
            code: prefixed,
            signature_code: prefixed_signature,
        })
    }

    fn render_local_definition(&self, definition: &LocalDefinition) -> Result<String, String> {
        let rendered = render_span_with_replacements(self.source, definition.span, &self.replacements)?;
        Ok(match definition.kind {
            Some(kind) => format!("{} {rendered};", variable_declaration_kind_source(kind)),
            None => rendered,
        })
    }

    fn external_factory_kind_for_call_expression(
        &self,
        expression: &CallExpression<'a>,
    ) -> Option<ExternalFactoryKind> {
        let Expression::Identifier(callee) = &expression.callee else {
            return None;
        };
        let callee_name = callee.name.as_str();

        if self
            .imports
            .react_island_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            return Some(ExternalFactoryKind::React);
        }

        if self
            .imports
            .vue_island_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            return Some(ExternalFactoryKind::Vue);
        }

        None
    }

    fn invalid_external_factory_binding_error(kind: ExternalFactoryKind) -> String {
        format!(
            "eclipsify{}() must be assigned to a top-level PascalCase binding.",
            match kind {
                ExternalFactoryKind::React => "React",
                ExternalFactoryKind::Vue => "Vue",
            }
        )
    }
}

impl<'a, 's> Visit<'a> for AnalyzeVisitor<'a, 's> {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        let marker = match kind {
            AstKind::ExportDefaultDeclaration(_) => NodeMarker::ExportDefaultDeclaration,
            AstKind::VariableDeclarator(variable) => {
                let name = match &variable.id.kind {
                    oxc_ast::ast::BindingPatternKind::BindingIdentifier(identifier) => {
                        Some(Box::leak(identifier.name.as_str().to_string().into_boxed_str()) as &'static str)
                    }
                    _ => None,
                };
                NodeMarker::VariableDeclarator(name)
            }
            AstKind::AssignmentExpression(expression) => {
                let name = match &expression.left {
                    AssignmentTarget::AssignmentTargetIdentifier(identifier) => {
                        Some(Box::leak(identifier.name.as_str().to_string().into_boxed_str()) as &'static str)
                    }
                    _ => None,
                };
                NodeMarker::AssignmentExpression(name)
            }
            _ => NodeMarker::Other,
        };
        self.node_stack.push(marker);

        match kind {
            AstKind::ArrowFunctionExpression(function) => {
                let span_key = SpanKey::from_span(function.span);
                self.register_component_if_needed(span_key);
                self.register_hook_if_needed(span_key);
                self.current_functions.push(FunctionContext { span_key });
            }
            AstKind::Function(function) => {
                let span_key = SpanKey::from_span(function.span);
                self.register_component_if_needed(span_key);
                self.register_hook_if_needed(span_key);
                self.current_functions.push(FunctionContext { span_key });
            }
            _ => {}
        }
    }

    fn leave_node(&mut self, kind: AstKind<'a>) {
        match kind {
            AstKind::ArrowFunctionExpression(_) | AstKind::Function(_) => {
                self.current_functions.pop();
            }
            _ => {}
        }
        self.node_stack.pop();
    }

    fn enter_scope(&mut self, _flags: ScopeFlags, scope_id: &Cell<Option<ScopeId>>) {
        self.current_scope_stack.push(scope_id.get().unwrap());
    }

    fn leave_scope(&mut self) {
        self.current_scope_stack.pop();
    }

    fn visit_call_expression(&mut self, expression: &CallExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_call_expression(self, expression);

        let Expression::Identifier(callee) = &expression.callee else {
            return;
        };
        let callee_name = callee.name.as_str();

        if self
            .imports
            .signal_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            if !self.current_function_is_component_or_hook() {
                self.fail(
                    "useSignal() can only be used while rendering a component and must be called at the top level of the component body (not inside nested functions).",
                );
            }
            return;
        }

        if self
            .imports
            .atom_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            if !self.current_function_is_component_or_hook() {
                self.fail(
                    "useAtom() can only be used while rendering a component and must be called at the top level of the component body (not inside nested functions).",
                );
            }
            return;
        }

        if self
            .imports
            .deprecated_lazy_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            self.fail(
                "$() has been removed. Declare an async function and reference it directly, or pass a plain event handler.",
            );
            return;
        }

        if self
            .imports
            .visible_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            let Some(argument) = expression.arguments.first() else {
                self.fail("onVisible() expects a function expression as the first argument.");
                return;
            };
            if !is_function_argument(argument) {
                self.fail("onVisible() expects a function expression as the first argument.");
                return;
            }
            let Some(function_span) = function_argument_span(argument) else {
                self.fail("onVisible() expects a function expression as the first argument.");
                return;
            };
            let dependencies = match self.collect_symbol_dependencies(argument) {
                Ok(dependencies) => dependencies,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            let replacement_code = self.emit_lazy_symbol_from_function(
                function_span,
                dependencies.captures,
                dependencies.import_spans,
                dependencies.local_definitions,
            );
            self.push_replacement(function_span.start as usize, function_span.end as usize, replacement_code);
            return;
        }

        if self
            .imports
            .watch_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            let Some(argument) = expression.arguments.first() else {
                self.fail("useWatch() expects a function expression as the first argument.");
                return;
            };
            if !is_function_argument(argument) {
                self.fail("useWatch() expects a function expression as the first argument.");
                return;
            }
            let Some(function_span) = function_argument_span(argument) else {
                self.fail("useWatch() expects a function expression as the first argument.");
                return;
            };
            let raw_code = source_text(self.source, function_span);
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Watch, raw_code);
            let dependencies = match self.collect_symbol_dependencies(argument) {
                Ok(dependencies) => dependencies,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            let build = match self.build_symbol(
                function_span,
                dependencies.captures.clone(),
                dependencies.import_spans,
                dependencies.local_definitions,
                false,
            ) {
                Ok(build) => build,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            let owner = self.current_owner_component_key();
            let base = format!("{}:watch:slot", owner.clone().unwrap_or_else(|| "file".to_string()));
            let hmr_key = self.next_owned_symbol_key(base);
            if owner.is_some() {
                self.push_owner_local_symbol_key(&hmr_key);
            }
            self.used_helpers.insert(HELPER_WATCH.to_string());
            self.add_resume_symbol(symbol_id.clone(), hmr_key, owner, SymbolKind::Watch, build);
            let replacement_code = format!(
                "{HELPER_WATCH}({}, {}, {})",
                js_string(&symbol_id),
                render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
                Self::build_capture_getter(&dependencies.captures),
            );
            self.push_replacement(function_span.start as usize, function_span.end as usize, replacement_code);
            return;
        }

        if self
            .imports
            .deprecated_action_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            self.fail("action$() has been removed. Use action() instead.");
            return;
        }

        if self
            .imports
            .action_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            if !self.current_functions.is_empty() {
                self.fail("action() must be declared at module scope so the server can register it exactly once.");
                return;
            }
            let Some(argument) = expression.arguments.last() else {
                self.fail("action() expects the last argument to be a function.");
                return;
            };
            if !is_function_argument(argument) {
                self.fail("action() expects the last argument to be a function.");
                return;
            }
            let Some(function_span) = function_argument_span(argument) else {
                self.fail("action() expects the last argument to be a function.");
                return;
            };
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Action, source_text(self.source, function_span));
            let dependencies = match self.collect_symbol_dependencies(argument) {
                Ok(dependencies) => dependencies,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            let build = match self.build_symbol(
                function_span,
                dependencies.captures,
                dependencies.import_spans,
                dependencies.local_definitions,
                false,
            ) {
                Ok(build) => build,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            self.symbols.push((
                symbol_id.clone(),
                ResumeSymbol {
                    captures: build.captures.clone(),
                    code: build.code,
                    file_path: self.file_id.clone(),
                    id: symbol_id.clone(),
                    kind: SymbolKind::Action,
                },
            ));
            self.actions.push((
                symbol_id.clone(),
                SymbolRef {
                    file_path: self.file_id.clone(),
                    id: symbol_id.clone(),
                },
            ));
            self.used_helpers.insert(HELPER_ACTION.to_string());
            let mut leading_args = Vec::new();
            for value in expression.arguments.iter().take(expression.arguments.len().saturating_sub(1)) {
                leading_args.push(render_span_with_replacements(self.source, value.span(), &self.replacements).unwrap());
            }
            self.push_replacement(
                expression.span.start as usize,
                expression.span.end as usize,
                format!(
                    "{HELPER_ACTION}({}, [{}], {})",
                    js_string(&symbol_id),
                    leading_args.join(", "),
                    render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
                ),
            );
            return;
        }

        if self
            .imports
            .deprecated_loader_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            self.fail("loader$() has been removed. Use loader() instead.");
            return;
        }

        if self
            .imports
            .loader_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            if !self.current_functions.is_empty() {
                self.fail("loader() must be declared at module scope so the server can register it exactly once.");
                return;
            }
            let Some(argument) = expression.arguments.last() else {
                self.fail("loader() expects the last argument to be a function.");
                return;
            };
            if !is_function_argument(argument) {
                self.fail("loader() expects the last argument to be a function.");
                return;
            }
            let Some(function_span) = function_argument_span(argument) else {
                self.fail("loader() expects the last argument to be a function.");
                return;
            };
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Loader, source_text(self.source, function_span));
            let dependencies = match self.collect_symbol_dependencies(argument) {
                Ok(dependencies) => dependencies,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            let build = match self.build_symbol(
                function_span,
                dependencies.captures,
                dependencies.import_spans,
                dependencies.local_definitions,
                false,
            ) {
                Ok(build) => build,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            self.symbols.push((
                symbol_id.clone(),
                ResumeSymbol {
                    captures: build.captures.clone(),
                    code: build.code,
                    file_path: self.file_id.clone(),
                    id: symbol_id.clone(),
                    kind: SymbolKind::Loader,
                },
            ));
            self.loaders.push((
                symbol_id.clone(),
                SymbolRef {
                    file_path: self.file_id.clone(),
                    id: symbol_id.clone(),
                },
            ));
            self.used_helpers.insert(HELPER_LOADER.to_string());
            let mut leading_args = Vec::new();
            for value in expression.arguments.iter().take(expression.arguments.len().saturating_sub(1)) {
                leading_args.push(render_span_with_replacements(self.source, value.span(), &self.replacements).unwrap());
            }
            self.push_replacement(
                expression.span.start as usize,
                expression.span.end as usize,
                format!(
                    "{HELPER_LOADER}({}, [{}], {})",
                    js_string(&symbol_id),
                    leading_args.join(", "),
                    render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
                ),
            );
            return;
        }

    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_variable_declarator(self, declarator);
        if self.error.is_some() {
            return;
        }
        let Some(init) = declarator.init.as_ref() else {
            return;
        };
        if let Expression::CallExpression(call) = init {
            if let Some(kind) = self.external_factory_kind_for_call_expression(call) {
                let oxc_ast::ast::BindingPatternKind::BindingIdentifier(identifier) = &declarator.id.kind else {
                    self.fail(Self::invalid_external_factory_binding_error(kind));
                    return;
                };
                if !self.current_functions.is_empty() || !is_component_name(identifier.name.as_str()) {
                    self.fail(Self::invalid_external_factory_binding_error(kind));
                    return;
                }
                self.emit_external_component_symbol(
                    call,
                    kind,
                    format!("component:{}", identifier.name.as_str()),
                );
                return;
            }
        }
        self.emit_component_symbol_for_expression(init);
        self.maybe_emit_local_lazy_symbol(init);
    }

    fn visit_assignment_expression(&mut self, expression: &AssignmentExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_assignment_expression(self, expression);
        if self.error.is_some() {
            return;
        }
        if let Expression::CallExpression(call) = &expression.right {
            if let Some(kind) = self.external_factory_kind_for_call_expression(call) {
                let AssignmentTarget::AssignmentTargetIdentifier(identifier) = &expression.left else {
                    self.fail(Self::invalid_external_factory_binding_error(kind));
                    return;
                };
                if !self.current_functions.is_empty() || !is_component_name(identifier.name.as_str()) {
                    self.fail(Self::invalid_external_factory_binding_error(kind));
                    return;
                }
                self.emit_external_component_symbol(
                    call,
                    kind,
                    format!("component:{}", identifier.name.as_str()),
                );
                return;
            }
        }
        self.emit_component_symbol_for_expression(&expression.right);
        self.maybe_emit_local_lazy_symbol(&expression.right);
    }

    fn visit_return_statement(&mut self, statement: &ReturnStatement<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_return_statement(self, statement);
        if self.error.is_some() {
            return;
        }
        if !self.current_function_is_component_or_hook() {
            return;
        }
        let Some(argument) = &statement.argument else {
            return;
        };
        self.maybe_emit_lazy_symbol_for_return_object(argument);
    }

    fn visit_export_default_declaration(&mut self, declaration: &ExportDefaultDeclaration<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_export_default_declaration(self, declaration);
        if self.error.is_some() {
            return;
        }
        if let ExportDefaultDeclarationKind::ParenthesizedExpression(expression) = &declaration.declaration {
            if let Expression::CallExpression(call) = &expression.expression {
                if let Some(kind) = self.external_factory_kind_for_call_expression(call) {
                    self.fail(Self::invalid_external_factory_binding_error(kind));
                    return;
                }
            }
        }
        self.emit_component_symbol_for_export_default(&declaration.declaration);
    }

    fn visit_jsx_attribute(&mut self, attribute: &oxc_ast::ast::JSXAttribute<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_jsx_attribute(self, attribute);

        let attribute_name = get_jsx_attribute_name(&attribute.name);
        if attribute_name.starts_with(EVENT_PROP_REGEX_PREFIX)
            && attribute_name.ends_with(DEPRECATED_EVENT_PROP_REGEX_SUFFIX)
        {
            self.fail(format!(
                "Event prop \"{attribute_name}\" has been removed. Use \"{}\" instead.",
                &attribute_name[..attribute_name.len() - DEPRECATED_EVENT_PROP_REGEX_SUFFIX.len()]
            ));
            return;
        }

        let event_name = match to_event_name(&attribute_name) {
            Some(name) => name,
            None => return,
        };
        let Some(value) = &attribute.value else {
            return;
        };
        let oxc_ast::ast::JSXAttributeValue::ExpressionContainer(container) = value else {
            return;
        };
        match &container.expression {
            oxc_ast::ast::JSXExpression::ArrowFunctionExpression(function) => {
                let function_span = function.span;
                let symbol_id = create_symbol_id(
                    &self.file_id,
                    &SymbolKind::Event,
                    source_text(self.source, function_span),
                );
                let dependencies = match self
                    .collect_jsx_symbol_dependencies(&container.expression, function.scope_id())
                {
                    Ok(dependencies) => dependencies,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let build = match self.build_symbol(
                    function_span,
                    dependencies.captures.clone(),
                    dependencies.import_spans,
                    dependencies.local_definitions,
                    false,
                ) {
                    Ok(build) => build,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let owner = self.current_owner_component_key();
                let base = format!(
                    "{}:event:{}",
                    owner.clone().unwrap_or_else(|| "file".to_string()),
                    event_name
                );
                let hmr_key = self.next_owned_symbol_key(base);
                if owner.is_some() {
                    self.push_owner_local_symbol_key(&hmr_key);
                }
                self.used_helpers.insert(HELPER_EVENT.to_string());
                self.add_resume_symbol(symbol_id.clone(), hmr_key, owner, SymbolKind::Event, build);
                self.push_replacement(
                    container.span.start as usize,
                    container.span.end as usize,
                    format!(
                        "{{{HELPER_EVENT}({}, {}, {})}}",
                        js_string(&event_name),
                        js_string(&symbol_id),
                        Self::build_capture_getter(&dependencies.captures),
                    ),
                );
            }
            oxc_ast::ast::JSXExpression::FunctionExpression(function) => {
                let function_span = function.span;
                let symbol_id = create_symbol_id(
                    &self.file_id,
                    &SymbolKind::Event,
                    source_text(self.source, function_span),
                );
                let dependencies = match self
                    .collect_jsx_symbol_dependencies(&container.expression, function.scope_id())
                {
                    Ok(dependencies) => dependencies,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let build = match self.build_symbol(
                    function_span,
                    dependencies.captures.clone(),
                    dependencies.import_spans,
                    dependencies.local_definitions,
                    false,
                ) {
                    Ok(build) => build,
                    Err(error) => {
                        self.fail(error);
                        return;
                    }
                };
                let owner = self.current_owner_component_key();
                let base = format!(
                    "{}:event:{}",
                    owner.clone().unwrap_or_else(|| "file".to_string()),
                    event_name
                );
                let hmr_key = self.next_owned_symbol_key(base);
                if owner.is_some() {
                    self.push_owner_local_symbol_key(&hmr_key);
                }
                self.used_helpers.insert(HELPER_EVENT.to_string());
                self.add_resume_symbol(symbol_id.clone(), hmr_key, owner, SymbolKind::Event, build);
                self.push_replacement(
                    container.span.start as usize,
                    container.span.end as usize,
                    format!(
                        "{{{HELPER_EVENT}({}, {}, {})}}",
                        js_string(&event_name),
                        js_string(&symbol_id),
                        Self::build_capture_getter(&dependencies.captures),
                    ),
                );
            }
            oxc_ast::ast::JSXExpression::Identifier(identifier) => {
                self.resolve_plain_event_handler_identifier(&attribute_name, container, identifier);
            }
            _ => {
                self.fail(Self::plain_event_handler_error(&attribute_name, None));
            }
        }
    }
}
