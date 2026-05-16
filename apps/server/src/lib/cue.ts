import { dirname, resolve } from 'node:path';

import { stripDiscSuffix } from './filesystem.js';

interface ParsedCueTrack {
  trackNumber: number;
  title: string;
  artist: string;
  sourcePath: string;
  sourceFileName: string;
}

export interface ParsedCueAlbum {
  sourceDirectory: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  discNumber: number;
  totalDiscs: number;
  tracks: ParsedCueTrack[];
}

function extractQuotedValue(line: string): string {
  const match = line.match(/"([^"]*)"/);
  return match?.[1]?.trim() ?? '';
}

export function parseCueSheet(cuePath: string, source: string): ParsedCueAlbum {
  const cueDirectory = dirname(cuePath);
  const lines = source.split(/\r?\n/);

  let albumArtist = '';
  let albumTitle = '';
  let year: number | undefined;
  let genre: string | undefined;
  let discNumber = 1;
  let totalDiscs = 1;
  let currentFileName = '';
  let currentTrack:
    | {
        trackNumber: number;
        title: string;
        artist: string;
        sourceFileName: string;
      }
    | undefined;
  const tracks: ParsedCueTrack[] = [];

  const pushCurrentTrack = () => {
    if (!currentTrack) {
      return;
    }

    const resolvedTrackPath = resolve(cueDirectory, currentTrack.sourceFileName || currentFileName);

    tracks.push({
      trackNumber: currentTrack.trackNumber,
      title: currentTrack.title,
      artist: currentTrack.artist || albumArtist,
      sourceFileName: currentTrack.sourceFileName || currentFileName,
      sourcePath: resolvedTrackPath,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    if (line.startsWith('REM DATE ')) {
      const parsedYear = Number.parseInt(line.replace('REM DATE ', '').trim(), 10);
      if (!Number.isNaN(parsedYear)) {
        year = parsedYear;
      }
      continue;
    }

    if (line.startsWith('REM DISCNUMBER ')) {
      const parsedDiscNumber = Number.parseInt(line.replace('REM DISCNUMBER ', '').trim(), 10);
      if (!Number.isNaN(parsedDiscNumber)) {
        discNumber = parsedDiscNumber;
      }
      continue;
    }

    if (line.startsWith('REM TOTALDISCS ')) {
      const parsedDiscTotal = Number.parseInt(line.replace('REM TOTALDISCS ', '').trim(), 10);
      if (!Number.isNaN(parsedDiscTotal)) {
        totalDiscs = parsedDiscTotal;
      }
      continue;
    }

    if (line.startsWith('REM GENRE ')) {
      genre = extractQuotedValue(line) || line.replace('REM GENRE ', '').trim();
      continue;
    }

    if (line.startsWith('FILE ')) {
      currentFileName = extractQuotedValue(line);
      continue;
    }

    if (line.startsWith('TRACK ')) {
      pushCurrentTrack();

      const parsedTrackNumber = Number.parseInt(line.slice(6, 8), 10);
      currentTrack = {
        trackNumber: Number.isNaN(parsedTrackNumber) ? tracks.length + 1 : parsedTrackNumber,
        title: '',
        artist: albumArtist,
        sourceFileName: currentFileName,
      };
      continue;
    }

    if (line.startsWith('INDEX 01') && currentTrack) {
      currentTrack.sourceFileName = currentFileName;
      continue;
    }

    if (line.startsWith('PERFORMER ')) {
      const performer = extractQuotedValue(line);

      if (currentTrack) {
        currentTrack.artist = performer || currentTrack.artist;
      } else {
        albumArtist = performer;
      }

      continue;
    }

    if (line.startsWith('TITLE ')) {
      const title = extractQuotedValue(line);

      if (currentTrack) {
        currentTrack.title = title || currentTrack.title;
      } else {
        albumTitle = title;
      }
    }
  }

  pushCurrentTrack();

  return {
    sourceDirectory: cueDirectory,
    artist: albumArtist,
    album: stripDiscSuffix(albumTitle, discNumber),
    year,
    genre,
    discNumber,
    totalDiscs,
    tracks,
  };
}