/**
 * The kit gallery's entry (kit.html): mounts `lib/ui/Kit.svelte` — the fluent kit's own
 * gallery, made by the kit's owner — or a placeholder while it doesn't exist.
 */
import { mount, type Component } from 'svelte';
import Placeholder from './KitPlaceholder.svelte';

import.meta.glob('./lib/ui/styles.css', { eager: true });

const kits = import.meta.glob<{ default: Component }>('./lib/ui/Kit.svelte');
const target = document.getElementById('app');
if (!target) throw new Error('kit.html has no #app');

const load = kits['./lib/ui/Kit.svelte'];
if (load) void load().then((m) => mount(m.default, { target }));
else mount(Placeholder, { target });
