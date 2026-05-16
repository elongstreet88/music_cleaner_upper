import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';

import { ensureDirectory } from './filesystem.js';
import type { ImportedAlbum, ImportedTrack, OperationProgress, OutputFormat, ProcessResponse, ProcessedFile } from './types.js';

interface ProcessOptions {
  outputFormat?: OutputFormat;
  prefixTrackNumbers?: boolean;
  onProgress?: (update: OperationProgress) => void | Promise<void>;
  commandRunner?: (track: ImportedTrack, destinationPath: string, outputFormat: OutputFormat) => Promise<void>;
}

export const DEFAULT_OUTPUT_FORMAT: OutputFormat = 'source';
export const DEFAULT_PREFIX_TRACK_NUMBERS = true;

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(stderr.trim() || `${command} exited with status ${code}`));
    });
  });
}

function stripTrackNumberPrefix(relativePath: string): string {
  const segments = relativePath.split('/');
  const fileName = segments.at(-1);

  if (!fileName) {
    return relativePath;
  }

  segments[segments.length - 1] = fileName.replace(/^\d{1,3}\s*-\s*/, '');
  return segments.join('/');
}

function buildDestinationRelativePath(
  track: ImportedTrack,
  outputFormat: OutputFormat,
  prefixTrackNumbers: boolean,
): string {
  const baseRelativePath = prefixTrackNumbers
    ? track.destinationRelativePath
    : stripTrackNumberPrefix(track.destinationRelativePath);

  if (outputFormat === 'source') {
    return baseRelativePath;
  }

  if (baseRelativePath.endsWith(track.extension)) {
    return `${baseRelativePath.slice(0, -track.extension.length)}.mp3`;
  }

  return `${baseRelativePath}.mp3`;
}

export function buildFfmpegArguments(
  track: ImportedTrack,
  destinationPath: string,
  outputFormat: OutputFormat,
): string[] {
  const args = ['-y', '-i', track.sourcePath];

  if (outputFormat === 'source') {
    args.push('-map', '0', '-c', 'copy');
  } else {
    args.push(
      '-map_metadata', '0',
      '-map', '0',
      '-codec:a', 'libmp3lame',
      '-codec:v', 'copy',
      '-b:a', '320k',
      '-id3v2_version', '3',
    );
  }

  args.push('-metadata', `title=${track.canonicalTitle}`);
  args.push('-metadata', `artist=${track.canonicalArtist}`);
  args.push('-metadata', `album=${track.canonicalAlbum}`);
  args.push('-metadata', `album_artist=${track.canonicalArtist}`);
  args.push('-metadata', `track=${track.trackNumber}/${track.totalTracks}`);
  args.push('-metadata', `disc=${track.discNumber}/${track.totalDiscs}`);

  if (track.year) {
    args.push('-metadata', `date=${track.year}`);
  }

  if (track.genre) {
    args.push('-metadata', `genre=${track.genre}`);
  }

  args.push(destinationPath);

  return args;
}

async function copyTrackWithFfmpeg(
  track: ImportedTrack,
  destinationPath: string,
  outputFormat: OutputFormat,
): Promise<void> {
  await runCommand('ffmpeg', buildFfmpegArguments(track, destinationPath, outputFormat));
}

export async function processAlbums(
  albums: ImportedAlbum[],
  outputFolder: string,
  options: ProcessOptions = {},
): Promise<ProcessResponse> {
  const resolvedOutputFolder = resolve(outputFolder);
  const copiedFiles: ProcessedFile[] = [];
  const warnings: string[] = [];
  const outputFormat = options.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const prefixTrackNumbers = options.prefixTrackNumbers ?? DEFAULT_PREFIX_TRACK_NUMBERS;
  const commandRunner = options.commandRunner ?? copyTrackWithFfmpeg;
  const allTracks = albums.flatMap((album) => album.tracks);
  const totalTracks = allTracks.length;

  await options.onProgress?.({
    progress: 2,
    message: `Preparing ${totalTracks} track${totalTracks === 1 ? '' : 's'} for ${outputFormat === 'mp3-320' ? 'conversion' : 'copying'}`,
  });

  for (const album of albums) {
    for (const track of album.tracks) {
      const currentTrackIndex = copiedFiles.length + warnings.length + 1;
      const relativePath = buildDestinationRelativePath(track, outputFormat, prefixTrackNumbers);
      const destinationPath = resolve(resolvedOutputFolder, relativePath);

      await options.onProgress?.({
        progress: 5 + Math.round(((currentTrackIndex - 1) / Math.max(totalTracks, 1)) * 90),
        message: `${outputFormat === 'mp3-320' ? 'Converting' : 'Copying'} ${currentTrackIndex}/${totalTracks}: ${track.canonicalTitle}`,
      });

      if (resolve(track.sourcePath) === destinationPath) {
        warnings.push(`Skipped ${track.sourcePath} because it would overwrite the source file.`);
        continue;
      }

      await ensureDirectory(dirname(destinationPath));
      await commandRunner(track, destinationPath, outputFormat);

      copiedFiles.push({
        sourcePath: track.sourcePath,
        destinationPath,
        relativePath,
      });
    }
  }

  await options.onProgress?.({
    progress: 100,
    message: `Finished ${outputFormat === 'mp3-320' ? 'converting' : 'copying'} ${copiedFiles.length} track${copiedFiles.length === 1 ? '' : 's'}`,
  });

  return {
    outputFolder: resolvedOutputFolder,
    outputFormat,
    copiedCount: copiedFiles.length,
    files: copiedFiles,
    warnings,
  };
}