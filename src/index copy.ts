// import { parser } from './syntax.grammar';
// import { LRLanguage, LanguageSupport } from '@codemirror/language';
// import { styleTags, tags } from '@lezer/highlight';

// export const FREEMARKERLanguage = LRLanguage.define({
//   parser: parser.configure({
//     props: [
//       styleTags({
//         Identifier: tags.atom,
//         Comment: tags.blockComment,
//         'ListTag StartSectionTag CloseSectionTag EndSectionTag': tags.keyword,
//         'OpenTag CloseTag OpenUnsafeTag CloseUnsafeTag': tags.keyword,
//       }),
//     ],
//   }),
//   languageData: {
//     commentTokens: {
//       block: {
//         open: '{{!',
//         close: '}}',
//       },
//     },
//   },
// });

// export function FREEMARKER() {
//   return new LanguageSupport(FREEMARKERLanguage);
// }

import { parser } from "@lezer/html";
import {
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  foldNodeProp,
  foldInside,
  delimitedIndent,
  bracketMatchingHandle,
  syntaxTree,
} from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { html, htmlLanguage } from "@codemirror/lang-html";
import { TagSpec, elementName, htmlCompletionSourceWith } from "./complete";

export const FREEMARKERLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        Element(context) {
          let after = /^(\s*)(<\/)?/.exec(context.textAfter)!;
          if (context.node.to <= context.pos + after[0].length)
            return context.continue();
          return (
            context.lineIndent(context.node.from) +
            (after[2] ? 0 : context.unit)
          );
        },
        "OpenTag CloseTag SelfClosingTag"(context) {
          return context.column(context.node.from) + context.unit;
        },
        Document(context) {
          if (
            context.pos + /\s*/.exec(context.textAfter)![0].length <
            context.node.to
          )
            return context.continue();
          let endElt = null,
            close;
          for (let cur = context.node; ; ) {
            let last = cur.lastChild;
            if (!last || last.name != "Element" || last.to != cur.to) break;
            endElt = cur = last;
          }
          if (
            endElt &&
            !(
              (close = endElt.lastChild) &&
              (close.name == "CloseTag" || close.name == "SelfClosingTag")
            )
          )
            return context.lineIndent(endElt.from) + context.unit;
          return null;
        },

      }),
      bracketMatchingHandle.add({
        "OpenTag CloseTag": (node) => node.getChild("TagName"),
      }),
      foldNodeProp.add({
        Application: foldInside,
        BlockComment(tree) {
          return { from: tree.from + 2, to: tree.to - 2 };
        },
      }),
      styleTags({
        Identifier: t.variableName,
        Boolean: t.bool,
        String: t.string,
        BlockComment: t.blockComment,
        "( )": t.paren,
        macro: t.tagName,
      }),
    ],
  }),
  languageData: {
    commentTokens: { block: { open: "<#--", close: "-->" } },
    indentOnInput: /^\s*<\/\w+\W$/,
    wordChars: "-._",
  },
});

const selfClosers = new Set(
  "area base br col command embed frame hr img input keygen link meta param source track wbr menuitem".split(
    " "
  )
);

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
  FREEMARKERLanguage.data.of({
    autocomplete: htmlCompletionSourceWith(config),
  });
  return new LanguageSupport(FREEMARKERLanguage);
}
