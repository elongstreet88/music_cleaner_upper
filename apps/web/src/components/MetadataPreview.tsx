import { useDeferredValue, useMemo, useState } from 'react';

import type { ImportResponse, OutputFormat } from '../api';
import { getPreviewRelativePath, getTrackChanges } from '../lib/preview';

interface MetadataPreviewProps {
  importResult: ImportResponse | null;
  outputFormat: OutputFormat;
  prefixTrackNumbers: boolean;
  outputFolder: string;
}

interface PreviewRow {
  id: string;
  artist: string;
  album: string;
  trackLabel: string;
  song: string;
  sourceFileName: string;
  outputRelativePath: string;
  changes: ReturnType<typeof getTrackChanges>;
  searchText: string;
}

function buildOutputRelativePath(outputFolder: string, relativePath: string): string {
  const trimmedOutputFolder = outputFolder.trim();
  if (trimmedOutputFolder.length === 0) {
    return relativePath;
  }

  return `${trimmedOutputFolder.replace(/\/+$/, '')}/${relativePath}`;
}

function renderValue(value: string): string {
  return value.trim().length > 0 ? value : 'Empty';
}

export function MetadataPreview({ importResult, outputFormat, prefixTrackNumbers, outputFolder }: MetadataPreviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const rows = useMemo<PreviewRow[]>(() => {
    return (importResult?.albums ?? []).flatMap((album) => {
      return album.tracks.map((track) => {
        const changes = getTrackChanges(track, outputFormat, prefixTrackNumbers);
        const outputRelativePath = buildOutputRelativePath(outputFolder, getPreviewRelativePath(track, outputFormat, prefixTrackNumbers));
        const trackLabel = `${track.discNumber}.${String(track.trackNumber).padStart(2, '0')}`;

        return {
          id: track.id,
          artist: album.canonicalArtist,
          album: album.canonicalAlbum,
          trackLabel,
          song: track.canonicalTitle,
          sourceFileName: track.sourceFileName,
          outputRelativePath,
          changes,
          searchText: [
            album.canonicalArtist,
            album.canonicalAlbum,
            track.canonicalTitle,
            track.title,
            trackLabel,
            track.sourceFileName,
            outputRelativePath,
            ...changes.flatMap((change) => [change.field, change.before, change.after]),
          ]
            .join(' ')
            .toLowerCase(),
        } satisfies PreviewRow;
      });
    });
  }, [importResult, outputFolder, outputFormat, prefixTrackNumbers]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return rows;
    }

    return rows.filter((row) => row.searchText.includes(normalizedSearch));
  }, [rows, deferredSearchQuery]);

  const changedRowCount = filteredRows.filter((row) => row.changes.length > 0).length;

  if (!importResult) {
    return (
      <div className="rounded-[26px] border border-dashed border-base-300 bg-base-200/35 p-6 text-sm text-base-content/60">
        Pull metadata in Step 2 to populate the review table.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-base-300 bg-base-100">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-base-300 px-4 py-3">
        <label className="form-control w-full max-w-md">
          <div className="label py-0">
            <span className="label-text text-[11px] uppercase tracking-[0.14em] text-base-content/45">Search</span>
          </div>
          <input
            className="input input-bordered input-sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search artist, album, song, file name, or change text"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-base-content/55">
          <span>{filteredRows.length} of {rows.length} tracks shown</span>
          <span className="badge badge-info badge-outline badge-sm">{changedRowCount} changed</span>
        </div>
      </div>

      <div className="min-h-0 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-base-200/96 backdrop-blur">
            <tr className="border-b border-base-300 text-left text-[11px] uppercase tracking-[0.14em] text-base-content/45">
              <th className="px-3 py-2 font-medium">Artist</th>
              <th className="px-3 py-2 font-medium">Album</th>
              <th className="px-3 py-2 font-medium">Song</th>
              <th className="px-3 py-2 font-medium">Changes</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row) => (
              <tr className="border-b border-base-300/70 align-top" key={row.id}>
                <td className="px-3 py-2.5 text-[11px] font-semibold leading-5 text-base-content">{row.artist}</td>
                <td className="px-3 py-2.5 text-[11px] leading-5 text-base-content/80">{row.album}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] leading-5 text-base-content">
                    <span className="badge badge-ghost badge-xs">{row.trackLabel}</span>
                    <span className="font-medium">{row.song}</span>
                  </div>
                  <div className="mt-1 break-all font-mono text-[10px] leading-4 text-base-content/45">{row.sourceFileName}</div>
                  <div className="mt-1 break-all font-mono text-[10px] leading-4 text-base-content/35">{row.outputRelativePath}</div>
                </td>
                <td className="px-3 py-2.5">
                  {row.changes.length === 0 ? (
                    <span className="inline-flex rounded-full border border-base-300 bg-base-200/60 px-2 py-1 text-[10px] leading-4 text-base-content/45">No changes</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {row.changes.map((change) => (
                        <span className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-base-300 bg-base-200/60 px-2 py-1 text-[10px] leading-4" key={`${row.id}-${change.field}`}>
                          <span className="font-semibold uppercase tracking-[0.08em] text-base-content/55">{change.field}:</span>
                          <span className="text-error/80 line-through">{renderValue(change.before)}</span>
                          <span className="text-base-content/30">-&gt;</span>
                          <span className="text-success">{renderValue(change.after)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredRows.length === 0 ? (
          <div className="p-6 text-center text-sm text-base-content/55">No tracks matched that search.</div>
        ) : null}
      </div>
    </div>
  );
}