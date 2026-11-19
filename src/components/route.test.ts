import { describe, expect, it } from 'vitest';
import { isDealtPath, pathOf, placeAt, sameEntry, type Place, type Screen } from './route';

const at = (screen: Screen, overlay: string | null = null): Place => ({ screen, overlay });

describe('addresses for screens', () => {
  it('gives every screen a learner can return to an address, and reads it back', () => {
    const places: Place[] = [
      at({ name: 'home' }),
      at({ name: 'progress' }),
      at({ name: 'guide' }),
      at({ name: 'glossary' }),
      at({ name: 'settings' }),
      at({ name: 'careers' }),
      at({ name: 'lines' }),
      at({ name: 'callit' }),
      at({ name: 'exchange' }),
      at({ name: 'headline' }),
      at({ name: 'finnections' }),
      at({ name: 'mock', round: 'Coding round' }),
      at({ name: 'glossary', q: 'put base' }),
      at({ name: 'home', sheet: 'x4' }),
      at({ name: 'guide' }, 'o7'),
      at({ name: 'glossary', q: 'skew' }, 'y4'),
    ];
    for (const place of places) {
      const path = pathOf(place);
      expect(placeAt(path), path).toEqual(place);
    }
  });

  it('puts home at the root and names the rest after themselves', () => {
    expect(pathOf(at({ name: 'home' }))).toBe('/');
    expect(pathOf(at({ name: 'progress' }))).toBe('/progress');
    expect(pathOf(at({ name: 'finnections' }))).toBe('/finnections');
    expect(pathOf(at({ name: 'mock', round: 'Market making' }))).toBe('/mock/Market%20making');
    expect(pathOf(at({ name: 'glossary', q: 'iv rank' }))).toBe('/glossary?q=iv+rank');
    expect(pathOf(at({ name: 'careers' }, 'z4'))).toBe('/careers?unit=z4');
  });

  it('has no address for a screen the server dealt, so reloading one starts afresh', () => {
    for (const path of ['/lesson', '/drill', '/game', '/case', '/results']) {
      expect(isDealtPath(path), path).toBe(true);
      expect(placeAt(path), path).toBeNull();
    }
    expect(pathOf(at({ name: 'results', summary: { xp: 10, firstTryCorrect: 1, firstTryTotal: 1, bestRun: 1 } as never }))).toBe('/results');
    expect(pathOf(at({ name: 'drill', unitId: 'k1', seed: 7 }))).toBe('/drill');
    expect(isDealtPath('/progress')).toBe(false);
    expect(isDealtPath('/mock/Coding')).toBe(false);
  });

  it('turns down an address that names no screen, so a typed path falls back to the usual one', () => {
    for (const path of ['/nope', '/path', '/guide/extra', '/mock', '/mock/a/b', '/settings/2']) {
      expect(placeAt(path), path).toBeNull();
    }
    // Path isn't a screen of its own: it is home.
    expect(placeAt('/')).toEqual(at({ name: 'home' }));
  });

  it('keeps the query out of the way of the screen it belongs to', () => {
    // An unknown query is ignored rather than making the address unreadable.
    expect(placeAt('/progress?from=email')).toEqual(at({ name: 'progress' }));
    // A sheet over home belongs to the screen, not to App's overlay.
    expect(placeAt('/?unit=x4')).toEqual(at({ name: 'home', sheet: 'x4' }));
    expect(placeAt('/guide?unit=x4')).toEqual(at({ name: 'guide' }, 'x4'));
  });

  it('turns down an address it cannot read rather than throwing', () => {
    // A half-written escape in a round's name reaches this on a Back press and on opening the app.
    expect(placeAt('/mock/%zz')).toBeNull();
    expect(placeAt('/mock/%')).toBeNull();
    // A garbled query is harmless, so the screen still opens.
    expect(placeAt('/glossary?q=%E0%A4')?.screen.name).toBe('glossary');
  });

  it('writes over the last entry only when the same screen and sheet are showing', () => {
    // Typing in the glossary's search box shouldn't fill the history with one entry a letter.
    expect(sameEntry('/glossary?q=sk', '/glossary?q=skew')).toBe(true);
    expect(sameEntry('/glossary', '/glossary?q=skew')).toBe(true);
    // Opening or closing a sheet is a step the learner can take back.
    expect(sameEntry('/guide', '/guide?unit=x4')).toBe(false);
    expect(sameEntry('/guide?unit=x4', '/guide')).toBe(false);
    expect(sameEntry('/guide', '/glossary')).toBe(false);
  });
});
