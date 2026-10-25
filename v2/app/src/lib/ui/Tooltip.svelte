<!--
  Tooltip — names the control inside it on mouse hover and on keyboard / D-pad focus (never on
  touch). The declarative form of the `tooltip` action (tooltip.ts); IconButton already has
  one built in, so use this around anything else that needs a name it does not show.

  Props:
  - text: string — the one line
  - children: Snippet — the control
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import { tooltip } from './tooltip';

    interface Props {
        /** The tooltip line. */
        text: string;
        /** The control being named. */
        children: Snippet;
    }

    let { text, children }: Props = $props();
</script>

<span class="bm-tip" use:tooltip={text}>{@render children()}</span>

<style>
    .bm-tip {
        display: inline-flex;
    }
</style>
