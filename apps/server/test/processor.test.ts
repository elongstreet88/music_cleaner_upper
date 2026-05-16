import { describe, expect, it, vi } from 'vitest';

import { buildFfmpegArguments, processAlbums } from '../src/lib/processor.js';
import type { ImportedAlbum } from '../src/lib/types.js';

describe('processAlbums', () => {
  it('builds destination paths and invokes the command runner for each track copy', async () => {
    const commandRunner = vi.fn(async () => undefined);
    const albums: ImportedAlbum[] = [
      {
        id: 'album-1',
        sourcePath: '/tmp/source',
        artist: 'Pink Floyd',
        album: 'The Wall',
        canonicalArtist: 'Pink Floyd',
        canonicalAlbum: 'The Wall',
        totalDiscs: 1,
        releaseMatch: null,
        tracks: [
          {
            id: 'track-1',
            sourcePath: '/tmp/source/01. In The Flesh_.flac',
            sourceFileName: '01. In The Flesh_.flac',
            extension: '.flac',
            discNumber: 1,
            totalDiscs: 1,
            trackNumber: 1,
            totalTracks: 13,
            title: 'In The Flesh?',
            artist: 'Pink Floyd',
            album: 'The Wall',
            canonicalTitle: 'In The Flesh?',
            canonicalArtist: 'Pink Floyd',
            canonicalAlbum: 'The Wall',
            destinationRelativePath: 'Pink Floyd/The Wall/01 - In The Flesh.flac',
            year: 1979,
            genre: 'Progressive Rock',
          },
        ],
      },
    ];

    const result = await processAlbums(albums, '/tmp/output', { commandRunner });

    expect(result.outputFormat).toBe('source');
    expect(result.copiedCount).toBe(1);
    expect(result.files[0]?.destinationPath).toBe('/tmp/output/Pink Floyd/The Wall/01 - In The Flesh.flac');
    expect(commandRunner).toHaveBeenCalledTimes(1);
  });

  it('converts destination paths to mp3 when mp3 output is requested', async () => {
    const commandRunner = vi.fn(async () => undefined);
    const albums: ImportedAlbum[] = [
      {
        id: 'album-1',
        sourcePath: '/tmp/source',
        artist: 'Pink Floyd',
        album: 'The Wall',
        canonicalArtist: 'Pink Floyd',
        canonicalAlbum: 'The Wall',
        totalDiscs: 1,
        releaseMatch: null,
        tracks: [
          {
            id: 'track-1',
            sourcePath: '/tmp/source/01. In The Flesh_.flac',
            sourceFileName: '01. In The Flesh_.flac',
            extension: '.flac',
            discNumber: 1,
            totalDiscs: 1,
            trackNumber: 1,
            totalTracks: 13,
            title: 'In The Flesh?',
            artist: 'Pink Floyd',
            album: 'The Wall',
            canonicalTitle: 'In The Flesh?',
            canonicalArtist: 'Pink Floyd',
            canonicalAlbum: 'The Wall',
            destinationRelativePath: 'Pink Floyd/The Wall/01 - In The Flesh.flac',
            year: 1979,
            genre: 'Progressive Rock',
          },
        ],
      },
    ];

    const result = await processAlbums(albums, '/tmp/output', {
      commandRunner,
      outputFormat: 'mp3-320',
    });

    expect(result.outputFormat).toBe('mp3-320');
    expect(result.files[0]?.relativePath).toBe('Pink Floyd/The Wall/01 - In The Flesh.mp3');
    expect(result.files[0]?.destinationPath).toBe('/tmp/output/Pink Floyd/The Wall/01 - In The Flesh.mp3');
    expect(commandRunner).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      '/tmp/output/Pink Floyd/The Wall/01 - In The Flesh.mp3',
      'mp3-320',
    );
  });

  it('can drop track number prefixes from processed filenames', async () => {
    const commandRunner = vi.fn(async () => undefined);
    const albums: ImportedAlbum[] = [
      {
        id: 'album-1',
        sourcePath: '/tmp/source',
        artist: 'Pink Floyd',
        album: 'The Wall',
        canonicalArtist: 'Pink Floyd',
        canonicalAlbum: 'The Wall',
        totalDiscs: 1,
        releaseMatch: null,
        tracks: [
          {
            id: 'track-1',
            sourcePath: '/tmp/source/01. In The Flesh_.flac',
            sourceFileName: '01. In The Flesh_.flac',
            extension: '.flac',
            discNumber: 1,
            totalDiscs: 1,
            trackNumber: 1,
            totalTracks: 13,
            title: 'In The Flesh?',
            artist: 'Pink Floyd',
            album: 'The Wall',
            canonicalTitle: 'In The Flesh?',
            canonicalArtist: 'Pink Floyd',
            canonicalAlbum: 'The Wall',
            destinationRelativePath: 'Pink Floyd/The Wall/01 - In The Flesh.flac',
            year: 1979,
            genre: 'Progressive Rock',
          },
        ],
      },
    ];

    const result = await processAlbums(albums, '/tmp/output', {
      commandRunner,
      outputFormat: 'mp3-320',
      prefixTrackNumbers: false,
    });

    expect(result.files[0]?.relativePath).toBe('Pink Floyd/The Wall/In The Flesh.mp3');
    expect(result.files[0]?.destinationPath).toBe('/tmp/output/Pink Floyd/The Wall/In The Flesh.mp3');
    expect(commandRunner).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      '/tmp/output/Pink Floyd/The Wall/In The Flesh.mp3',
      'mp3-320',
    );
  });

  it('preserves embedded artwork streams when converting to mp3', () => {
    const args = buildFfmpegArguments(
      {
        id: 'track-1',
        sourcePath: '/tmp/source/01. In The Flesh_.flac',
        sourceFileName: '01. In The Flesh_.flac',
        extension: '.flac',
        discNumber: 1,
        totalDiscs: 1,
        trackNumber: 1,
        totalTracks: 13,
        title: 'In The Flesh?',
        artist: 'Pink Floyd',
        album: 'The Wall',
        canonicalTitle: 'In The Flesh?',
        canonicalArtist: 'Pink Floyd',
        canonicalAlbum: 'The Wall',
        destinationRelativePath: 'Pink Floyd/The Wall/01 - In The Flesh.flac',
        year: 1979,
        genre: 'Progressive Rock',
      },
      '/tmp/output/Pink Floyd/The Wall/01 - In The Flesh.mp3',
      'mp3-320',
    );

    expect(args).toContain('-map');
    expect(args).toContain('0');
    expect(args).toContain('-codec:v');
    expect(args).toContain('copy');
    expect(args).not.toContain('-vn');
  });
});