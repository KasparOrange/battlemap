/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { TableView } from '../../render/index.ts';
import { ViewKeeper, type KeeperDom, type ViewHandlers } from './view-keeper.ts';

/** Elements that only know their parent. */
function fakeDom() {
  const parked: unknown[] = [];
  const el = (name: string) => {
    const e = {
      name, parent: null as unknown, style: { cssText: '' }, kids: [] as unknown[],
      appendChild(child: { parent: unknown; remove(): void }) {
        child.remove();
        child.parent = e;
        e.kids.push(child);
      },
      remove() {
        const p = e.parent as { kids: unknown[] } | null;
        if (p) p.kids.splice(p.kids.indexOf(e), 1);
        e.parent = null;
      },
    };
    return e;
  };
  const parking = el('parking');
  const dom: KeeperDom = {
    makeHost: () => el('host') as unknown as HTMLElement,
    park: (h) => {
      (parking as unknown as HTMLElement).appendChild(h);
      parked.push(h);
    },
  };
  return { dom, el, parked };
}

const handlers = (log: string[], name: string): ViewHandlers => ({ onEvent: (e) => log.push(`${name}:${e.type}`), now: () => (name === 'a' ? 1 : 2) });

describe('view keeper', () => {
  test('one view per page: made once, moved into the next screen, callbacks follow the holder', async () => {
    const { dom, el, parked } = fakeDom();
    const keeper = new ViewKeeper(dom);
    let made = 0;
    let proxied: ViewHandlers | null = null;
    const create = async (_host: HTMLElement, h: ViewHandlers) => {
      made++;
      proxied = h;
      return { ready: Promise.resolve(), destroy() {} } as unknown as TableView;
    };
    const log: string[] = [];
    const first = el('screen1') as unknown as HTMLElement & { kids: unknown[] };
    const a = handlers(log, 'a');
    const v1 = await keeper.borrow(first, a, create);
    expect(first.kids).toHaveLength(1);
    proxied!.onEvent({ type: 'map-shown' } as never);
    expect(proxied!.now()).toBe(1);
    keeper.release(a);
    expect(parked).toHaveLength(1);
    proxied!.onEvent({ type: 'map-shown' } as never); // nobody holds it: dropped
    const second = el('screen2') as unknown as HTMLElement & { kids: unknown[] };
    const b = handlers(log, 'b');
    const v2 = await keeper.borrow(second, b, create);
    expect(v2).toBe(v1);
    expect(made).toBe(1);
    expect(second.kids).toHaveLength(1);
    expect(first.kids).toHaveLength(0);
    proxied!.onEvent({ type: 'map-shown' } as never);
    expect(log).toEqual(['a:map-shown', 'b:map-shown']);
    keeper.release(a); // a stale release changes nothing
    expect(second.kids).toHaveLength(1);
  });

  test('a view that cannot start is dropped, the next screen tries again', async () => {
    const { dom, el } = fakeDom();
    const keeper = new ViewKeeper(dom);
    let destroyed = 0;
    const failing = async () => ({ ready: Promise.reject(new Error('no WebGL')), destroy: () => destroyed++ }) as unknown as TableView;
    const err = await keeper.borrow(el('s') as unknown as HTMLElement, handlers([], 'a'), failing).catch((e: unknown) => e);
    expect(String(err)).toContain('no WebGL');
    expect(destroyed).toBe(1);
    await Promise.resolve();
    expect(keeper.holding).toBe(false);
  });
});
