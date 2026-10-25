/**
 * Attributes for text fields (cross-project rule, ~/code/CLAUDE.md "Machine-text fields turn
 * off macOS's helpers"; bridge `ui/src/fields.ts` is the reference).
 *
 * A field that takes MACHINE text — a search, a link, a token or map name that Enter
 * commits, a number, a code — turns completion, correction, capitalisation and spell check
 * off: the OS bubbles ("logging" → "Logging") swallow ↓ ↑ Enter before the field's own keys
 * see them, and such text never wants a correction. PROSE fields (notes, session
 * descriptions) keep them. {@link Field} applies one of the two by its `kind` prop.
 */

/** Spread on a machine-text input: `<input {...plain}>`. */
export const plain = {
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: false,
} as const;

/** Spread on a prose input or textarea: the OS helpers stay on. */
export const prose = {
    autocomplete: 'on',
    autocorrect: 'on',
    autocapitalize: 'sentences',
    spellcheck: true,
} as const;

/** Which of the two attribute sets a field uses. */
export type FieldKind = 'machine' | 'prose';
