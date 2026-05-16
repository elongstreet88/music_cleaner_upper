import { promises as fs } from 'node:fs';
import { extname, basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { parseFile } from 'music-metadata';

import { parseCueSheet } from './cue.js';
import {
  basenameWithoutExtension,
  collectFiles,
  inferTrackNumberFromFileName,
  isAudioFile,
  isCueFile,
  normalizeSearchText,
  pathExists,
  sanitizePathSegment,
  stripDiscSuffix,
} from './filesystem.js';
import type { CanonicalRelease } from './musicbrainz.js';
import { fetchCanonicalRelease } from './musicbrainz.js';
import type { ImportedAlbum, ImportedTrack, ImportResponse, OperationProgress, ReleaseMatch } from './types.js';

interface LocalTrack {
  sourcePath: string;
  sourceFileName: string;
  extension: string;
  discNumber: number;
  totalDiscs: number;
  trackNumber: number;
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
}

interface LocalAlbum {
  id: string;
  sourcePath: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  totalDiscs: number;
  tracks: LocalTrack[];
}

export interface ImportSourceOptions {
  releaseLookup?: typeof fetchCanonicalRelease;
  onProgress?: (update: OperationProgress) => void | Promise<void>;
}

interface LocalAlbumScanResult {
  albums: LocalAlbum[];
  warnings: string[];
  coveredAudioPaths: Set<string>;
}

interface MetadataSourceTrack {
  sourcePath: string;
  sourceFileName: string;
  extension: string;
  discNumber: number;
  trackNumber: number;
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
}

interface MetadataSourceAlbum {
  id: string;
  sourcePath: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  totalDiscs: number;
  tracks: MetadataSourceTrack[];
}

function buildAlbumKey(artist: string, album: string): string {
  return `${normalizeSearchText(artist)}::${normalizeSearchText(album)}`;
}

function buildReleaseMatch(release: CanonicalRelease | null): ReleaseMatch | null {
  if (!release) {
    return null;
  }

  return {
    id: release.id,
    score: release.score,
    title: release.title,
    artist: release.artist,
    year: release.year,
    sourceUrl: release.sourceUrl,
  };
}

function buildMetadataLookupFailurePrefix(artist: string, album: string): string {
  return `Metadata lookup failed for ${artist} - ${album}:`;
}

function buildMetadataLookupFailureMessage(artist: string, album: string, errorMessage: string): string {
  return `${buildMetadataLookupFailurePrefix(artist, album)} ${errorMessage}`;
}

function inferArtistAndAlbumFromPath(audioFile: string): { artist: string; album: string } {
  const album = basename(dirname(audioFile));
  const artistCandidate = basename(dirname(dirname(audioFile)));

  return {
    artist: artistCandidate && artistCandidate !== album ? artistCandidate : album,
    album,
  };
}

function inferTrackDetailsFromFileName(fileName: string, artist: string): {
  discNumber: number;
  trackNumber: number;
  title: string;
} {
  const baseName = basenameWithoutExtension(fileName);
  const discTrackMatch = baseName.match(/^(\d{1,2})[- ](\d{2})\s+(.+)$/);

  let discNumber = 1;
  let trackNumber = inferTrackNumberFromFileName(fileName) ?? 1;
  let remainder = baseName;

  if (discTrackMatch) {
    discNumber = Number.parseInt(discTrackMatch[1], 10);
    trackNumber = Number.parseInt(discTrackMatch[2], 10);
    remainder = discTrackMatch[3].trim();
  }

  const separatorIndex = remainder.indexOf(' - ');
  if (separatorIndex >= 0) {
    const possibleArtist = remainder.slice(0, separatorIndex).trim();
    const possibleTitle = remainder.slice(separatorIndex + 3).trim();

    if (
      possibleTitle.length > 0 &&
      normalizeSearchText(possibleArtist).includes(normalizeSearchText(artist))
    ) {
      remainder = possibleTitle;
    }
  }

  return {
    discNumber,
    trackNumber,
    title: remainder,
  };
}

function inferMetadataFromPath(audioFile: string): {
  artist: string;
  album: string;
  discNumber: number;
  trackNumber: number;
  title: string;
} {
  const pathDetails = inferArtistAndAlbumFromPath(audioFile);
  const trackDetails = inferTrackDetailsFromFileName(basename(audioFile), pathDetails.artist);

  return {
    artist: pathDetails.artist,
    album: pathDetails.album,
    discNumber: trackDetails.discNumber,
    trackNumber: trackDetails.trackNumber,
    title: trackDetails.title,
  };
}

export function buildDestinationRelativePath(input: {
  artist: string;
  album: string;
  title: string;
  trackNumber: number;
  discNumber: number;
  totalDiscs: number;
  extension: string;
}): string {
  const artistSegment = sanitizePathSegment(input.artist);
  const albumSegment = sanitizePathSegment(input.album);
  const fileName = `${String(input.trackNumber).padStart(2, '0')} - ${sanitizePathSegment(input.title)}${input.extension}`;

  if (input.totalDiscs > 1) {
    return `${artistSegment}/${albumSegment}/Disc ${input.discNumber}/${fileName}`;
  }

  return `${artistSegment}/${albumSegment}/${fileName}`;
}

function normalizeAlbumCollection(albums: LocalAlbum[]): LocalAlbum[] {
  const albumMap = new Map<string, LocalAlbum>();

  for (const album of albums) {
    const albumKey = buildAlbumKey(album.artist, album.album);

    if (!albumMap.has(albumKey)) {
      albumMap.set(albumKey, {
        ...album,
        tracks: [],
      });
    }

    const existingAlbum = albumMap.get(albumKey)!;
    const existingTrackPaths = new Set(existingAlbum.tracks.map((track) => resolve(track.sourcePath)));

    existingAlbum.totalDiscs = Math.max(existingAlbum.totalDiscs, album.totalDiscs);
    existingAlbum.year = existingAlbum.year ?? album.year;
    existingAlbum.genre = existingAlbum.genre ?? album.genre;

    if (album.sourcePath.length < existingAlbum.sourcePath.length) {
      existingAlbum.sourcePath = album.sourcePath;
    }

    for (const track of album.tracks) {
      const trackPath = resolve(track.sourcePath);
      if (existingTrackPaths.has(trackPath)) {
        continue;
      }

      existingAlbum.tracks.push(track);
      existingTrackPaths.add(trackPath);
    }
  }

  return [...albumMap.values()]
    .map((album) => ({
      ...album,
      tracks: album.tracks.sort((left, right) => {
        if (left.discNumber !== right.discNumber) {
          return left.discNumber - right.discNumber;
        }

        return left.trackNumber - right.trackNumber;
      }),
    }))
    .filter((album) => album.tracks.length > 0);
}

async function scanCueAlbums(sourcePath: string): Promise<LocalAlbumScanResult> {
  const cueFiles = await collectFiles(sourcePath, isCueFile);
  if (cueFiles.length === 0) {
    return { albums: [], warnings: [], coveredAudioPaths: new Set<string>() };
  }

  const albumMap = new Map<string, LocalAlbum>();
  const warnings: string[] = [];
  const coveredAudioPaths = new Set<string>();

  for (const cueFile of cueFiles) {
    const parsedCue = parseCueSheet(cueFile, await fs.readFile(cueFile, 'utf8'));
    const albumKey = buildAlbumKey(parsedCue.artist, parsedCue.album);

    if (!albumMap.has(albumKey)) {
      albumMap.set(albumKey, {
        id: randomUUID(),
        sourcePath: resolve(parsedCue.sourceDirectory, '..'),
        artist: parsedCue.artist,
        album: parsedCue.album,
        year: parsedCue.year,
        genre: parsedCue.genre,
        totalDiscs: parsedCue.totalDiscs,
        tracks: [],
      });
    }

    const album = albumMap.get(albumKey)!;
    album.totalDiscs = Math.max(album.totalDiscs, parsedCue.totalDiscs, parsedCue.discNumber);
    album.year = album.year ?? parsedCue.year;
    album.genre = album.genre ?? parsedCue.genre;

    for (const track of parsedCue.tracks) {
      if (!(await pathExists(track.sourcePath))) {
        warnings.push(`Skipped missing source file: ${track.sourcePath}`);
        continue;
      }

      album.tracks.push({
        sourcePath: track.sourcePath,
        sourceFileName: basename(track.sourcePath),
        extension: extname(track.sourcePath).toLowerCase(),
        discNumber: parsedCue.discNumber,
        totalDiscs: album.totalDiscs,
        trackNumber: track.trackNumber,
        title: track.title,
        artist: track.artist || parsedCue.artist,
        album: parsedCue.album,
        year: parsedCue.year,
        genre: parsedCue.genre,
      });
      coveredAudioPaths.add(resolve(track.sourcePath));
    }
  }

  return {
    albums: normalizeAlbumCollection([...albumMap.values()]),
    warnings,
    coveredAudioPaths,
  };
}

async function scanTaggedAudioAlbums(
  sourcePath: string,
  coveredAudioPaths: Set<string> = new Set<string>(),
): Promise<LocalAlbumScanResult> {
  const audioFiles = await collectFiles(sourcePath, isAudioFile);
  const warnings: string[] = [];
  const albumMap = new Map<string, LocalAlbum>();

  for (const audioFile of audioFiles) {
    if (coveredAudioPaths.has(resolve(audioFile))) {
      continue;
    }

    const inferred = inferMetadataFromPath(audioFile);

    try {
      const metadata = await parseFile(audioFile, { skipCovers: true });
      const artist = metadata.common.albumartist || metadata.common.artist || inferred.artist;
      const discNumber = metadata.common.disk.no || inferred.discNumber;
      const trackNumber = metadata.common.track.no || inferred.trackNumber;
      const album = stripDiscSuffix(metadata.common.album || inferred.album, discNumber);
      const albumKey = buildAlbumKey(artist, album);
      const title = metadata.common.title || inferred.title;

      if (!albumMap.has(albumKey)) {
        albumMap.set(albumKey, {
          id: randomUUID(),
          sourcePath: dirname(audioFile),
          artist,
          album,
          year: metadata.common.year,
          genre: metadata.common.genre?.[0],
          totalDiscs: metadata.common.disk.of || discNumber || 1,
          tracks: [],
        });
      }

      const albumEntry = albumMap.get(albumKey)!;
      albumEntry.totalDiscs = Math.max(
        albumEntry.totalDiscs,
        metadata.common.disk.of || discNumber || 1,
      );

      albumEntry.tracks.push({
        sourcePath: audioFile,
        sourceFileName: basename(audioFile),
        extension: extname(audioFile).toLowerCase(),
        discNumber,
        totalDiscs: albumEntry.totalDiscs,
        trackNumber: trackNumber || albumEntry.tracks.length + 1,
        title,
        artist: metadata.common.artist || artist,
        album,
        year: metadata.common.year,
        genre: metadata.common.genre?.[0],
      });
    } catch (error) {
      warnings.push(
        `Fell back to path-based metadata for ${audioFile}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      const albumKey = buildAlbumKey(inferred.artist, inferred.album);

      if (!albumMap.has(albumKey)) {
        albumMap.set(albumKey, {
          id: randomUUID(),
          sourcePath: dirname(audioFile),
          artist: inferred.artist,
          album: inferred.album,
          totalDiscs: inferred.discNumber,
          tracks: [],
        });
      }

      const albumEntry = albumMap.get(albumKey)!;
      albumEntry.totalDiscs = Math.max(albumEntry.totalDiscs, inferred.discNumber);
      albumEntry.tracks.push({
        sourcePath: audioFile,
        sourceFileName: basename(audioFile),
        extension: extname(audioFile).toLowerCase(),
        discNumber: inferred.discNumber,
        totalDiscs: albumEntry.totalDiscs,
        trackNumber: inferred.trackNumber,
        title: inferred.title,
        artist: inferred.artist,
        album: inferred.album,
      });
    }
  }

  return {
    albums: normalizeAlbumCollection([...albumMap.values()]),
    warnings,
    coveredAudioPaths: new Set<string>(),
  };
}

function findCanonicalTrack(
  release: CanonicalRelease | null,
  track: Pick<MetadataSourceTrack, 'discNumber' | 'trackNumber'>,
) {
  return release?.tracks.find(
    (candidate) =>
      candidate.discNumber === track.discNumber && candidate.trackNumber === track.trackNumber,
  );
}

function toMetadataSourceAlbum(album: ImportedAlbum): MetadataSourceAlbum {
  return {
    id: album.id,
    sourcePath: album.sourcePath,
    artist: album.artist,
    album: album.album,
    year: album.tracks.find((track) => track.sourceYear !== undefined)?.sourceYear ?? album.year,
    genre: album.tracks.find((track) => track.sourceGenre !== undefined)?.sourceGenre ?? album.genre,
    totalDiscs: album.totalDiscs,
    tracks: album.tracks.map((track) => ({
      sourcePath: track.sourcePath,
      sourceFileName: track.sourceFileName,
      extension: track.extension,
      discNumber: track.discNumber,
      trackNumber: track.trackNumber,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.sourceYear,
      genre: track.sourceGenre,
    })),
  };
}

function buildImportedAlbum(
  sourceAlbum: MetadataSourceAlbum,
  release: CanonicalRelease | null,
  metadataLookupError?: string,
): ImportedAlbum {
  const importedTracks = addTrackTotals(
    sourceAlbum.tracks.map((track) => {
      const canonicalTrack = findCanonicalTrack(release, track);
      const canonicalArtist = canonicalTrack?.artist || release?.artist || track.artist;
      const canonicalAlbum = release?.title || track.album;
      const canonicalTitle = canonicalTrack?.title || track.title;

      return {
        id: randomUUID(),
        sourcePath: track.sourcePath,
        sourceFileName: track.sourceFileName,
        extension: track.extension,
        discNumber: track.discNumber,
        totalDiscs: sourceAlbum.totalDiscs,
        trackNumber: track.trackNumber,
        totalTracks: 0,
        title: track.title,
        artist: track.artist,
        album: track.album,
        sourceYear: track.year,
        sourceGenre: track.genre,
        canonicalTitle,
        canonicalArtist,
        canonicalAlbum,
        year: release?.year ?? track.year ?? sourceAlbum.year,
        genre: track.genre ?? sourceAlbum.genre,
        destinationRelativePath: buildDestinationRelativePath({
          artist: canonicalArtist,
          album: canonicalAlbum,
          title: canonicalTitle,
          trackNumber: track.trackNumber,
          discNumber: track.discNumber,
          totalDiscs: sourceAlbum.totalDiscs,
          extension: track.extension,
        }),
      } satisfies ImportedTrack;
    }),
  );

  return {
    id: sourceAlbum.id,
    sourcePath: sourceAlbum.sourcePath,
    artist: sourceAlbum.artist,
    album: sourceAlbum.album,
    canonicalArtist: release?.artist || sourceAlbum.artist,
    canonicalAlbum: release?.title || sourceAlbum.album,
    year: release?.year ?? sourceAlbum.year,
    genre: sourceAlbum.genre,
    totalDiscs: sourceAlbum.totalDiscs,
    tracks: importedTracks,
    releaseMatch: buildReleaseMatch(release),
    metadataLookupError,
  };
}

function addTrackTotals(tracks: ImportedTrack[]): ImportedTrack[] {
  const perDiscCounts = new Map<number, number>();

  for (const track of tracks) {
    perDiscCounts.set(track.discNumber, (perDiscCounts.get(track.discNumber) ?? 0) + 1);
  }

  return tracks.map((track) => ({
    ...track,
    totalTracks: perDiscCounts.get(track.discNumber) ?? track.totalTracks,
  }));
}

export async function importSource(
  sourcePath: string,
  options: ImportSourceOptions = {},
): Promise<ImportResponse> {
  const resolvedSourcePath = resolve(sourcePath);
  const releaseLookup = options.releaseLookup ?? fetchCanonicalRelease;

  const reportProgress = async (update: OperationProgress) => {
    await options.onProgress?.(update);
  };

  await reportProgress({
    progress: 3,
    message: `Scanning ${resolvedSourcePath} for cue sheets and audio files`,
  });

  const cueScan = await scanCueAlbums(resolvedSourcePath);

  await reportProgress({
    progress: 18,
    message: cueScan.albums.length > 0
      ? `Mapped ${cueScan.albums.length} cue-driven album${cueScan.albums.length === 1 ? '' : 's'}`
      : 'No cue sheets found, falling back to audio tag scanning',
  });

  const taggedScan = await scanTaggedAudioAlbums(resolvedSourcePath, cueScan.coveredAudioPaths);
  const scanResult = {
    albums: normalizeAlbumCollection([...cueScan.albums, ...taggedScan.albums]),
    warnings: [...cueScan.warnings, ...taggedScan.warnings],
  };

  await reportProgress({
    progress: 35,
    message: `Found ${scanResult.albums.length} album${scanResult.albums.length === 1 ? '' : 's'} across nested folders`,
  });

  if (scanResult.albums.length === 0) {
    throw new Error('No supported audio files were found in the selected path.');
  }

  const warnings = [...scanResult.warnings];
  const albums: ImportedAlbum[] = [];
  const totalAlbums = scanResult.albums.length;

  for (const [albumIndex, localAlbum] of scanResult.albums.entries()) {
    let release: CanonicalRelease | null = null;
    let metadataLookupError: string | undefined;

    await reportProgress({
      progress: 40 + Math.round((albumIndex / totalAlbums) * 35),
      message: `Matching metadata for ${localAlbum.artist} - ${localAlbum.album}`,
    });

    try {
      release = await releaseLookup({
        artist: localAlbum.artist,
        album: localAlbum.album,
        totalDiscs: localAlbum.totalDiscs,
        year: localAlbum.year,
        tracks: localAlbum.tracks.map((track) => ({
          discNumber: track.discNumber,
          trackNumber: track.trackNumber,
          title: track.title,
        })),
      });
    } catch (error) {
      metadataLookupError = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(buildMetadataLookupFailureMessage(localAlbum.artist, localAlbum.album, metadataLookupError));
    }

    albums.push(buildImportedAlbum(localAlbum, release, metadataLookupError));

    await reportProgress({
      progress: 78 + Math.round(((albumIndex + 1) / totalAlbums) * 18),
      message: `Prepared preview for ${localAlbum.artist} - ${localAlbum.album}`,
    });
  }

  await reportProgress({
    progress: 100,
    message: `Preview ready for ${albums.length} album${albums.length === 1 ? '' : 's'}`,
  });

  return {
    sourcePath: resolvedSourcePath,
    albumCount: albums.length,
    trackCount: albums.reduce((count, album) => count + album.tracks.length, 0),
    albums,
    warnings,
  };
}

export async function retryMetadataForImportedAlbums(
  sourcePath: string,
  importedAlbums: ImportedAlbum[],
  options: ImportSourceOptions & { existingWarnings?: string[] } = {},
): Promise<ImportResponse> {
  const resolvedSourcePath = resolve(sourcePath);
  const releaseLookup = options.releaseLookup ?? fetchCanonicalRelease;
  const retryTargets = importedAlbums.filter((album) => album.metadataLookupError);
  const reportProgress = async (update: OperationProgress) => {
    await options.onProgress?.(update);
  };

  const warnings = (options.existingWarnings ?? []).filter(
    (warning) => !retryTargets.some((album) => warning.startsWith(buildMetadataLookupFailurePrefix(album.artist, album.album))),
  );

  if (retryTargets.length === 0) {
    await reportProgress({
      progress: 100,
      message: 'No failed metadata lookups needed a retry',
    });

    return {
      sourcePath: resolvedSourcePath,
      albumCount: importedAlbums.length,
      trackCount: importedAlbums.reduce((count, album) => count + album.tracks.length, 0),
      albums: importedAlbums,
      warnings,
    };
  }

  await reportProgress({
    progress: 5,
    message: `Retrying metadata for ${retryTargets.length} failed album${retryTargets.length === 1 ? '' : 's'}`,
  });

  const retriedAlbums = new Map<string, ImportedAlbum>();

  for (const [albumIndex, album] of retryTargets.entries()) {
    const sourceAlbum = toMetadataSourceAlbum(album);
    let release: CanonicalRelease | null = null;
    let metadataLookupError: string | undefined;

    await reportProgress({
      progress: 10 + Math.round((albumIndex / retryTargets.length) * 55),
      message: `Retrying metadata for ${album.artist} - ${album.album}`,
    });

    try {
      release = await releaseLookup({
        artist: sourceAlbum.artist,
        album: sourceAlbum.album,
        totalDiscs: sourceAlbum.totalDiscs,
        year: sourceAlbum.year,
        tracks: sourceAlbum.tracks.map((track) => ({
          discNumber: track.discNumber,
          trackNumber: track.trackNumber,
          title: track.title,
        })),
      });
    } catch (error) {
      metadataLookupError = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(buildMetadataLookupFailureMessage(album.artist, album.album, metadataLookupError));
    }

    retriedAlbums.set(album.id, buildImportedAlbum(sourceAlbum, release, metadataLookupError));

    await reportProgress({
      progress: 70 + Math.round(((albumIndex + 1) / retryTargets.length) * 25),
      message: metadataLookupError
        ? `Retry still failed for ${album.artist} - ${album.album}`
        : `Metadata refreshed for ${album.artist} - ${album.album}`,
    });
  }

  const albums = importedAlbums.map((album) => retriedAlbums.get(album.id) ?? album);

  await reportProgress({
    progress: 100,
    message: `Metadata retry complete for ${retryTargets.length} album${retryTargets.length === 1 ? '' : 's'}`,
  });

  return {
    sourcePath: resolvedSourcePath,
    albumCount: albums.length,
    trackCount: albums.reduce((count, album) => count + album.tracks.length, 0),
    albums,
    warnings,
  };
}