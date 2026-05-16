import { promises as fs } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

import type { DirectoryEntry } from './types.js';

const skippedDirectoryNames = new Set(['.git', 'node_modules', '.music-cleaner-upper']);

export const supportedAudioExtensions = new Set([
  '.flac',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.wav',
  '.aiff',
]);

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function listDirectoryEntries(targetPath: string): Promise<DirectoryEntry[]> {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  return entries
    .map((entry) => ({
      name: entry.name,
      path: resolve(targetPath, entry.name),
      kind: (entry.isDirectory() ? 'directory' : 'file') as DirectoryEntry['kind'],
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });
}

export async function collectFiles(
  sourcePath: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const resolvedPath = resolve(sourcePath);
  const stat = await fs.stat(resolvedPath);

  if (stat.isFile()) {
    return predicate(resolvedPath) ? [resolvedPath] : [];
  }

  const files: string[] = [];
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skippedDirectoryNames.has(entry.name)) {
        continue;
      }

      files.push(...(await collectFiles(resolve(resolvedPath, entry.name), predicate)));
      continue;
    }

    const entryPath = resolve(resolvedPath, entry.name);
    if (predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

export function isCueFile(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.cue';
}

export function isAudioFile(filePath: string): boolean {
  return supportedAudioExtensions.has(extname(filePath).toLowerCase());
}

export function sanitizePathSegment(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > 0 ? normalized : 'Unknown';
}

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function basenameWithoutExtension(filePath: string): string {
  return basename(filePath, extname(filePath));
}

export function inferTrackNumberFromFileName(fileName: string): number | undefined {
  const match = basenameWithoutExtension(fileName).match(/^(\d{1,3})[ ._-]/);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function stripDiscSuffix(value: string, discNumber: number): string {
  return value
    .replace(new RegExp(`\\s*\\((?:disc\\s*)?${discNumber}\\)\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s*(?:disc|cd)\\s*${discNumber}\\s*$`, 'i'), '')
    .trim();
}