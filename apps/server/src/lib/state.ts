import { promises as fs } from 'node:fs';

import { APP_DATA_DIRECTORY, APP_STATE_FILE } from './paths.js';
import { ensureDirectory, pathExists } from './filesystem.js';
import type { AppState } from './types.js';

const defaultState: AppState = {
  outputFolder: null,
  lastSourcePath: null,
  metadataProvider: 'musicbrainz',
};

export async function readAppState(): Promise<AppState> {
  await ensureDirectory(APP_DATA_DIRECTORY);

  if (!(await pathExists(APP_STATE_FILE))) {
    return { ...defaultState };
  }

  const rawState = await fs.readFile(APP_STATE_FILE, 'utf8');
  const parsed = JSON.parse(rawState) as Partial<AppState>;

  return {
    outputFolder: parsed.outputFolder ?? null,
    lastSourcePath: parsed.lastSourcePath ?? null,
    metadataProvider: parsed.metadataProvider ?? defaultState.metadataProvider,
  };
}

export async function writeAppState(nextState: AppState): Promise<AppState> {
  await ensureDirectory(APP_DATA_DIRECTORY);
  await fs.writeFile(APP_STATE_FILE, JSON.stringify(nextState, null, 2));
  return nextState;
}