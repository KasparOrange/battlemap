/**
 * The battlemap fluent kit — import components and helpers from here:
 *   import { Button, Segmented, notify } from '$lib/ui';
 * and the styles once at the app's entry:
 *   import '$lib/ui/styles.css';
 * How and when to use which: v2/docs/design.md. The gallery: Kit.svelte (kit.html).
 */

export { default as Badge } from './Badge.svelte';
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as Dialog } from './Dialog.svelte';
export { default as Field } from './Field.svelte';
export { default as Icon } from './Icon.svelte';
export { default as IconButton } from './IconButton.svelte';
export { default as ListRow } from './ListRow.svelte';
export { default as Menu } from './Menu.svelte';
export { default as NoticeHost } from './NoticeHost.svelte';
export { default as NumberStepper } from './NumberStepper.svelte';
export { default as Numpad } from './Numpad.svelte';
export { default as Panel } from './Panel.svelte';
export { default as Plane } from './Plane.svelte';
export { default as ProgressBar } from './ProgressBar.svelte';
export { default as Section } from './Section.svelte';
export { default as Segmented } from './Segmented.svelte';
export { default as Sheet } from './Sheet.svelte';
export { default as Slider } from './Slider.svelte';
export { default as Spinner } from './Spinner.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as ToggleSwitch } from './ToggleSwitch.svelte';
export { default as Tooltip } from './Tooltip.svelte';

export type { MenuItem } from './Menu.svelte';
export type { SegmentOption } from './Segmented.svelte';
export type { TabItem } from './Tabs.svelte';
export type { IconName } from './icons';
export type { CtlSize, Tone } from './tone';

export { dismiss, notify, noticeMs, notices } from './notice.svelte';
export type { NoticeAction, NoticeKind, NoticeOptions } from './notice.svelte';
export { closeMs, EASE_CLOSE, EASE_GLIDE, EASE_OPEN, grow, openMs, rise, still } from './fluent';
export { plain, prose } from './fields';
export { hold } from './hold';
export { scrollFade } from './scroll-fade';
export { tooltip } from './tooltip';
export { activeScope, focusFirst, focusables, installDpad, moveFocus, navScope, pickInDirection, setSurface } from './spatial';
export type { Direction, DpadOptions } from './spatial';
