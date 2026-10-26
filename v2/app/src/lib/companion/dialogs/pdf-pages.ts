/**
 * The PDF page picker's logic (PdfPagePicker, MapImport): which pages are picked, what the
 * dialog says, and the order the picked pages are imported in.
 */

/**
 * Picks a page or unpicks it; the result stays sorted.
 *
 * @param picked - the picked pages (from 1)
 * @param page - the page tapped
 * @returns the new picked pages, in order
 */
export function togglePage(picked: readonly number[], page: number): number[] {
  return picked.includes(page) ? picked.filter((p) => p !== page) : [...picked, page].sort((a, b) => a - b);
}

/** What the picker says. */
export interface PickerSummary {
  /** The line under the title. */
  description: string;
  /** The commit button's text. */
  commit: string;
}

/**
 * The picker's texts.
 *
 * @param picked - pages picked
 * @param pageCount - pages in the PDF
 * @param shown - pages shown (the first 60 at most)
 * @returns the description and the commit text
 */
export function pickerSummary(picked: number, pageCount: number, shown: number): PickerSummary {
  const more = pageCount > shown ? ` (the first ${shown} shown)` : '';
  return {
    description: `${pageCount} pages${more} — tap the maps`,
    commit: picked <= 1 ? 'Import this page' : `Import ${picked} pages as ${picked} maps`,
  };
}

/**
 * The squares dialog's commit text for one page of several.
 *
 * @param base - the text for the last (or only) map ("Upload and play")
 * @param index - this page's place among the picked ones, from 0
 * @param count - pages picked
 * @returns the text
 */
export function pageCommitLabel(base: string, index: number, count: number): string {
  return count > 1 && index < count - 1 ? `Upload, next page (${index + 2} of ${count})` : base;
}

/**
 * Whether a file is a PDF, by its name or its first bytes (`%PDF`).
 *
 * @param name - the file's name
 * @param head - its first bytes (5 are enough)
 * @returns true for a PDF
 */
export function isPdfFile(name: string, head: Uint8Array): boolean {
  if (/\.pdf$/i.test(name.trim())) return true;
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}
