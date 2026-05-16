import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCueSheet } from '../src/lib/cue.js';
import { SAMPLE_SOURCE_PATH } from '../src/lib/paths.js';

describe('parseCueSheet', () => {
  it('maps INDEX 01 entries to the correct split-track file', () => {
    const cuePath = resolve(SAMPLE_SOURCE_PATH, 'CD 1', 'Pink Floyd - The Wall (1).cue');
    const parsed = parseCueSheet(cuePath, readFileSync(cuePath, 'utf8'));

    expect(parsed.album).toBe('The Wall');
    expect(parsed.discNumber).toBe(1);
    expect(parsed.tracks[0]?.sourceFileName).toBe('01. In The Flesh_.flac');
    expect(parsed.tracks[1]?.sourceFileName).toBe('02. The Thin Ice.flac');
    expect(parsed.tracks[1]?.title).toBe('The Thin Ice');
  });
});