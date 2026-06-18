//! Mapping LSP result payloads into Galley's domain types.
//!
//! TexLab answers each request with JSON whose exact shape is LSP's, with a few
//! server-specific quirks this module pins down (verified against a live TexLab
//! 4.3 — see the fixtures in the tests):
//!
//! * **Completion** comes back as a `CompletionList` (`{ "items": [...] }`) and
//!   TexLab tags *every* item with `kind: 1` (Text). The real category lives in
//!   the item's `data` string (`"command"`, `"environment"`, `"package"`,
//!   `"label"`, …), so that — not `kind` — is what we classify on.
//! * **Definition** comes back as `LocationLink[]` (with `targetUri` /
//!   `targetSelectionRange`); we also accept plain `Location[]`.
//! * **Document symbols** are hierarchical `DocumentSymbol`s; sections report
//!   `kind: 2`, floats/equations other numbers.
//!
//! Everything is read off `serde_json`'s untyped [`Value`] by hand — no derive
//! macros — so each branch is ours to cover. Positions stay zero-based (LSP);
//! diagnostics are converted to Galley's one-based [`Diagnostic`] line at the
//! single boundary in [`map_diagnostic`].

use galley_core::diagnostics::{Diagnostic, Severity};
use galley_core::{
    CompletionItem, CompletionKind, DocumentSymbol, Hover, Location, Position, SymbolKind,
};
use serde_json::Value;

/// Map a completion result (`CompletionList` or bare `CompletionItem[]`) into
/// Galley completion items, dropping any entry without a label.
#[must_use]
pub fn map_completion(result: &Value) -> Vec<CompletionItem> {
    completion_items(result)
        .iter()
        .filter_map(map_completion_item)
        .collect()
}

/// The item array of a completion result, whether it is a `CompletionList`
/// (`{ items }`) or a bare array.
fn completion_items(result: &Value) -> &[Value] {
    if let Some(items) = result.get("items").and_then(Value::as_array) {
        items
    } else if let Some(items) = result.as_array() {
        items
    } else {
        &[]
    }
}

/// Map one completion item, or `None` when it carries no label.
fn map_completion_item(item: &Value) -> Option<CompletionItem> {
    let label = item.get("label").and_then(Value::as_str)?.to_string();
    let kind = completion_kind(item.get("data").and_then(Value::as_str));
    let detail = item
        .get("detail")
        .and_then(Value::as_str)
        .map(str::to_string);
    let documentation = item.get("documentation").and_then(markup_text);
    let insertion = item
        .get("textEdit")
        .and_then(|edit| edit.get("newText"))
        .and_then(Value::as_str)
        .or_else(|| item.get("insertText").and_then(Value::as_str));
    // Only record an insertion when it actually differs from the label.
    let insert_text = match insertion {
        Some(text) if text != label => Some(text.to_string()),
        _ => None,
    };
    Some(CompletionItem {
        label,
        kind,
        detail,
        insert_text,
        documentation,
    })
}

/// Classify a completion item by TexLab's `data` tag (its `kind` is unreliable).
fn completion_kind(data: Option<&str>) -> CompletionKind {
    match data {
        Some("command") => CompletionKind::Command,
        Some("environment") => CompletionKind::Environment,
        Some("package") => CompletionKind::Package,
        Some("class") => CompletionKind::Class,
        Some("label") => CompletionKind::Reference,
        Some("citation") => CompletionKind::Citation,
        Some("file") => CompletionKind::File,
        Some("directory") => CompletionKind::Folder,
        _ => CompletionKind::Other,
    }
}

/// Map a hover result into hover help, or `None` when the server had nothing.
#[must_use]
pub fn map_hover(result: &Value) -> Option<Hover> {
    if result.is_null() {
        return None;
    }
    let text = hover_text(result.get("contents")?);
    if text.is_empty() {
        None
    } else {
        Some(Hover::new(text))
    }
}

/// Flatten LSP hover `contents` (a string, a `MarkupContent`/`MarkedString`
/// object, or an array of those) into a single text block.
fn hover_text(contents: &Value) -> String {
    match contents {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts
            .iter()
            .map(marked_string_text)
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n"),
        Value::Object(_) => marked_string_text(contents),
        _ => String::new(),
    }
}

