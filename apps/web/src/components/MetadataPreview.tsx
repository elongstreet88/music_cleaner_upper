import { useDeferredValue, useMemo, useState } from 'react';

import type { ImportResponse, OutputFormat } from '../api';
import { getPreviewRelativePath, getTrackChanges } from '../lib/preview';

interface MetadataPreviewProps {
  importResult: ImportResponse | null;
  outputFormat: OutputFormat;
  prefixTrackNumbers: boolean;
  outputFolder: string;
}

interface TrackReviewRow {
  id: string;
  trackLabel: string;
  title: string;
  sourceFileName: string;
  outputRelativePath: string;
  outputFullPath: string;
  changes: ReturnType<typeof getTrackChanges>;
  searchText: string;
}

interface AlbumReviewGroup {
  id: string;
  artistAlbum: string;
  sourceArtistAlbum: string;
  matched: boolean;
  metadataLookupError?: string;
  changedTrackCount: number;
  tracks: TrackReviewRow[];
  searchText: string;
}

function buildFullOutputPath(outputFolder: string, relativePath: string): string {
  const trimmedOutputFolder = outputFolder.trim();
  if (trimmedOutputFolder.length === 0) {
    return relativePath;
  }

  return `${trimmedOutputFolder.replace(/\/+$/, '')}/${relativePath}`;
}

