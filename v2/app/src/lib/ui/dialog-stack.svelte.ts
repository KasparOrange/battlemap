/**
 * The modal dialogs open right now, topmost last. A modal `<dialog>` makes everything outside it
 * inert — also the app's notice, so an "Undo" raised while a dialog is open could be seen but
 * not pressed. Each `Dialog` registers here, and the notice is drawn by the host inside the
 * topmost dialog instead of the root one (`NoticeHost` `scope`).
 */
class DialogStack {
    /** Ids of the open dialogs, topmost last. */
    open = $state<string[]>([]);

    /** The topmost open dialog's id, or null. */
    get top(): string | null {
        return this.open[this.open.length - 1] ?? null;
    }

    /**
     * A dialog opened.
     * @param id - its id
     */
    push(id: string): void {
        this.open = [...this.open.filter((d) => d !== id), id];
    }

    /**
     * A dialog closed (or went away).
     * @param id - its id
     */
    remove(id: string): void {
        if (this.open.includes(id)) this.open = this.open.filter((d) => d !== id);
    }
}

/** The one stack of the page. */
export const dialogStack = new DialogStack();
