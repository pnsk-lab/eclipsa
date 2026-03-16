use std::{
    cell::Cell,
    collections::{BTreeSet, HashMap, HashSet},
};

use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast::{
    AstKind,
    ast::{
        Argument, AssignmentTarget, CallExpression, ExportDefaultDeclarationKind, Expression,
        ImportDeclarationSpecifier, JSXAttributeName, JSXElementName, JSXExpression, Program,
        Statement,
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
const EVENT_PROP_REGEX_SUFFIX: &str = "$";

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
    component_identifier: Option<String>,
    lazy_identifier: Option<String>,
    loader_identifier: Option<String>,
    signal_identifier: Option<String>,
    visible_identifier: Option<String>,
    watch_identifier: Option<String>,
}

#[derive(Debug, Clone)]
struct ComponentInfo {
    hmr_key: String,
    local_symbol_keys: Vec<String>,
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
    if !prop_name.starts_with(EVENT_PROP_REGEX_PREFIX) || !prop_name.ends_with(EVENT_PROP_REGEX_SUFFIX) {
        return None;
    }
    let middle = &prop_name[EVENT_PROP_REGEX_PREFIX.len()..prop_name.len() - EVENT_PROP_REGEX_SUFFIX.len()];
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
        component_identifier: None,
        lazy_identifier: None,
        loader_identifier: None,
        signal_identifier: None,
        visible_identifier: None,
        watch_identifier: None,
    };

    for statement in &program.body {
        let oxc_ast::ast::Statement::ImportDeclaration(import_decl) = statement else {
            continue;
        };
        if import_decl.source.value.as_str() != "eclipsa" {
            continue;
        }
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
            match imported {
                "action$" => bindings.action_identifier = Some(local),
                "component$" => bindings.component_identifier = Some(local),
                "$" => bindings.lazy_identifier = Some(local),
                "loader$" => bindings.loader_identifier = Some(local),
                "onVisible" => bindings.visible_identifier = Some(local),
                "useSignal" => bindings.signal_identifier = Some(local),
                "useWatch" => bindings.watch_identifier = Some(local),
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

fn inject_scope_parameter(function_source: &str) -> Result<String, String> {
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

    let params_span = match &declaration.declaration {
        ExportDefaultDeclarationKind::ArrowFunctionExpression(function) => function.params.span,
        ExportDefaultDeclarationKind::FunctionExpression(function) => function.params.span,
        ExportDefaultDeclarationKind::FunctionDeclaration(function) => function.params.span,
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

    Ok(format!(
        "{}{}{}",
        &module[..params_range.start],
        replacement,
        &module[params_range.end..]
    ))
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
    fn collect(argument: &Argument<'_>) -> Result<Option<Vec<(String, usize)>>, String> {
        let params = match argument {
            Argument::ArrowFunctionExpression(function) => &function.params.items,
            Argument::FunctionExpression(function) => &function.params.items,
            _ => return Ok(None),
        };
        let Some(first_param) = params.first() else {
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
        collector.visit_argument(argument);

        if collector.direct_counts.is_empty() {
            return Ok(None);
        }

        for property in collector.direct_counts.keys() {
            let direct = collector.direct_counts[property];
            let total = collector.total_counts.get(property).copied().unwrap_or_default();
            if total > direct {
                return Err(format!(
                    "Projection slot prop \"{}\" must be rendered directly as {{{}.{}}} inside JSX.",
                    property, collector.props_name, property
                ));
            }
        }

        let mut entries = collector.direct_counts.into_iter().collect::<Vec<_>>();
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

fn collect_projection_slots_from_source(argument: &Argument<'_>, _source: &str) -> Result<Option<Vec<(String, usize)>>, String> {
    ProjectionSlotCollector::collect(argument)
}

struct CaptureCollector<'a, 's> {
    capture_indices: HashMap<String, usize>,
    current_scope_stack: Vec<ScopeId>,
    function_scope: ScopeId,
    import_spans: HashSet<SpanKey>,
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
    ) -> Result<(Vec<String>, Vec<Span>), String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            current_scope_stack: Vec::new(),
            function_scope: root_scope,
            import_spans: HashSet::new(),
            program,
            semantic,
        };
        collector.visit_argument(argument);
        let mut captures = collector.capture_indices.into_iter().collect::<Vec<_>>();
        captures.sort_by_key(|(_, index)| *index);
        let mut import_spans = collector
            .import_spans
            .into_iter()
            .map(|span| Span::new(span.start, span.end))
            .collect::<Vec<_>>();
        import_spans.sort_by_key(|span| span.start);
        Ok((captures.into_iter().map(|(name, _)| name).collect(), import_spans))
    }

    fn collect_jsx_expression(
        program: &'a Program<'a>,
        semantic: &'s Semantic<'a>,
        _source: &'s str,
        root_scope: ScopeId,
        expression: &JSXExpression<'a>,
    ) -> Result<(Vec<String>, Vec<Span>), String> {
        let mut collector = Self {
            capture_indices: HashMap::new(),
            current_scope_stack: Vec::new(),
            function_scope: root_scope,
            import_spans: HashSet::new(),
            program,
            semantic,
        };
        collector.visit_jsx_expression(expression);
        let mut captures = collector.capture_indices.into_iter().collect::<Vec<_>>();
        captures.sort_by_key(|(_, index)| *index);
        let mut import_spans = collector
            .import_spans
            .into_iter()
            .map(|span| Span::new(span.start, span.end))
            .collect::<Vec<_>>();
        import_spans.sort_by_key(|span| span.start);
        Ok((captures.into_iter().map(|(name, _)| name).collect(), import_spans))
    }

    fn current_scope(&self) -> ScopeId {
        *self.current_scope_stack.last().unwrap_or(&self.program.scope_id())
    }

    fn is_reachable_from_function_scope(&self, symbol_scope: ScopeId) -> bool {
        self.semantic
            .scoping()
            .scope_ancestors(symbol_scope)
            .any(|scope_id| scope_id == self.function_scope)
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
                "Unsupported resumable capture \"{name}\". Mutable locals are not resumable."
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
        if self.is_reachable_from_function_scope(symbol_scope) {
            return;
        }
        if let Err(error) = self.validate_capture(identifier.name.as_str(), flags, symbol_id) {
            panic!("{error}");
        }
        self.add_capture(identifier.name.as_str());
    }

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
            if self.is_reachable_from_function_scope(symbol_scope) {
                return;
            }
            panic!(
                "Unsupported resumable component reference \"{}\". Import the component from a module.",
                reference.name.as_str()
            );
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
    component_info_by_fn: HashMap<SpanKey, ComponentInfo>,
    current_functions: Vec<FunctionContext>,
    current_scope_stack: Vec<ScopeId>,
    error: Option<String>,
    hmr_components: Vec<(String, ResumeHmrComponentEntry)>,
    hmr_key_by_symbol_id: HashMap<String, String>,
    hmr_symbols: Vec<(String, ResumeHmrSymbolEntry)>,
    imports: ImportBindings,
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
            component_info_by_fn: HashMap::new(),
            current_functions: Vec::new(),
            current_scope_stack: Vec::new(),
            error: None,
            hmr_components: Vec::new(),
            hmr_key_by_symbol_id: HashMap::new(),
            hmr_symbols: Vec::new(),
            imports,
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
            if let Some(info) = self.component_info_by_fn.get(&function.span_key) {
                return Some(info.hmr_key.clone());
            }
        }
        None
    }

    fn current_function_is_component(&self) -> bool {
        self.current_functions
            .last()
            .is_some_and(|context| self.component_info_by_fn.contains_key(&context.span_key))
    }

    fn push_owner_local_symbol_key(&mut self, symbol_key: &str) {
        for function in self.current_functions.iter().rev() {
            if let Some(info) = self.component_info_by_fn.get_mut(&function.span_key) {
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
    ) -> Result<(Vec<String>, Vec<Span>), String> {
        let Some(root_scope) = function_argument_scope(argument) else {
            return Err("Expected function argument.".to_string());
        };
        CaptureCollector::collect(self.program, self.semantic, self.source, root_scope, argument)
    }

    fn collect_jsx_symbol_dependencies(
        &self,
        expression: &JSXExpression<'a>,
        root_scope: ScopeId,
    ) -> Result<(Vec<String>, Vec<Span>), String> {
        CaptureCollector::collect_jsx_expression(
            self.program,
            self.semantic,
            self.source,
            root_scope,
            expression,
        )
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

    fn register_component_if_needed(&mut self, expression: &CallExpression<'a>) {
        let Some(component_identifier) = self.imports.component_identifier.as_deref() else {
            return;
        };
        let Expression::Identifier(callee) = &expression.callee else {
            return;
        };
        if callee.name.as_str() != component_identifier {
            return;
        }
        let Some(argument) = expression.arguments.first() else {
            return;
        };
        let Some(function_span) = function_argument_span(argument) else {
            return;
        };
        let span_key = SpanKey::from_span(function_span);
        if self.component_info_by_fn.contains_key(&span_key) {
            return;
        }

        let mut base = "component:slot".to_string();
        for marker in self.node_stack.iter().rev().skip(1) {
            match marker {
                NodeMarker::ExportDefaultDeclaration => {
                    base = "component:default".to_string();
                    break;
                }
                NodeMarker::VariableDeclarator(Some(name))
                | NodeMarker::AssignmentExpression(Some(name)) => {
                    base = format!("component:{name}");
                    break;
                }
                _ => {}
            }
        }
        if base == "component:slot" {
            let prefix = &self.source[..expression.span.start as usize];
            let line = prefix.rsplit_once('\n').map(|(_, line)| line).unwrap_or(prefix).trim_end();
            if line.ends_with("export default") || line.ends_with("export default(") {
                base = "component:default".to_string();
            } else if let Some((left, _)) = line.rsplit_once('=') {
                let candidate = left.split_whitespace().last().unwrap_or_default();
                if candidate.chars().next().is_some_and(|ch| ch == '_' || ch.is_ascii_alphabetic())
                    && candidate.chars().all(|ch| ch == '_' || ch == '$' || ch.is_ascii_alphanumeric())
                {
                    base = format!("component:{candidate}");
                }
            }
        }
        let count = self.component_counts.get(&base).copied().unwrap_or(0);
        self.component_counts.insert(base.clone(), count + 1);
        self.component_info_by_fn.insert(
            span_key,
            ComponentInfo {
                hmr_key: create_indexed_key(&base, count),
                local_symbol_keys: Vec::new(),
            },
        );
    }

    fn build_symbol(
        &self,
        function_span: Span,
        captures: Vec<String>,
        import_spans: Vec<Span>,
        normalize_symbol_ids: bool,
    ) -> Result<SymbolBuild, String> {
        let standalone_source = render_span_with_replacements(self.source, function_span, &self.replacements)?;
        let standalone_module = inject_scope_parameter(&standalone_source)?;
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
            AstKind::ArrowFunctionExpression(function) => self.current_functions.push(FunctionContext {
                span_key: SpanKey::from_span(function.span),
            }),
            AstKind::Function(function) => self.current_functions.push(FunctionContext {
                span_key: SpanKey::from_span(function.span),
            }),
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
        self.register_component_if_needed(expression);
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
            if !self.current_function_is_component() {
                self.fail(
                    "useSignal() can only be used while rendering a component$ and must be called at the top level of the component$ body (not inside nested functions).",
                );
            }
            return;
        }

        if self
            .imports
            .lazy_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            let Some(argument) = expression.arguments.first() else {
                panic!("$() expects a function expression.");
            };
            if !is_function_argument(argument) {
                panic!("$() expects a function expression.");
            }
            let function_span = function_argument_span(argument).unwrap();
            let raw_code = source_text(self.source, function_span);
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Lazy, raw_code);
            let (captures, import_spans) = self.collect_symbol_dependencies(argument).unwrap();
            let build = self
                .build_symbol(function_span, captures.clone(), import_spans, false)
                .unwrap();
            let owner = self.current_owner_component_key();
            let base = format!("{}:lazy:slot", owner.clone().unwrap_or_else(|| "file".to_string()));
            let hmr_key = self.next_owned_symbol_key(base);
            if owner.is_some() {
                self.push_owner_local_symbol_key(&hmr_key);
            }
            self.used_helpers.insert(HELPER_LAZY.to_string());
            self.add_resume_symbol(symbol_id.clone(), hmr_key, owner, SymbolKind::Lazy, build);
            let replacement_code = format!(
                "{HELPER_LAZY}({}, {}, {})",
                js_string(&symbol_id),
                render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
                Self::build_capture_getter(&captures),
            );
            self.push_replacement(expression.span.start as usize, expression.span.end as usize, replacement_code);
            return;
        }

        if self
            .imports
            .visible_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            let Some(argument) = expression.arguments.first() else {
                panic!("onVisible() expects a function expression as the first argument.");
            };
            if !is_function_argument(argument) {
                panic!("onVisible() expects a function expression as the first argument.");
            }
            let function_span = function_argument_span(argument).unwrap();
            let raw_code = source_text(self.source, function_span);
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Lazy, raw_code);
            let (captures, import_spans) = self.collect_symbol_dependencies(argument).unwrap();
            let build = self
                .build_symbol(function_span, captures.clone(), import_spans, false)
                .unwrap();
            let owner = self.current_owner_component_key();
            let base = format!("{}:lazy:slot", owner.clone().unwrap_or_else(|| "file".to_string()));
            let hmr_key = self.next_owned_symbol_key(base);
            if owner.is_some() {
                self.push_owner_local_symbol_key(&hmr_key);
            }
            self.used_helpers.insert(HELPER_LAZY.to_string());
            self.add_resume_symbol(symbol_id.clone(), hmr_key, owner, SymbolKind::Lazy, build);
            let replacement_code = format!(
                "{HELPER_LAZY}({}, {}, {})",
                js_string(&symbol_id),
                render_span_with_replacements(self.source, function_span, &self.replacements).unwrap(),
                Self::build_capture_getter(&captures),
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
                panic!("useWatch() expects a function expression as the first argument.");
            };
            if !is_function_argument(argument) {
                panic!("useWatch() expects a function expression as the first argument.");
            }
            let function_span = function_argument_span(argument).unwrap();
            let raw_code = source_text(self.source, function_span);
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Watch, raw_code);
            let (captures, import_spans) = self.collect_symbol_dependencies(argument).unwrap();
            let build = self
                .build_symbol(function_span, captures.clone(), import_spans, false)
                .unwrap();
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
                Self::build_capture_getter(&captures),
            );
            self.push_replacement(function_span.start as usize, function_span.end as usize, replacement_code);
            return;
        }

        if self
            .imports
            .action_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            if !self.current_functions.is_empty() {
                panic!("action$() must be declared at module scope so the server can register it exactly once.");
            }
            let Some(argument) = expression.arguments.last() else {
                panic!("action$() expects the last argument to be a function.");
            };
            if !is_function_argument(argument) {
                panic!("action$() expects the last argument to be a function.");
            }
            let function_span = function_argument_span(argument).unwrap();
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Action, source_text(self.source, function_span));
            let (captures, import_spans) = self.collect_symbol_dependencies(argument).unwrap();
            let build = self
                .build_symbol(function_span, captures, import_spans, false)
                .unwrap();
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
            .loader_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            if !self.current_functions.is_empty() {
                panic!("loader$() must be declared at module scope so the server can register it exactly once.");
            }
            let Some(argument) = expression.arguments.last() else {
                panic!("loader$() expects the last argument to be a function.");
            };
            if !is_function_argument(argument) {
                panic!("loader$() expects the last argument to be a function.");
            }
            let function_span = function_argument_span(argument).unwrap();
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Loader, source_text(self.source, function_span));
            let (captures, import_spans) = self.collect_symbol_dependencies(argument).unwrap();
            let build = self
                .build_symbol(function_span, captures, import_spans, false)
                .unwrap();
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

        if self
            .imports
            .component_identifier
            .as_deref()
            .is_some_and(|identifier| identifier == callee_name)
        {
            let Some(argument) = expression.arguments.first() else {
                panic!("component$() expects a function expression.");
            };
            if !is_function_argument(argument) {
                panic!("component$() expects a function expression.");
            }
            let function_span = function_argument_span(argument).unwrap();
            let raw_code = source_text(self.source, function_span);
            let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Component, raw_code);
            let (captures, import_spans) = self.collect_symbol_dependencies(argument).unwrap();
            let projection_slots = match collect_projection_slots_from_source(argument, self.source) {
                Ok(value) => value,
                Err(error) => {
                    self.fail(error);
                    return;
                }
            };
            let build = self
                .build_symbol(function_span, captures.clone(), import_spans, true)
                .unwrap();
            let span_key = SpanKey::from_span(function_span);
            let component_info = self.component_info_by_fn.get(&span_key).cloned().unwrap();
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
    }

    fn visit_jsx_attribute(&mut self, attribute: &oxc_ast::ast::JSXAttribute<'a>) {
        if self.error.is_some() {
            return;
        }
        walk::walk_jsx_attribute(self, attribute);

        let event_name = match to_event_name(&get_jsx_attribute_name(&attribute.name)) {
            Some(name) => name,
            None => return,
        };
        let Some(value) = &attribute.value else {
            return;
        };
        let oxc_ast::ast::JSXAttributeValue::ExpressionContainer(container) = value else {
            return;
        };
        if !matches!(
            container.expression,
            oxc_ast::ast::JSXExpression::ArrowFunctionExpression(_)
                | oxc_ast::ast::JSXExpression::FunctionExpression(_)
        ) {
            return;
        }

        let (function_span, root_scope) = match &container.expression {
            oxc_ast::ast::JSXExpression::ArrowFunctionExpression(function) => {
                (function.span, function.scope_id())
            }
            oxc_ast::ast::JSXExpression::FunctionExpression(function) => {
                (function.span, function.scope_id())
            }
            _ => unreachable!(),
        };
        let symbol_id = create_symbol_id(&self.file_id, &SymbolKind::Event, source_text(self.source, function_span));
        let (captures, import_spans) = self
            .collect_jsx_symbol_dependencies(&container.expression, root_scope)
            .unwrap();
        let build = self
            .build_symbol(function_span, captures.clone(), import_spans, false)
            .unwrap();
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
                Self::build_capture_getter(&captures),
            ),
        );
    }
}