export function MetadataPreview({ importResult, outputFormat, prefixTrackNumbers, outputFolder }: MetadataPreviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const albumGroups = useMemo<AlbumReviewGroup[]>(() => {
    return (importResult?.albums ?? []).map((album) => {
      const tracks = album.tracks.map((track) => {
        const changes = getTrackChanges(track, outputFormat, prefixTrackNumbers);
        const outputRelativePath = getPreviewRelativePath(track, outputFormat, prefixTrackNumbers);
        const outputFullPath = buildFullOutputPath(outputFolder, outputRelativePath);
        const trackLabel = `${track.discNumber}.${String(track.trackNumber).padStart(2, '0')}`;
        const searchText = [
          album.canonicalArtist,
          album.canonicalAlbum,
          album.artist,
          album.album,
          trackLabel,
          track.title,
          track.canonicalTitle,
          track.sourceFileName,
          outputRelativePath,
          outputFullPath,
          ...changes.flatMap((change) => [change.field, change.before, change.after]),
        ]
          .join(' ')
          .toLowerCase();

        return {
          id: track.id,
          trackLabel,
          title: track.canonicalTitle,
          sourceFileName: track.sourceFileName,
          outputRelativePath,
          outputFullPath,
          changes,
          searchText,
        } satisfies TrackReviewRow;
      });

      return {
        id: album.id,
        artistAlbum: `${album.canonicalArtist} / ${album.canonicalAlbum}`,
        sourceArtistAlbum: `${album.artist} / ${album.album}`,
        matched: Boolean(album.releaseMatch),
        metadataLookupError: album.metadataLookupError,
        changedTrackCount: tracks.filter((track) => track.changes.length > 0).length,
        tracks,
        searchText: [
          album.canonicalArtist,
          album.canonicalAlbum,
          album.artist,
          album.album,
          album.metadataLookupError ?? '',
          ...tracks.map((track) => track.searchText),
        ]
          .join(' ')
          .toLowerCase(),
      } satisfies AlbumReviewGroup;
    });
  }, [importResult, outputFolder, outputFormat, prefixTrackNumbers]);

  const filteredAlbums = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return albumGroups;
    }

    return albumGroups
      .map((album) => ({
        ...album,
        tracks: album.tracks.filter((track) => track.searchText.includes(normalizedSearch)),
      }))
      .filter((album) => album.searchText.includes(normalizedSearch) || album.tracks.length > 0);
  }, [albumGroups, deferredSearchQuery]);

  const visibleTrackCount = filteredAlbums.reduce((count, album) => count + album.tracks.length, 0);
  const changedTrackCount = albumGroups.reduce((count, album) => count + album.changedTrackCount, 0);

  if (!importResult) {
    return (
      <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-6 text-sm text-base-content/60">
        Pull metadata to populate album groups. Each album shows only the fields that will actually change plus the exact destination path for every track.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-base-300 p-4">
        <label className="form-control w-full max-w-xl">
          <div className="label py-0">
            <span className="label-text text-xs">Search albums or tracks</span>
          </div>
          <input
            className="input input-bordered input-sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search artist, album, track, source file, changed value, or destination"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
          <span>{filteredAlbums.length} of {albumGroups.length} albums shown</span>
          <span>{visibleTrackCount} track{visibleTrackCount === 1 ? '' : 's'} visible</span>
          <span className="badge badge-info badge-outline badge-sm">{changedTrackCount} changed tracks</span>
        </div>
      </div>

      <div className="max-h-[48rem] space-y-4 overflow-auto p-4">
        {filteredAlbums.map((album) => (
          <section className="rounded-box border border-base-300 bg-base-200/50" key={album.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{album.artistAlbum}</h3>
                  <span className={`badge badge-sm ${album.matched ? 'badge-success badge-outline' : 'badge-warning badge-outline'}`}>
                    {album.matched ? 'matched' : 'local'}
                  </span>
                  <span className="badge badge-ghost badge-sm">{album.tracks.length} tracks</span>
                  <span className="badge badge-info badge-outline badge-sm">{album.changedTrackCount} changed</span>
                </div>
                {album.sourceArtistAlbum !== album.artistAlbum ? (
                  <p className="mt-1 text-xs text-base-content/55">Source tags: {album.sourceArtistAlbum}</p>
                ) : null}
              </div>

              {album.metadataLookupError ? (
                <div className="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-content/80">
                  Metadata lookup still failing: {album.metadataLookupError}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 p-4">
              {album.tracks.map((track) => (
                <article className="rounded-box border border-base-300 bg-base-100/80 p-4" key={track.id}>
                  <div className="grid gap-4 xl:grid-cols-[0.9fr_1.2fr_1.2fr]">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-semibold">{track.trackLabel} · {track.title}</div>
                        <div className="mt-2 rounded-box border border-base-300 bg-base-200/50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Source file</div>
                          <div className="mt-1 break-all font-mono text-xs text-base-content/75">{track.sourceFileName}</div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Source file changes</div>
                      {track.changes.length === 0 ? (
                        <div className="mt-2 rounded-box border border-dashed border-base-300 bg-base-200/30 px-4 py-3 text-sm text-base-content/55">
                          No metadata changes for this track.
                        </div>
                      ) : (
                        <div className="mt-2 space-y-3">
                          {track.changes.map((change) => (
                            <div className="rounded-box border border-base-300 bg-base-200/45 p-3" key={`${track.id}-${change.field}`}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="badge badge-outline badge-primary badge-sm">{change.field}</span>
                                <span className="text-xs text-base-content/45">Only shown because it is changing</span>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Current</div>
                                  <div className="mt-1 break-words text-sm text-error/80">{change.before}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Will write</div>
                                  <div className="mt-1 break-words text-sm text-success">{change.after}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Destination</div>
                      <div className="mt-2 rounded-box border border-success/20 bg-success/5 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Full destination</div>
                        <div className="mt-2 break-all font-mono text-sm leading-6 text-base-content">{track.outputFullPath}</div>
                        <div className="mt-3 border-t border-success/10 pt-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-base-content/45">Relative inside output folder</div>
                          <div className="mt-1 break-all font-mono text-xs text-base-content/65">{track.outputRelativePath}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        {filteredAlbums.length === 0 ? (
          <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-6 text-center text-sm text-base-content/55">
            No albums or tracks matched that search.
          </div>
        ) : null}
      </div>
    </div>
  );
}