import { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Text } from "@codemirror/state";
import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/// Type used to specify tags to complete.
export interface TagSpec {
  /// Define tag-specific attributes. Property names are attribute
  /// names, and property values can be null to indicate free-form
  /// attributes, or a list of strings for suggested attribute values.
  attrs?: Record<string, null | readonly string[]>;
  /// When set to false, don't complete global attributes on this tag.
  globalAttrs?: boolean;
  /// Can be used to specify a list of child tags that are valid
  /// inside this tag. The default is to allow any tag.
  children?: any;
}
const Bool = ["true", "false"];

const GlobalAttrs: Record<string, null | readonly string[]> = {
  accesskey: null,
  class: null,
  contenteditable: Bool,
};
const S: TagSpec = {}; // Empty tag spec

const Tags: Record<string, TagSpec> = {
  a: S,
};

const identifier = /^[:\-\.\w\u00b7-\uffff]*$/

const keyFunctions = [ "assign", "attempt", "autoesc", "break", "case", "compress", "default", "else",
"elseif", "escape", "fallback", "function", "flush", "ftl", "global", "if", "import",
"include", "items", "list", "local", "lt", "macro", "nested","noautoesc", "noescape", "noparse", "nt","outputformat",
"recover", "recurse", "return", "rt", "sep", "setting", "stop", "switch", "t", "visit" ];
const specialVariables = [ "auto_esc" , "caller_template_name", "current_template_name", "data_model", "error", "get_optional_template", "globals", "lang", "locale",
"locale_object", "locals", "main", "main_template_name", "namespace", "node", "now",
"output_encoding " , "output_format" , "template_name" , "time_zone" , "url_escaping_charset", "vars", "version" ];

const freemarkerStartTagArray = [ "#", "@" ];

const freemarkerEndTagArray = [ "/#", "/@", "/>" ];

export class Schema {
  tags: Record<string, TagSpec>;
  globalAttrs: Record<string, null | readonly string[]>;
  allTags: readonly string[];
  globalAttrNames: readonly string[];

  constructor(
    extraTags?: Record<string, TagSpec>,
    extraAttrs?: Record<string, null | readonly string[]>
  ) {
    this.tags = { ...Tags, ...extraTags };
    this.globalAttrs = { ...GlobalAttrs, ...extraAttrs };
    this.allTags = Object.keys(this.tags);
    this.globalAttrNames = Object.keys(this.globalAttrs);
  }

  static default = new Schema();
}

export function elementName(
  doc: any,
  tree: SyntaxNode | null | undefined,
  max = doc.length
) {
  if (!tree) return "";
  let tag = tree.firstChild;
  let name = tag && tag.getChild("TagName");
  return name ? String(doc).slice(name.from, Math.min(name.to, max)) : "";
}

function completeTag(
  state: EditorState,
  schema: Schema,
  tree: SyntaxNode,
  from: number,
  to: number
) {
  let end = /\s*>/.test(state.sliceDoc(to, to + 5)) ? "" : "#>";
  let parent = findParentElement(tree, true);
  return {
    from,
    to,
    options: allowedChildren(state.doc, parent, schema)
      .map((tagName: any) => ({ label: tagName, type: "type" }))
      .concat(
        openTags(state.doc, tree).map((tag, i) => ({
          label: "/" + tag,
          apply: "/" + tag + end,
          type: "type",
          boost: 99 - i,
        }))
      ),
    validFor: /^\/?[:\-\.\w\u00b7-\uffff]*$/,
  };
}

function findParentElement(tree: SyntaxNode | null, skip = false) {
  for (; tree; tree = tree.parent)
    if (tree.name == "Element") {
      if (skip) skip = false;
      else return tree;
    }
  return null;
}

function allowedChildren(doc: Text, tree: SyntaxNode | null, schema: Schema) {
  let parentInfo = schema.tags[elementName(doc, findParentElement(tree))];
  return parentInfo?.children || schema.allTags;
}

function openTags(doc: Text, tree: SyntaxNode) {
  let open = [];
  for (
    let parent: SyntaxNode | null = findParentElement(tree);
    parent && !parent.type.isTop;
    parent = findParentElement(parent.parent)
  ) {
    let tagName = elementName(doc, parent);
    if (tagName && parent.lastChild!.name == "CloseTag") break;
    if (
      tagName &&
      open.indexOf(tagName) < 0 &&
      (tree.name == "EndTag" || tree.from >= parent.firstChild!.to)
    )
      open.push(tagName);
  }
  return open;
}
function completeCloseTag(
  state: EditorState,
  tree: SyntaxNode,
  from: number,
  to: number
) {
  let end = /\s*>/.test(state.sliceDoc(to, to + 5)) ? "" : "#>";
  return {
    from,
    to,
    options: openTags(state.doc, tree).map((tag, i) => ({
      label: tag,
      apply: tag + end,
      type: "type",
      boost: 99 - i,
    })),
    validFor: identifier,
  };
}

function completeStartTag(
  state: EditorState,
  schema: Schema,
  tree: SyntaxNode,
  pos: number
) {
  let options = [],
    level = 0;
  for (let tagName of allowedChildren(state.doc, tree, schema))
    options.push({ label: "<#" + tagName, type: "type" });
  for (let open of openTags(state.doc, tree))
    options.push({
      label: "<#/" + open + "#>",
      type: "type",
      boost: 99 - level++,
    });
  return {
    from: pos,
    to: pos,
    options,
    validFor: /^<\/?[:\-\.\w\u00b7-\uffff]*$/,
  };
}

function htmlCompletionFor(
  schema: Schema,
  context: CompletionContext
): CompletionResult | null {
  let { state, pos } = context,
    tree = syntaxTree(state).resolveInner(pos, -1),
    around = tree.resolve(pos);
  for (
    let scan = pos, before;
    around == tree && (before = tree.childBefore(scan));

  ) {
    let last = before.lastChild;
    if (!last || !last.type.isError || last.from < last.to) break;
    around = tree = before;
    scan = last.from;
  }
  if (tree.name == "TagName") {
    return tree.parent && /CloseTag$/.test(tree.parent.name)
      ? completeCloseTag(state, tree, tree.from, pos)
      : completeTag(state, schema, tree, tree.from, pos);
  } else if (tree.name == "StartTag") {
    return completeTag(state, schema, tree, pos, pos);
  } else if (
    tree.name == "StartCloseTag" ||
    tree.name == "IncompleteCloseTag"
  ) {
    return completeCloseTag(state, tree, pos, pos);
  } else if (
    context.explicit &&
    (around.name == "Element" ||
      around.name == "Text" ||
      around.name == "Document")
  ) {
    return completeStartTag(state, schema, tree, pos);
  } else {
    return null;
  }
}

/// HTML tag completion. Opens and closes tags and attributes in a
/// context-aware way.
export function htmlCompletionSource(context: CompletionContext) {
    return htmlCompletionFor(Schema.default, context)
  }
  
  /// Create a completion source for HTML extended with additional tags
  /// or attributes.
  export function htmlCompletionSourceWith(config: {
    /// Define extra tag names to complete.
    extraTags?: Record<string, TagSpec>,
    /// Add global attributes that are available on all tags.
    extraGlobalAttributes?: Record<string, null | readonly string[]>
  }) {
    let {extraTags, extraGlobalAttributes: extraAttrs} = config
    let schema = extraAttrs || extraTags ? new Schema(extraTags, extraAttrs) : Schema.default
    return (context: CompletionContext) => htmlCompletionFor(schema, context)
  }