import type { ImportedTrack, OutputFormat } from '../api';

export interface TrackChange {
  field: string;
  before: string;
  after: string;
}

function formatValue(value?: string | number): string {
  if (value === undefined || value === null || value === '') {
    return '—';
  }

  return String(value);
}

export function stripTrackNumberPrefix(relativePath: string): string {
  const segments = relativePath.split('/');
  const fileName = segments.at(-1);

  if (!fileName) {
    return relativePath;
  }

  segments[segments.length - 1] = fileName.replace(/^\d{1,3}\s*-\s*/, '');
  return segments.join('/');
}

export function getPreviewRelativePath(
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

  const extensionIndex = baseRelativePath.lastIndexOf('.');
  return extensionIndex >= 0 ? `${baseRelativePath.slice(0, extensionIndex)}.mp3` : `${baseRelativePath}.mp3`;
}

function getPreviewFileName(track: ImportedTrack, outputFormat: OutputFormat, prefixTrackNumbers: boolean): string {
  return getPreviewRelativePath(track, outputFormat, prefixTrackNumbers).split('/').at(-1) ?? track.sourceFileName;
}

export function getPreviewFormat(track: ImportedTrack, outputFormat: OutputFormat): string {
  if (outputFormat === 'mp3-320') {
    return 'MP3 320';
  }

  return track.extension.replace('.', '').toUpperCase();
}

export function getTrackChanges(
  track: ImportedTrack,
  outputFormat: OutputFormat,
  prefixTrackNumbers: boolean,
): TrackChange[] {
  const changes: TrackChange[] = [];

  const maybeAddChange = (field: string, before?: string | number, after?: string | number) => {
    const normalizedBefore = formatValue(before);
    const normalizedAfter = formatValue(after);

    if (normalizedBefore !== normalizedAfter) {
      changes.push({
        field,
        before: normalizedBefore,
        after: normalizedAfter,
      });
    }
  };

  maybeAddChange('Title', track.title, track.canonicalTitle);
  maybeAddChange('Artist', track.artist, track.canonicalArtist);
  maybeAddChange('Album', track.album, track.canonicalAlbum);
  maybeAddChange('Album Artist', track.artist, track.canonicalArtist);
  maybeAddChange('Year', track.sourceYear, track.year);
  maybeAddChange('Genre', track.sourceGenre, track.genre);
  maybeAddChange('File', track.sourceFileName, getPreviewFileName(track, outputFormat, prefixTrackNumbers));
  maybeAddChange('Format', track.extension.replace('.', '').toUpperCase(), getPreviewFormat(track, outputFormat));

  return changes;
}