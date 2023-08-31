import { LRLanguage, LanguageSupport } from "@codemirror/language";
/// Type used to specify tags to complete.
interface TagSpec {
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
declare const syntax_colors: import("@codemirror/state").Extension;
declare const FREEMARKERLanguage: LRLanguage;
declare const FREEMARKERCompletion: import("@codemirror/state").Extension;
declare const autoCloseTags: import("@codemirror/state").Extension;
declare function FREEMARKER(config?: {
    extraTags?: Record<string, TagSpec>;
    extraGlobalAttributes?: Record<string, null | readonly string[]>;
}): LanguageSupport;
export { syntax_colors, FREEMARKERLanguage, FREEMARKERCompletion, autoCloseTags, FREEMARKER };
