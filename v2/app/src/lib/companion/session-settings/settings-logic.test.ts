/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { forProtocol, hiddenTabs, presetOf, supported, withDefaults } from './settings-logic.ts';

describe('session settings', () => {
  test('the protocol fields are supported, unknown ones are not sent', () => {
    expect(supported('fogStyle')).toBe(true);
    expect(supported('fogFade')).toBe(true);
    expect(supported('effects')).toBe(true);
    const sent = forProtocol({ fogFade: false, drawTools: false });
    expect(sent.fogFade).toBe(false);
    expect('drawTools' in sent).toBe(supported('drawTools'));
  });
  test('defaults fill the gaps, presets match', () => {
    const s = withDefaults({ fogStyle: 'soft' });
    expect(s.fogStyle).toBe('soft');
    expect(s.drawTools).toBe(true);
    expect(presetOf(s)).toBe('table');
    expect(presetOf({ ...s, drawTools: false, measureTools: false })).toBe('fog');
    expect(presetOf({ ...s, drawTools: false })).toBeNull();
  });
  test('hidden tabs only once the protocol keeps the setting', () => {
    const hidden = hiddenTabs({ drawTools: false, measureTools: false });
    expect(hidden.has('draw')).toBe(supported('drawTools'));
    expect(hiddenTabs(null).size).toBe(0);
  });
  test('light from the map is off by default and only sent once the protocol has it', () => {
    expect(withDefaults(null).mapLights).toBe(false);
    expect('mapLights' in forProtocol({ mapLights: true })).toBe(supported('mapLights'));
  });
});