/// The text of one hover part: a bare string, or the `value` of a
/// `MarkupContent`/`MarkedString` object.
fn marked_string_text(part: &Value) -> String {
    match part {
        Value::String(text) => text.clone(),
        Value::Object(_) => markup_text(part).unwrap_or_default(),
        _ => String::new(),
    }
}

/// The text of a markup value used for documentation/hover: a bare string, or the
/// `value` field of a `MarkupContent` object.
fn markup_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    value
        .get("value")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Map a definition result (`LocationLink[]`, `Location[]`, a single object, or
/// `null`) into the target location.
#[must_use]
pub fn map_definition(result: &Value) -> Option<Location> {
    location_from(first_target(result)?)
}

/// The first target of a definition result: element zero of an array, the object
/// itself, or `None` for `null`/empty.
fn first_target(result: &Value) -> Option<&Value> {
    match result {
        Value::Array(items) => items.first(),
        Value::Null => None,
        other => Some(other),
    }
}

/// Build a location from one `LocationLink` (`targetUri`) or `Location` (`uri`).
fn location_from(target: &Value) -> Option<Location> {
    if let Some(uri) = target.get("targetUri").and_then(Value::as_str) {
        let position = range_start(target.get("targetSelectionRange")?)
            .or_else(|| range_start(target.get("targetRange")?))?;
        return Some(Location::new(uri, position));
    }
    let uri = target.get("uri").and_then(Value::as_str)?;
    let position = range_start(target.get("range")?)?;
    Some(Location::new(uri, position))
}

/// Map a `DocumentSymbol[]` result into Galley's outline, recursively.
#[must_use]
pub fn map_symbols(result: &Value) -> Vec<DocumentSymbol> {
    result
        .as_array()
        .map(|items| items.iter().filter_map(map_symbol).collect())
        .unwrap_or_default()
}

/// Map one document symbol (and its children), or `None` when it has no name or
/// no locatable line.
fn map_symbol(node: &Value) -> Option<DocumentSymbol> {
    let name = node.get("name").and_then(Value::as_str)?.to_string();
    let line = symbol_line(node)?;
    let kind = symbol_kind(node.get("kind").and_then(Value::as_i64));
    let detail = node
        .get("detail")
        .and_then(Value::as_str)
        .map(str::to_string);
    let children = node.get("children").map(map_symbols).unwrap_or_default();
    Some(DocumentSymbol {
        name,
        detail,
        kind,
        line,
        children,
    })
}

/// The zero-based line a symbol begins at: its `selectionRange` start, or its
/// `range` start.
fn symbol_line(node: &Value) -> Option<u32> {
    if let Some(range) = node.get("selectionRange") {
        if let Some(start) = range_start(range) {
            return Some(start.line);
        }
    }
    range_start(node.get("range")?).map(|start| start.line)
}

/// Map an LSP `SymbolKind` number to Galley's coarse outline kind. TexLab reports
/// `2` for sectioning and other numbers for floats/equations; unknown kinds fall
/// back to [`SymbolKind::Other`].
fn symbol_kind(code: Option<i64>) -> SymbolKind {
    match code {
        Some(2) => SymbolKind::Section,
        Some(6) | Some(14) => SymbolKind::Environment,
        _ => SymbolKind::Other,
    }
}

/// Map a `publishDiagnostics` params object into Galley diagnostics. Each LSP
/// diagnostic becomes a [`Diagnostic::lint`], its zero-based line shifted to
/// Galley's one-based convention.
#[must_use]
pub fn map_diagnostics(params: &Value) -> Vec<Diagnostic> {
    params
        .get("diagnostics")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(map_diagnostic).collect())
        .unwrap_or_default()
}

/// Map one LSP diagnostic into a Galley lint diagnostic, or `None` without a
/// message or a locatable line.
fn map_diagnostic(node: &Value) -> Option<Diagnostic> {
    let message = node.get("message").and_then(Value::as_str)?.to_string();
    let line0 = range_start(node.get("range")?)?.line;
    let severity = diagnostic_severity(node.get("severity").and_then(Value::as_i64));
    Some(Diagnostic::lint(severity, message, None, Some(line0 + 1)))
}

/// Map an LSP `DiagnosticSeverity` (1 Error … 4 Hint) to Galley's model: only an
/// explicit `1` is an error; everything else is a warning-level note.
fn diagnostic_severity(code: Option<i64>) -> Severity {
    match code {
        Some(1) => Severity::Error,
        _ => Severity::Warning,
    }
}

