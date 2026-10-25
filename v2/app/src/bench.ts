/**
 * The renderer bench's entry (bench.html). A stub for now: it starts the renderer and reports
 * whether an idle page draws frames. The renderer package fills it with scenes
 * (`?scene=big-map&fog=churn&tokens=40`) — docs/architecture.md "performance budgets".
 */
import { mount } from 'svelte';
import Bench from './Bench.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('bench.html has no #app');
mount(Bench, { target });
