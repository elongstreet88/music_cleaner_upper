import { startTransition, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';

import {
  getConfig,
  getJob,
  saveMetadataProvider,
  saveOutputFolder,
  startImportJob,
  startRetryMetadataJob,
  startProcessJob,
  type ImportResponse,
  type LibraryJobState,
  type MetadataProvider,
  type OutputFormat,
  type ProcessResponse,
} from '../api';
import { JobStatusPanel } from '../components/JobStatusPanel';
import { MetadataPreview } from '../components/MetadataPreview';
import { PathPicker } from '../components/PathPicker';
import { getTrackChanges } from '../lib/preview';
import { Route as RootRoute } from './__root';

const themes = ['dim', 'business', 'night', 'coffee', 'nord', 'emerald', 'synthwave'] as const;
type ThemeName = (typeof themes)[number];

const themeStorageKey = 'music-cleaner-upper-theme';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: DashboardPage,
});

function getOutputFormatLabel(outputFormat: OutputFormat): string {
  return outputFormat === 'mp3-320' ? 'MP3 320 kbps' : 'Original format';
}

function getMetadataProviderLabel(metadataProvider: MetadataProvider): string {
  return metadataProvider === 'local-only' ? 'Local tags only' : 'MusicBrainz';
}

function getFileNamingLabel(prefixTrackNumbers: boolean): string {
  return prefixTrackNumbers ? 'Track number + title' : 'Title only';
}

function getStepBadge(stepNumber: number): string {
  return `Step ${stepNumber}`;
}

function getThemeFromStorage(): ThemeName {
  if (typeof window === 'undefined') {
    return 'dim';
  }

  const savedTheme = window.localStorage.getItem(themeStorageKey);
  if (savedTheme && themes.includes(savedTheme as ThemeName)) {
    return savedTheme as ThemeName;
  }

  return 'dim';
}

