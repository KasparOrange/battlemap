/**
 * The renderer bench's entry (bench.html): mounts `Bench.svelte`, which runs the table view
 * through named scenes (`?scene=all|big-map,…&profile=players|dm&seconds=8&fx=all|none`) and
 * reports fps, frame times, CPU and GPU ms, draw calls, texture MB and idle frames — on screen,
 * to the log (area `bench`) and in `window.__bench`. docs/render.md has the numbers.
 */
import { mount } from 'svelte';
import Bench from './Bench.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('bench.html has no #app');
mount(Bench, { target });
