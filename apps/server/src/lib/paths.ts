import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(currentDirectory, '../../../../');
export const APP_DATA_DIRECTORY = resolve(REPO_ROOT, '.music-cleaner-upper');
export const APP_STATE_FILE = resolve(APP_DATA_DIRECTORY, 'state.json');
export const SAMPLES_ROOT = resolve(REPO_ROOT, 'samples');

const sampleSourceCandidates = [
  resolve(REPO_ROOT, 'Pink Floyd - The Wall (2007 Remaster) [FLAC] 88'),
  resolve(SAMPLES_ROOT, 'Pink Floyd - The Wall (2007 Remaster) [FLAC] 88'),
];

export const SAMPLE_SOURCE_PATH =
  sampleSourceCandidates.find((candidatePath) => existsSync(candidatePath)) ?? sampleSourceCandidates.at(-1)!;