function DashboardPage() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
  });

  const [sourcePath, setSourcePath] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [metadataProvider, setMetadataProvider] = useState<MetadataProvider>('musicbrainz');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('source');
  const [prefixTrackNumbers, setPrefixTrackNumbers] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => getThemeFromStorage());
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [previewContext, setPreviewContext] = useState<{ sourcePath: string; metadataProvider: MetadataProvider } | null>(null);
  const [pendingPreviewContext, setPendingPreviewContext] = useState<{ sourcePath: string; metadataProvider: MetadataProvider } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<LibraryJobState | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!configQuery.data) {
      return;
    }

    setSourcePath((current) => current || configQuery.data.lastSourcePath || configQuery.data.sampleSourcePath || '');
    setOutputFolder((current) => current || configQuery.data.outputFolder || '');
    setMetadataProvider(configQuery.data.metadataProvider);
  }, [configQuery.data]);

  const saveOutputMutation = useMutation({
    mutationFn: saveOutputFolder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['config'] });
    },
  });

  const saveMetadataProviderMutation = useMutation({
    mutationFn: saveMetadataProvider,
    onSuccess: (data) => {
      setMetadataProvider(data.metadataProvider);
      void queryClient.invalidateQueries({ queryKey: ['config'] });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (outputFolder.trim().length > 0) {
        await saveOutputMutation.mutateAsync(outputFolder.trim());
      }

      return startImportJob(sourcePath.trim(), metadataProvider);
    },
    onSuccess: (job) => {
      setPendingPreviewContext({
        sourcePath: sourcePath.trim(),
        metadataProvider,
      });
      setActiveJobId(job.id);
      setActiveJobSnapshot(job);
      setProcessResult(null);
    },
  });

  const retryMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!importResult) {
        throw new Error('Pull metadata before retrying failed albums.');
      }

      return startRetryMetadataJob({
        sourcePath: importResult.sourcePath,
        metadataProvider,
        warnings: importResult.warnings,
        albums: importResult.albums,
      });
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setActiveJobSnapshot(job);
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!importResult) {
        throw new Error('Preview changes before applying them.');
      }

      await saveOutputMutation.mutateAsync(outputFolder.trim());

      return startProcessJob({
        outputFolder: outputFolder.trim(),
        outputFormat,
        prefixTrackNumbers,
        albums: importResult.albums,
      });
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setActiveJobSnapshot(job);
    },
  });

  const jobQuery = useQuery({
    queryKey: ['job', activeJobId],
    queryFn: () => getJob(activeJobId!),
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? activeJobSnapshot?.status;
      return status === 'running' || status === 'queued' ? 500 : false;
    },
  });

  useEffect(() => {
    const job = jobQuery.data;
    if (!job) {
      return;
    }

    setActiveJobSnapshot(job);

    if (job.status === 'completed' && job.result) {
      if (job.kind === 'import-preview') {
        startTransition(() => {
          setImportResult(job.result as ImportResponse);
          setPreviewContext(pendingPreviewContext);
          setProcessResult(null);
        });
      }

      if (job.kind === 'metadata-retry') {
        startTransition(() => {
          setImportResult(job.result as ImportResponse);
        });
      }

      if (job.kind === 'process') {
        setProcessResult(job.result as ProcessResponse);
      }
    }
  }, [jobQuery.data]);

  const currentJob = jobQuery.data ?? activeJobSnapshot;
  const isBusy = currentJob?.status === 'queued' || currentJob?.status === 'running' || previewMutation.isPending || retryMetadataMutation.isPending || applyMutation.isPending;
  const previewIsStale = Boolean(
    importResult && previewContext && (
      previewContext.sourcePath !== sourcePath.trim() ||
      previewContext.metadataProvider !== metadataProvider
    ),
  );
  const failedMetadataAlbums = importResult?.albums.filter((album) => album.metadataLookupError) ?? [];
  const canPreview = sourcePath.trim().length > 0 && !isBusy;
  const canRetryMetadata = Boolean(importResult && metadataProvider !== 'local-only' && failedMetadataAlbums.length > 0 && !isBusy);
  const canApply = Boolean(importResult && outputFolder.trim().length > 0 && !previewIsStale && !isBusy);

  const previewStats = useMemo(() => {
    if (!importResult) {
      return null;
    }

    const changedTracks = importResult.albums
      .flatMap((album) => album.tracks)
      .filter((track) => getTrackChanges(track, outputFormat, prefixTrackNumbers).length > 0).length;

    return {
      albumCount: importResult.albumCount,
      trackCount: importResult.trackCount,
      warningCount: importResult.warnings.length,
      changedTracks,
    };
  }, [importResult, outputFormat, prefixTrackNumbers]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1850px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">Music Cleaner Upper</h1>
          <p className="text-sm text-base-content/60">Analyze a music folder, review the exact tags and filenames that will be written, then save the cleaned output.</p>
        </div>

        <label className="form-control w-full max-w-40">
          <div className="label py-0">
            <span className="label-text text-xs uppercase tracking-[0.16em] text-base-content/50">Theme</span>
          </div>
          <select className="select select-bordered select-sm" value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)}>
            {themes.map((themeOption) => (
              <option key={themeOption} value={themeOption}>
                {themeOption}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="app-panel">
        <div className="card-body gap-4 p-4 md:p-5">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-box border border-base-300 bg-base-200/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="panel-title">{getStepBadge(1)}</p>
                  <h2 className="text-lg font-semibold">Choose your output folder and add a folder to analyze</h2>
                  <p className="mt-1 text-sm text-base-content/60">Pick the source music folder and the destination where cleaned files should be written.</p>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  type="button"
                  disabled={!configQuery.data}
                  onClick={() => setSourcePath(configQuery.data?.sampleSourcePath || '')}
                >
                  Use sample folder
                </button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <PathPicker
                  label="Folder to analyze"
                  description="Pick one album or a top-level folder. Nested albums are scanned recursively."
                  value={sourcePath}
                  browseRoot={configQuery.data?.browseRoot || '/'}
                  onChange={setSourcePath}
                />

                <PathPicker
                  label="Output folder"
                  description="Clean copies are written here when you save the analyzed result."
                  value={outputFolder}
                  browseRoot={configQuery.data?.browseRoot || '/'}
                  directoriesOnly
                  onChange={setOutputFolder}
                />
              </div>
            </section>

            <section className="rounded-box border border-base-300 bg-base-200/60 p-4">
              <p className="panel-title">{getStepBadge(2)}</p>
              <h2 className="text-lg font-semibold">Pull and analyze metadata</h2>
              <p className="mt-1 text-sm text-base-content/60">Choose how metadata should be matched, then pull the plan that will drive the final tag and filename updates.</p>

              <div className="mt-4 space-y-3">
                <label className="form-control w-full">
                  <div className="label py-0">
                    <span className="label-text text-xs">Metadata source</span>
                  </div>
                  <select
                    className="select select-bordered select-sm"
                    value={metadataProvider}
                    onChange={(event) => {
                      const nextProvider = event.target.value as MetadataProvider;
                      setMetadataProvider(nextProvider);
                      saveMetadataProviderMutation.mutate(nextProvider);
                    }}
                  >
                    <option value="musicbrainz">MusicBrainz lookup</option>
                    <option value="local-only">Local tags only</option>
                  </select>
                </label>

                <div className="stats stats-vertical border border-base-300 bg-base-100 shadow-sm">
                  <div className="stat px-4 py-3">
                    <div className="stat-title text-[11px]">Metadata mode</div>
                    <div className="stat-value text-sm">{getMetadataProviderLabel(metadataProvider)}</div>
                    <div className="stat-desc">Source: {sourcePath.trim().length > 0 ? sourcePath : 'Choose a folder above'}</div>
                  </div>
                </div>

                <button className="btn btn-primary w-full" type="button" disabled={!canPreview} onClick={() => previewMutation.mutate()}>
                  {previewMutation.isPending || (currentJob?.kind === 'import-preview' && currentJob.status !== 'completed' && currentJob.status !== 'failed')
                    ? 'Pulling metadata…'
                    : 'Pull metadata'}
                </button>

                {failedMetadataAlbums.length > 0 ? (
                  <div className="rounded-box border border-warning/30 bg-warning/10 p-3 text-sm text-base-content/80">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{failedMetadataAlbums.length} album{failedMetadataAlbums.length === 1 ? '' : 's'} still have failed metadata lookups</div>
                        <div className="mt-1 text-xs text-base-content/60">Retry only re-pulls those failed albums and leaves the successful metadata matches alone.</div>
                      </div>
                      <button className="btn btn-warning btn-sm" type="button" disabled={!canRetryMetadata} onClick={() => retryMetadataMutation.mutate()}>
                        {retryMetadataMutation.isPending || (currentJob?.kind === 'metadata-retry' && currentJob.status !== 'completed' && currentJob.status !== 'failed')
                          ? 'Retrying failed metadata…'
                          : `Retry ${failedMetadataAlbums.length} failed album${failedMetadataAlbums.length === 1 ? '' : 's'}`}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          {currentJob ? <JobStatusPanel job={currentJob} /> : null}

          {configQuery.isError ? <div className="alert alert-error py-2 text-sm"><span>{configQuery.error.message}</span></div> : null}
          {saveOutputMutation.isError ? <div className="alert alert-error py-2 text-sm"><span>{saveOutputMutation.error.message}</span></div> : null}
          {saveMetadataProviderMutation.isError ? <div className="alert alert-error py-2 text-sm"><span>{saveMetadataProviderMutation.error.message}</span></div> : null}
          {previewMutation.isError ? <div className="alert alert-error py-2 text-sm"><span>{previewMutation.error.message}</span></div> : null}
          {applyMutation.isError ? <div className="alert alert-error py-2 text-sm"><span>{applyMutation.error.message}</span></div> : null}
          {currentJob?.status === 'failed' && currentJob.error ? <div className="alert alert-error py-2 text-sm"><span>{currentJob.error}</span></div> : null}
          {previewIsStale ? <div className="alert alert-warning py-2 text-sm"><span>Source folder or metadata source changed after preview. Preview again before applying changes.</span></div> : null}

          <section className="rounded-box border border-base-300 bg-base-200/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="panel-title">{getStepBadge(3)}</p>
                <h2 className="text-lg font-semibold">Convert and copy</h2>
                <p className="mt-1 text-sm text-base-content/60">The album groups below show only the fields that will actually change on the source file, plus the exact destination path for the cleaned copy.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="form-control w-full min-w-48">
                  <div className="label py-0">
                    <span className="label-text text-xs">Output format</span>
                  </div>
                  <select className="select select-bordered select-sm" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>
                    <option value="source">Keep original format</option>
                    <option value="mp3-320">Convert to MP3 320 kbps</option>
                  </select>
                </label>

                <label className="form-control w-full min-w-48">
                  <div className="label py-0">
                    <span className="label-text text-xs">File naming</span>
                  </div>
                  <select
                    className="select select-bordered select-sm"
                    value={prefixTrackNumbers ? 'numbered' : 'title-only'}
                    onChange={(event) => setPrefixTrackNumbers(event.target.value === 'numbered')}
                  >
                    <option value="numbered">Track number + title</option>
                    <option value="title-only">Title only</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <div className="stat rounded-box border border-base-300 bg-base-100/70 px-4 py-3">
                <div className="stat-title text-[11px]">Output plan</div>
                <div className="stat-value text-sm">{getOutputFormatLabel(outputFormat)}</div>
                <div className="stat-desc">{getFileNamingLabel(prefixTrackNumbers)}</div>
              </div>
              <div className="stat rounded-box border border-base-300 bg-base-100/70 px-4 py-3">
                <div className="stat-title text-[11px]">Albums</div>
                <div className="stat-value text-lg">{previewStats?.albumCount ?? 0}</div>
              </div>
              <div className="stat rounded-box border border-base-300 bg-base-100/70 px-4 py-3">
                <div className="stat-title text-[11px]">Tracks</div>
                <div className="stat-value text-lg">{previewStats?.trackCount ?? 0}</div>
              </div>
              <div className="stat rounded-box border border-base-300 bg-base-100/70 px-4 py-3">
                <div className="stat-title text-[11px]">Changed tracks</div>
                <div className="stat-value text-lg">{previewStats?.changedTracks ?? 0}</div>
              </div>
            </div>

            {importResult?.warnings.length ? (
              <div className="alert alert-warning mt-4 py-2 text-sm">
                <div className="flex flex-col gap-1">
                  {importResult.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {processResult ? (
              <div className="alert alert-success mt-4 py-2 text-sm">
                <span>
                  Finished {processResult.copiedCount} file{processResult.copiedCount === 1 ? '' : 's'} into {processResult.outputFolder} as {getOutputFormatLabel(processResult.outputFormat)}.
                </span>
              </div>
            ) : null}

            <div className="mt-4">
              <MetadataPreview importResult={importResult} outputFormat={outputFormat} prefixTrackNumbers={prefixTrackNumbers} outputFolder={outputFolder} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
              <div className="text-sm text-base-content/60">
                Destination: <span className="font-mono text-xs text-base-content">{outputFolder || 'Choose an output folder in Step 1'}</span>
              </div>
              <button className="btn btn-secondary" type="button" disabled={!canApply} onClick={() => applyMutation.mutate()}>
                {applyMutation.isPending || (currentJob?.kind === 'process' && currentJob.status !== 'completed' && currentJob.status !== 'failed')
                  ? 'Saving to output folder…'
                  : 'Save to output folder'}
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}