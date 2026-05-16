import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { importSource, retryMetadataForImportedAlbums } from '../src/lib/importer.js';
import type { ImportedAlbum } from '../src/lib/types.js';
import { REPO_ROOT, SAMPLE_SOURCE_PATH } from '../src/lib/paths.js';

describe('importSource', () => {
  it('imports the sample album and builds canonical destination paths', async () => {
    const result = await importSource(SAMPLE_SOURCE_PATH, {
      releaseLookup: async () => ({
        id: 'sample-release',
        title: 'The Wall',
        artist: 'Pink Floyd',
        score: 100,
        year: 1979,
        sourceUrl: 'https://musicbrainz.org/release/sample-release',
        tracks: [
          { discNumber: 1, trackNumber: 1, title: 'In The Flesh?', artist: 'Pink Floyd' },
          { discNumber: 2, trackNumber: 13, title: 'Outside the Wall', artist: 'Pink Floyd' },
        ],
      }),
    });

    expect(result.albumCount).toBe(1);
    expect(result.trackCount).toBe(26);
    expect(result.albums[0]?.canonicalAlbum).toBe('The Wall');
    expect(result.albums[0]?.tracks[0]?.canonicalTitle).toBe('In The Flesh?');
    expect(result.albums[0]?.tracks[0]?.destinationRelativePath).toBe(
      'Pink Floyd/The Wall/Disc 1/01 - In The Flesh.flac',
    );
    expect(result.albums[0]?.tracks.at(-1)?.canonicalTitle).toBe('Outside the Wall');
  });

  it('falls back to nested path metadata when tags are missing or incomplete', async () => {
    const result = await importSource(resolve(REPO_ROOT, 'samples', 'Imagine Dragons', 'Mercury – Acts 1 & 2'), {
      releaseLookup: async () => null,
    });

    expect(result.albums).toHaveLength(1);
    expect(result.albums[0]?.artist).toBe('Imagine Dragons');
    expect(result.albums[0]?.album).toBe('Mercury – Acts 1 & 2');
    expect(result.albums[0]?.tracks.some((track) => track.title === 'I’m Happy')).toBe(true);
  });

  it('matches tagged files even when the source filenames are junk', async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), 'music-cleaner-upper-bad-names-'));
    const messyDropPath = resolve(tempRoot, 'downloads', 'totally-unsorted-drop');

    try {
      await mkdir(messyDropPath, { recursive: true });
      await symlink(
        resolve(SAMPLE_SOURCE_PATH, 'CD 1', '01. In The Flesh_.flac'),
        resolve(messyDropPath, 'zzz__track-one-final-FIXED-v2.flac'),
      );
      await symlink(
        resolve(SAMPLE_SOURCE_PATH, 'CD 1', '02. The Thin Ice.flac'),
        resolve(messyDropPath, 'random-rip-name-do-not-keep.flac'),
      );

      const result = await importSource(tempRoot, {
        releaseLookup: async () => null,
      });

      expect(result.albumCount).toBe(1);
      expect(result.trackCount).toBe(2);
      expect(result.warnings).toEqual([]);
      expect(result.albums[0]?.artist).toBe('Pink Floyd');
      expect(result.albums[0]?.tracks[0]?.sourceFileName).toBe('zzz__track-one-final-FIXED-v2.flac');
      expect(result.albums[0]?.tracks[0]?.canonicalTitle).toBe('In The Flesh?');
      expect(result.albums[0]?.tracks[0]?.destinationRelativePath).toContain('01 - In The Flesh.flac');
      expect(result.albums[0]?.tracks[1]?.sourceFileName).toBe('random-rip-name-do-not-keep.flac');
      expect(result.albums[0]?.tracks[1]?.canonicalTitle).toBe('The Thin Ice');
      expect(result.albums[0]?.tracks[1]?.destinationRelativePath).toContain('02 - The Thin Ice.flac');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('imports nested albums from a higher-level folder recursively', async () => {
    const tempRoot = await mkdtemp(resolve(tmpdir(), 'music-cleaner-upper-nested-import-'));
    const nestedPinkFloydPath = resolve(tempRoot, 'drop-zone', 'batch-a', 'pink-floyd', 'deep-folder');
    const nestedTsoPath = resolve(tempRoot, 'drop-zone', 'batch-b', 'holiday', 'tso');

    try {
      await mkdir(nestedPinkFloydPath, { recursive: true });
      await mkdir(nestedTsoPath, { recursive: true });

      await symlink(
        resolve(SAMPLE_SOURCE_PATH, 'CD 1', '01. In The Flesh_.flac'),
        resolve(nestedPinkFloydPath, 'bad-name-1.flac'),
      );
      await symlink(
        resolve(SAMPLE_SOURCE_PATH, 'CD 1', '02. The Thin Ice.flac'),
        resolve(nestedPinkFloydPath, 'bad-name-2.flac'),
      );
      await symlink(
        resolve(REPO_ROOT, 'samples', 'Trans‐Siberian Orchestra', 'The Lost Christmas Eve', '01 Faith Noel.mp3'),
        resolve(nestedTsoPath, 'drop-a.mp3'),
      );
      await symlink(
        resolve(REPO_ROOT, 'samples', 'Trans‐Siberian Orchestra', 'The Lost Christmas Eve', '02 The Lost Christmas Eve.mp3'),
        resolve(nestedTsoPath, 'drop-b.mp3'),
      );

      const result = await importSource(tempRoot, {
        releaseLookup: async () => null,
      });

      expect(result.albumCount).toBe(2);
      expect(result.trackCount).toBe(4);
      expect(result.albums.map((album) => `${album.artist}::${album.album}`).sort()).toEqual([
        'Pink Floyd::The Wall',
        'Trans‐Siberian Orchestra::The Lost Christmas Eve',
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('retries metadata only for albums that previously failed lookup', async () => {
    const albums: ImportedAlbum[] = [
      {
        id: 'failed-album',
        sourcePath: '/tmp/backstreet-boys',
        artist: 'Backstreet Boys',
        album: 'Millennium',
        canonicalArtist: 'Backstreet Boys',
        canonicalAlbum: 'Millennium',
        year: 1999,
        totalDiscs: 1,
        releaseMatch: null,
        metadataLookupError: 'MusicBrainz request failed with 503',
        tracks: [
          {
            id: 'failed-track-1',
            sourcePath: '/tmp/backstreet-boys/01 - I Want It That Way.mp3',
            sourceFileName: '01 - I Want It That Way.mp3',
            extension: '.mp3',
            discNumber: 1,
            totalDiscs: 1,
            trackNumber: 1,
            totalTracks: 12,
            title: 'I Want It That Way',
            artist: 'Backstreet Boys',
            album: 'Millennium',
            sourceYear: 1999,
            sourceGenre: 'Pop',
            canonicalTitle: 'I Want It That Way',
            canonicalArtist: 'Backstreet Boys',
            canonicalAlbum: 'Millennium',
            year: 1999,
            genre: 'Pop',
            destinationRelativePath: 'Backstreet Boys/Millennium/01 - I Want It That Way.mp3',
          },
        ],
      },
      {
        id: 'good-album',
        sourcePath: '/tmp/pink-floyd',
        artist: 'Pink Floyd',
        album: 'The Wall',
        canonicalArtist: 'Pink Floyd',
        canonicalAlbum: 'The Wall',
        year: 1979,
        totalDiscs: 1,
        releaseMatch: {
          id: 'existing-release',
          score: 100,
          title: 'The Wall',
          artist: 'Pink Floyd',
          year: 1979,
          sourceUrl: 'https://musicbrainz.org/release/existing-release',
        },
        tracks: [
          {
            id: 'good-track-1',
            sourcePath: '/tmp/pink-floyd/01 - In the Flesh.flac',
            sourceFileName: '01 - In the Flesh.flac',
            extension: '.flac',
            discNumber: 1,
            totalDiscs: 1,
            trackNumber: 1,
            totalTracks: 13,
            title: 'In The Flesh?',
            artist: 'Pink Floyd',
            album: 'The Wall',
            sourceYear: 1979,
            sourceGenre: 'Progressive Rock',
            canonicalTitle: 'In The Flesh?',
            canonicalArtist: 'Pink Floyd',
            canonicalAlbum: 'The Wall',
            year: 1979,
            genre: 'Progressive Rock',
            destinationRelativePath: 'Pink Floyd/The Wall/01 - In The Flesh.flac',
          },
        ],
      },
    ];

    const result = await retryMetadataForImportedAlbums('/tmp/source', albums, {
      existingWarnings: [
        'Metadata lookup failed for Backstreet Boys - Millennium: MusicBrainz request failed with 503',
        'Some unrelated warning',
      ],
      releaseLookup: async ({ artist, album }) => {
        expect(artist).toBe('Backstreet Boys');
        expect(album).toBe('Millennium');

        return {
          id: 'millennium-release',
          title: 'Millennium',
          artist: 'Backstreet Boys',
          score: 95,
          year: 1999,
          sourceUrl: 'https://musicbrainz.org/release/millennium-release',
          tracks: [{ discNumber: 1, trackNumber: 1, title: 'I Want It That Way', artist: 'Backstreet Boys' }],
        };
      },
    });

    expect(result.albumCount).toBe(2);
    expect(result.warnings).toEqual(['Some unrelated warning']);
    expect(result.albums[0]?.metadataLookupError).toBeUndefined();
    expect(result.albums[0]?.releaseMatch?.id).toBe('millennium-release');
    expect(result.albums[1]?.releaseMatch?.id).toBe('existing-release');
  });
});