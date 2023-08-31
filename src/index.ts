import { parser } from "./syntax.grammar";
import { styleTags, tags as t } from "@lezer/highlight";
import { html, htmlLanguage } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  foldNodeProp,
  foldInside,
  delimitedIndent,
  bracketMatchingHandle,
  syntaxTree,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { TagSpec, elementName } from "./complete";
import { completeFromList } from "@codemirror/autocomplete";

const selfClosers = new Set(
  "area base br col command embed frame hr img input keygen link meta param source track wbr menuitem".split(
    " "
  )
);

const specialVariables = [
  "auto_esc",
  "caller_template_name",
  "current_template_name",
  "data_model",
  "error",
  "get_optional_template",
  "globals",
  "lang",
  "locale",
  "locale_object",
  "locals",
  "main",
  "main_template_name",
  "namespace",
  "node",
  "now",
  "output_encoding ",
  "output_format",
  "template_name",
  "time_zone",
  "url_escaping_charset",
  "vars",
  "version",
];

const keyFunctions = [
  "assign",
  "attempt",
  "autoesc",
  "break",
  "case",
  "compress",
  "default",
  "else",
  "elseif",
  "escape",
  "fallback",
  "function",
  "flush",
  "ftl",
  "global",
  "if",
  "import",
  "include",
  "items",
  "list",
  "local",
  "lt",
  "macro",
  "nested",
  "noautoesc",
  "noescape",
  "noparse",
  "nt",
  "outputformat",
  "recover",
  "recurse",
  "return",
  "rt",
  "sep",
  "setting",
  "stop",
  "switch",
  "t",
  "visit",
];

export const syntax_colors = syntaxHighlighting(
  HighlightStyle.define(
    [
      { tag: t.attributeName, color: "red" },
      { tag: t.keyword, color: "#ffffff" },
    ]
  )
);

export const FREEMARKERLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      // indentNodeProp.add({
      //   Element(context) {
      //     let after = /^(\s*)(<\/)?/.exec(context.textAfter)!;
      //     if (context.node.to <= context.pos + after[0].length)
      //       return context.continue();
      //     return (
      //       context.lineIndent(context.node.from) +
      //       (after[2] ? 0 : context.unit)
      //     );
      //   },
      //   "OpenTag CloseTag SelfClosingTag"(context) {
      //     return context.column(context.node.from) + context.unit;
      //   },
      //   Document(context) {
      //     if (
      //       context.pos + /\s*/.exec(context.textAfter)![0].length <
      //       context.node.to
      //     )
      //       return context.continue();
      //     let endElt = null,
      //       close;
      //     for (let cur = context.node; ; ) {
      //       let last = cur.lastChild;
      //       if (!last || last.name != "Element" || last.to != cur.to) break;
      //       endElt = cur = last;
      //     }
      //     if (
      //       endElt &&
      //       !(
      //         (close = endElt.lastChild) &&
      //         (close.name == "CloseTag" || close.name == "SelfClosingTag")
      //       )
      //     )
      //       return context.lineIndent(endElt.from) + context.unit;
      //     return null;
      //   },
      // }),
      bracketMatchingHandle.add({
        "OpenTag CloseTag EndTag": (node) => node.getChild("TagName"),
      }),
 
      styleTags({
        Identifier: t.atom,
        Comment: t.blockComment,
        AttributeName: t.attributeName,
        TagName: t.tagName,
        "OpenTag CloseTag EndTag": t.angleBracket,
        "OpenBrace CloseBrace": t.brace,
        Variable: t.variableName,
        Number: t.number,
        String: t.string,
        boolean: t.bool
      }),
    ],
  }),
  languageData: {
    commentTokens: {
      block: {
        open: "<#--",
        close: "-->",
      },
    },
  },
});

function getAutoCompleteList() {
  return [...keyFunctions, ...specialVariables].map((key) => {
    let keyType = {
      label: key,
      type: "keyword",
    };
    return keyType;
  });
}

//Autocompletion
export const FREEMARKERCompletion = FREEMARKERLanguage.data.of({
  autocomplete: completeFromList(getAutoCompleteList()),
});

export const autoCloseTags = EditorView.inputHandler.of(
  (view, from, to, text) => {
    if (
      view.composing ||
      view.state.readOnly ||
      from != to ||
      (text != ">" && text != "/") ||
      !FREEMARKERLanguage.isActiveAt(view.state, from, -1)
    ) {
      return false;
    }

    let { state } = view;
    let changes = state.changeByRange((range) => {
      let { head } = range,
        around = syntaxTree(state).resolveInner(head, -1),
        name;
      if (around.name == "TagName" || around.name == "StartTag")
        around = around.parent!;
      if (text == ">" && around.name == "OpenTag") {
        if (
          around.parent?.lastChild?.name != "CloseTag" &&
          (name = elementName(state.doc, around.parent, head)) &&
          !selfClosers.has(name)
        ) {
          let hasRightBracket =
            view.state.doc.sliceString(head, head + 1) === ">";
          let insert = `${hasRightBracket ? "" : ">"}</${name}>`;
          return {
            range: EditorSelection.cursor(head + 1),
            changes: { from: head + (hasRightBracket ? 1 : 0), insert },
          };
        }
      } else if (text == "/" && around.name == "OpenTag") {
        let empty = around.parent,
          base = empty?.parent;
        if (
          empty!.from == head - 1 &&
          base!.lastChild?.name != "CloseTag" &&
          (name = elementName(state.doc, base, head)) &&
          !selfClosers.has(name)
        ) {
          let hasRightBracket =
            view.state.doc.sliceString(head, head + 1) === ">";
          let insert = `/${name}${hasRightBracket ? "" : ">"}`;
          let pos = head + insert.length + (hasRightBracket ? 1 : 0);
          return {
            range: EditorSelection.cursor(pos),
            changes: { from: head, insert },
          };
        }
      }
      return { range };
    });
    if (changes.changes.empty) return false;
    view.dispatch(changes, { userEvent: "input.type", scrollIntoView: true });
    return true;
  }
);

export function FREEMARKER(
  config: {
    extraTags?: Record<string, TagSpec>;
    /// Add additional completable attributes to all tags.
    extraGlobalAttributes?: Record<string, null | readonly string[]>;
  } = {}
) {
  // FREEMARKERLanguage.data.of({
  //   autocomplete: htmlCompletionSourceWith(config),
  // });
  return new LanguageSupport(FREEMARKERLanguage, [FREEMARKERCompletion, autoCloseTags]);
}