/// The zero-based start [`Position`] of an LSP `Range` value.
fn range_start(range: &Value) -> Option<Position> {
    position(range.get("start")?)
}

/// A zero-based [`Position`] from an LSP `{ line, character }` object.
fn position(value: &Value) -> Option<Position> {
    let line = as_u32(value.get("line")?)?;
    let character = as_u32(value.get("character")?)?;
    Some(Position::new(line, character))
}

/// A `u32` from a JSON number, or `None` when it is not a non-negative integer
/// that fits.
fn as_u32(value: &Value) -> Option<u32> {
    u32::try_from(value.as_u64()?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_a_completion_list_classifying_by_data() {
        // The real TexLab shape: a CompletionList whose items are all kind 1.
        let result = json!({
            "isIncomplete": false,
            "items": [
                { "label": "section", "kind": 1, "data": "command", "detail": "built-in",
                  "textEdit": { "newText": "section", "range": {} } },
                { "label": "figure", "kind": 1, "data": "environment", "detail": "built-in" },
                { "label": "amsmath", "kind": 1, "data": "package" },
                { "label": "article", "kind": 1, "data": "class" },
                { "label": "sec:intro", "kind": 1, "data": "label" },
                { "label": "galley", "kind": 1, "data": "citation" },
                { "label": "main.tex", "kind": 1, "data": "file" },
                { "label": "chapters", "kind": 1, "data": "directory" },
                { "label": "weird", "kind": 1, "data": "mystery" },
                { "label": "untagged", "kind": 1 },
                { "kind": 1, "data": "command" }
            ]
        });
        let items = map_completion(&result);
        // The one label-less item is dropped; ten remain (two classify as Other:
        // an unknown tag and an untagged item).
        assert_eq!(items.len(), 10);
        let kinds: Vec<_> = items.iter().map(|i| i.kind).collect();
        assert_eq!(
            kinds,
            vec![
                CompletionKind::Command,
                CompletionKind::Environment,
                CompletionKind::Package,
                CompletionKind::Class,
                CompletionKind::Reference,
                CompletionKind::Citation,
                CompletionKind::File,
                CompletionKind::Folder,
                CompletionKind::Other,
                CompletionKind::Other,
            ]
        );
        // The first item has a textEdit equal to its label → no separate insertion.
        assert_eq!(items[0].insert_text, None);
        assert_eq!(items[0].insertion(), "section");
        assert_eq!(items[0].detail.as_deref(), Some("built-in"));
    }

    #[test]
    fn maps_a_bare_completion_array_and_records_a_differing_insertion() {
        let result = json!([
            { "label": "frac", "data": "command",
              "textEdit": { "newText": "frac{}{}" }, "documentation": "A fraction" },
            { "label": "alpha", "data": "command", "insertText": "alpha " }
        ]);
        let items = map_completion(&result);
        assert_eq!(items.len(), 2);
        // textEdit.newText differs from the label → it is the insertion.
        assert_eq!(items[0].insert_text.as_deref(), Some("frac{}{}"));
        assert_eq!(items[0].insertion(), "frac{}{}");
        assert_eq!(items[0].documentation.as_deref(), Some("A fraction"));
        // No textEdit → falls back to insertText.
        assert_eq!(items[1].insert_text.as_deref(), Some("alpha "));
    }

    #[test]
    fn a_non_list_completion_result_is_empty() {
        assert!(map_completion(&Value::Null).is_empty());
        assert!(map_completion(&json!(42)).is_empty());
    }

    #[test]
    fn maps_documentation_from_a_markup_object() {
        let result = json!([{
            "label": "ref", "data": "command",
            "documentation": { "kind": "markdown", "value": "Cross-reference" }
        }]);
        let items = map_completion(&result);
        assert_eq!(items[0].documentation.as_deref(), Some("Cross-reference"));
    }

    #[test]
    fn maps_hover_from_each_contents_shape() {
        // Plain string contents.
        assert_eq!(
            map_hover(&json!({ "contents": "plain help" }))
                .unwrap()
                .contents,
            "plain help"
        );
        // MarkupContent object.
        assert_eq!(
            map_hover(&json!({ "contents": { "kind": "markdown", "value": "**bold**" } }))
                .unwrap()
                .contents,
            "**bold**"
        );
        // An array of mixed parts: a MarkedString object, a string, an empty
        // object (no value → dropped), an empty string (dropped), and a number
        // (dropped).
        let hover = map_hover(&json!({
            "contents": [
                { "language": "latex", "value": "\\ref" },
                "see also",
                { "novalue": 1 },
                "",
                7
            ]
        }))
        .unwrap();
        assert_eq!(hover.contents, "\\ref\n\nsee also");
    }

    #[test]
    fn hover_is_none_without_usable_contents() {
        // A null result.
        assert!(map_hover(&Value::Null).is_none());
        // No contents field.
        assert!(map_hover(&json!({ "other": 1 })).is_none());
        // Contents that flatten to nothing (a number).
        assert!(map_hover(&json!({ "contents": 42 })).is_none());
        // An object contents with no value flattens to empty → None.
        assert!(map_hover(&json!({ "contents": { "kind": "x" } })).is_none());
    }

    #[test]
    fn maps_a_definition_location_link() {
        // The real TexLab shape: a LocationLink array.
        let result = json!([{
            "targetUri": "file:///main.tex",
            "targetRange": { "start": { "line": 3, "character": 0 },
                             "end": { "line": 5, "character": 0 } },
            "targetSelectionRange": { "start": { "line": 3, "character": 29 },
                                      "end": { "line": 3, "character": 38 } }
        }]);
        let loc = map_definition(&result).unwrap();
        assert_eq!(loc.file, "file:///main.tex");
        // The precise selection range wins over the broader target range.
        assert_eq!(loc.position, Position::new(3, 29));
    }

    #[test]
    fn definition_link_falls_back_to_target_range() {
        let result = json!({
            "targetUri": "file:///main.tex",
            "targetRange": { "start": { "line": 9, "character": 2 }, "end": {} },
            "targetSelectionRange": { "noStart": true }
        });
        let loc = map_definition(&result).unwrap();
        assert_eq!(loc.position, Position::new(9, 2));
    }

    #[test]
    fn maps_a_plain_location() {
        let result = json!([{
            "uri": "file:///intro.tex",
            "range": { "start": { "line": 12, "character": 4 }, "end": {} }
        }]);
        let loc = map_definition(&result).unwrap();
        assert_eq!(loc.file, "file:///intro.tex");
        assert_eq!(loc.position, Position::new(12, 4));
    }

    #[test]
    fn definition_is_none_for_empty_and_malformed_results() {
        // Null, empty array, and a non-object element.
        assert!(map_definition(&Value::Null).is_none());
        assert!(map_definition(&json!([])).is_none());
        assert!(map_definition(&json!(["nope"])).is_none());
        // A LocationLink missing both ranges.
        assert!(map_definition(&json!({ "targetUri": "x" })).is_none());
        // A LocationLink whose selection range has no start and which has no
        // target range to fall back to.
        assert!(map_definition(&json!({
            "targetUri": "x",
            "targetSelectionRange": { "noStart": true }
        }))
        .is_none());
        // A Location missing its range.
        assert!(map_definition(&json!({ "uri": "x" })).is_none());
        // A Location whose range has no start.
        assert!(map_definition(&json!({ "uri": "x", "range": { "noStart": true } })).is_none());
        // An object that is neither.
        assert!(map_definition(&json!({ "other": 1 })).is_none());
    }

    #[test]
    fn maps_hierarchical_document_symbols() {
        // The real TexLab shape: section (kind 2) with float/equation children.
        let result = json!([{
            "name": "Introduction",
            "detail": "sec:intro",
            "kind": 2,
            "range": { "start": { "line": 3, "character": 0 }, "end": {} },
            "selectionRange": { "start": { "line": 3, "character": 22 }, "end": {} },
            "children": [
                { "name": "Figure: A plot", "kind": 6, "detail": "fig:plot",
                  "selectionRange": { "start": { "line": 7, "character": 0 }, "end": {} } },
                { "name": "Equation", "kind": 14,
                  "selectionRange": { "start": { "line": 9, "character": 0 }, "end": {} } },
                { "name": "Mystery", "kind": 99,
                  "selectionRange": { "start": { "line": 11, "character": 0 }, "end": {} } }
            ]
        }]);
        let symbols = map_symbols(&result);
        assert_eq!(symbols.len(), 1);
        let intro = &symbols[0];
        assert_eq!(intro.name, "Introduction");
        assert_eq!(intro.kind, SymbolKind::Section);
        assert_eq!(intro.detail.as_deref(), Some("sec:intro"));
        assert_eq!(intro.line, 3);
        assert_eq!(intro.children.len(), 3);
        assert_eq!(intro.children[0].kind, SymbolKind::Environment); // float, kind 6
        assert_eq!(intro.children[0].line, 7);
        assert_eq!(intro.children[1].kind, SymbolKind::Environment); // equation, kind 14
        assert_eq!(intro.children[2].kind, SymbolKind::Other); // unknown kind 99
        assert!(intro.children[0].children.is_empty());
    }

    #[test]
    fn symbol_line_falls_back_to_range_start() {
        // No selectionRange → the broader range supplies the line; no kind → Other.
        let result = json!([{
            "name": "Body",
            "range": { "start": { "line": 2, "character": 0 }, "end": {} }
        }]);
        let symbols = map_symbols(&result);
        assert_eq!(symbols[0].line, 2);
        assert_eq!(symbols[0].kind, SymbolKind::Other);
        assert_eq!(symbols[0].detail, None);
    }

    #[test]
    fn document_symbols_drop_nameless_and_unlocatable_nodes() {
        let result = json!([
            { "kind": 2, "selectionRange": { "start": { "line": 1, "character": 0 } } },
            { "name": "NoLine", "kind": 2 },
            { "name": "NoStart", "kind": 2, "selectionRange": { "end": {} } }
        ]);
        assert!(map_symbols(&result).is_empty());
        // A non-array result has no symbols either.
        assert!(map_symbols(&json!({ "not": "an array" })).is_empty());
    }

    #[test]
    fn maps_publish_diagnostics_to_one_based_lints() {
        let params = json!({
            "uri": "file:///main.tex",
            "diagnostics": [
                { "severity": 1, "message": "hard problem",
                  "range": { "start": { "line": 4, "character": 0 }, "end": {} } },
                { "severity": 2, "message": "soft problem",
                  "range": { "start": { "line": 0, "character": 0 }, "end": {} } },
                { "message": "no severity",
                  "range": { "start": { "line": 6, "character": 0 }, "end": {} } }
            ]
        });
        let diags = map_diagnostics(&params);
        assert_eq!(diags.len(), 3);
        // Severity 1 → error; the zero-based line 4 becomes one-based line 5.
        assert_eq!(diags[0].severity, Severity::Error);
        assert_eq!(diags[0].line, Some(5));
        assert_eq!(diags[0].message, "hard problem");
        // Severity 2 → warning; line 0 becomes line 1.
        assert_eq!(diags[1].severity, Severity::Warning);
        assert_eq!(diags[1].line, Some(1));
        // Missing severity → warning.
        assert_eq!(diags[2].severity, Severity::Warning);
    }

    #[test]
    fn diagnostics_are_empty_and_skip_malformed_entries() {
        // No diagnostics array.
        assert!(map_diagnostics(&json!({ "uri": "x" })).is_empty());
        // Entries missing a message or a range are dropped.
        let params = json!({
            "diagnostics": [
                { "severity": 1, "range": { "start": { "line": 1, "character": 0 } } },
                { "message": "no range" },
                "not an object"
            ]
        });
        assert!(map_diagnostics(&params).is_empty());
    }

    #[test]
    fn position_rejects_out_of_range_and_missing_coordinates() {
        // A line that overflows u32 is rejected.
        let huge = json!({ "start": { "line": 5_000_000_000_i64, "character": 0 } });
        assert!(range_start(&huge).is_none());
        // A range with no start.
        assert!(range_start(&json!({ "end": {} })).is_none());
        // A position missing its character.
        let params = json!({ "diagnostics": [
            { "message": "x", "range": { "start": { "line": 1 } } }
        ] });
        assert!(map_diagnostics(&params).is_empty());
        // A position whose line is not a number at all.
        let nonnumeric = json!({ "diagnostics": [
            { "message": "x", "range": { "start": { "line": "nope", "character": 0 } } }
        ] });
        assert!(map_diagnostics(&nonnumeric).is_empty());
        // A start object with no line key at all.
        assert!(range_start(&json!({ "start": { "character": 0 } })).is_none());
        // A character that overflows u32.
        assert!(range_start(&json!({
            "start": { "line": 0, "character": 5_000_000_000_i64 }
        }))
        .is_none());
    }
}
