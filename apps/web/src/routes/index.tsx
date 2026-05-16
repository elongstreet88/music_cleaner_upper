import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';

import {
  browsePath,
  getConfig,
  getJob,
  saveMetadataProvider,
  saveOutputFolder,
  startImportJob,
  startProcessJob,
  startRetryMetadataJob,
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
const themeLabels: Record<ThemeName, { full: string; short: string }> = {
  dim: { full: 'Dim', short: 'DM' },
  business: { full: 'Business', short: 'BS' },
  night: { full: 'Night', short: 'NG' },
  coffee: { full: 'Coffee', short: 'CF' },
  nord: { full: 'Nord', short: 'ND' },
  emerald: { full: 'Emerald', short: 'EM' },
  synthwave: { full: 'Synthwave', short: 'SW' },
};

type ThemeName = (typeof themes)[number];
type WorkflowStep = 1 | 2 | 3;
type StepStatus = 'locked' | 'ready' | 'working' | 'attention' | 'complete';

const themeStorageKey = 'music-cleaner-upper-theme';
const navCollapseStorageKey = 'music-cleaner-upper-nav-collapsed';

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

function getNavCollapsedFromStorage(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(navCollapseStorageKey) !== 'false';
}

function shortenPath(path: string): string {
  if (!path) {
    return 'Not set';
  }

  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 3) {
    return path;
  }

  return `.../${segments.slice(-3).join('/')}`;
}

function getStepNumberClass(status: StepStatus, isActive: boolean): string {
  if (isActive) {
    return 'border-primary/35 bg-primary text-primary-content';
  }

  switch (status) {
    case 'complete':
      return 'border-success/30 bg-success text-success-content';
    case 'working':
      return 'border-primary/35 bg-primary/85 text-primary-content';
    case 'attention':
      return 'border-warning/35 bg-warning/80 text-warning-content';
    case 'ready':
      return 'border-base-300 bg-base-200 text-base-content';
    case 'locked':
      return 'border-base-300 bg-base-200/70 text-base-content/55';
  }
}

function SiteMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="16" fill="currentColor" opacity="0.12" />
      <path d="M30 19V40.5C28.5 39.5 26.5 39 24.5 39C19.8 39 16 41.9 16 45.5C16 49.1 19.8 52 24.5 52C29.2 52 33 49.1 33 45.5V28.5L48 25V35.5C46.5 34.5 44.5 34 42.5 34C37.8 34 34 36.9 34 40.5C34 44.1 37.8 47 42.5 47C47.2 47 51 44.1 51 40.5V16L30 19Z" fill="currentColor" />
      <path d="M43 10L44.6 13.4L48 15L44.6 16.6L43 20L41.4 16.6L38 15L41.4 13.4L43 10Z" fill="#9FE870" />
    </svg>
  );
}

function StatStrip({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100/72 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-base-content/45">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-base-content">{value}</span>
        <span className="truncate text-[11px] leading-5 text-base-content/58">{detail}</span>
      </div>
    </div>
  );
}

function InlineInfo({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100/72 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-base-content/45">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-base-content">{value}</div>
      <div className="truncate text-[11px] leading-5 text-base-content/58">{detail}</div>
    </div>
  );
}

interface ThemePickerProps {
  theme: ThemeName;
  collapsed: boolean;
  onChange: (theme: ThemeName) => void;
}

function ThemePicker({ theme, collapsed, onChange }: ThemePickerProps) {
  return (
    <label className={`form-control ${collapsed ? 'w-12' : 'w-full'}`}>
      {!collapsed ? (
        <div className="label py-0">
          <span className="label-text text-[10px] uppercase tracking-[0.14em] text-base-content/45">Theme</span>
        </div>
      ) : null}
      <select
        aria-label="Theme"
        className={`select select-bordered ${collapsed ? 'select-xs w-12 px-2 text-[10px]' : 'select-sm w-full'}`}
        value={theme}
        onChange={(event) => onChange(event.target.value as ThemeName)}
      >
        {themes.map((themeOption) => (
          <option key={themeOption} value={themeOption}>
            {collapsed ? themeLabels[themeOption].short : themeLabels[themeOption].full}
          </option>
        ))}
      </select>
    </label>
  );
}

interface StepNavItemProps {
  step: WorkflowStep;
  title: string;
  note: string;
  status: StepStatus;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function StepNavItem({ step, title, note, status, isActive, collapsed, onClick }: StepNavItemProps) {
  if (collapsed) {
    return (
      <button
        aria-label={`${step}. ${title}`}
        className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-semibold transition ${getStepNumberClass(status, isActive)}`}
        title={`${step}. ${title}`}
        type="button"
        onClick={onClick}
      >
        {step}
      </button>
    );
  }

  return (
    <button
      className={`w-full rounded-2xl border px-3 py-2.5 text-left transition ${isActive ? 'border-primary/35 bg-primary/8 shadow-sm shadow-primary/10' : 'border-base-300 bg-base-100/70 hover:border-base-content/20 hover:bg-base-100/90'}`}
      type="button"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${getStepNumberClass(status, isActive)}`}>
          {step}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-base-content">{title}</div>
          <div className="truncate text-[11px] leading-5 text-base-content/58">{note}</div>
        </div>
      </div>
    </button>
  );
}

function ContentShell({
  title,
  description,
  controls,
  children,
  footer,
}: {
  title: string;
  description: string;
  controls?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-base-300 bg-base-100/92 shadow-lg shadow-base-300/8">
      <div className="shrink-0 border-b border-base-300 px-3 py-2.5">
        <h2 className="text-lg font-semibold md:text-xl">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-base-content/62">{description}</p>
      </div>
      {controls ? <div className="shrink-0 border-b border-base-300 px-3 py-2.5">{controls}</div> : null}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">{children}</div>
      <div className="shrink-0 border-t border-base-300 px-3 py-2.5">{footer}</div>
    </section>
  );
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
  const [navCollapsed, setNavCollapsed] = useState(() => getNavCollapsedFromStorage());
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [previewContext, setPreviewContext] = useState<{ sourcePath: string; metadataProvider: MetadataProvider } | null>(null);
  const [pendingPreviewContext, setPendingPreviewContext] = useState<{ sourcePath: string; metadataProvider: MetadataProvider } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<LibraryJobState | null>(null);
  const [activeStep, setActiveStep] = useState<WorkflowStep>(1);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(navCollapseStorageKey, String(navCollapsed));
  }, [navCollapsed]);

  useEffect(() => {
    if (!configQuery.data) {
      return;
    }

    setSourcePath((current) => current || configQuery.data.lastSourcePath || configQuery.data.sampleSourcePath || '');
    setOutputFolder((current) => current || configQuery.data.outputFolder || '');
    setMetadataProvider(configQuery.data.metadataProvider);
  }, [configQuery.data]);

  const sourcePreviewQuery = useQuery({
    queryKey: ['browse-preview', sourcePath.trim()],
    queryFn: () => browsePath(sourcePath.trim()),
    enabled: sourcePath.trim().length > 0,
    retry: false,
  });

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
    mutationFn: () => startImportJob(sourcePath.trim(), metadataProvider),
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

      if (outputFolder.trim().length === 0) {
        throw new Error('Choose an output folder before saving.');
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
      setActiveStep(3);
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
  }, [jobQuery.data, pendingPreviewContext]);

  const currentJob = jobQuery.data ?? activeJobSnapshot;
  const metadataJob = currentJob && currentJob.kind !== 'process' && currentJob.status !== 'completed' ? currentJob : null;
  const processJob = currentJob && currentJob.kind === 'process' && currentJob.status !== 'completed' ? currentJob : null;
  const previewIsStale = Boolean(
    importResult && previewContext && (
      previewContext.sourcePath !== sourcePath.trim() ||
      previewContext.metadataProvider !== metadataProvider
    ),
  );
  const sourceSelectionReady = sourcePath.trim().length > 0;
  const previewReady = Boolean(importResult && !previewIsStale);
  const failedMetadataAlbums = importResult?.albums.filter((album) => album.metadataLookupError) ?? [];
  const isBusy = currentJob?.status === 'queued' || currentJob?.status === 'running' || previewMutation.isPending || retryMetadataMutation.isPending || applyMutation.isPending;
  const canPreview = sourceSelectionReady && !isBusy;
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

  const sourcePreviewStats = useMemo(() => {
    const entries = sourcePreviewQuery.data?.entries ?? [];
    const directoryCount = entries.filter((entry) => entry.kind === 'directory').length;
    const fileCount = entries.length - directoryCount;

    return {
      entryCount: entries.length,
      directoryCount,
      fileCount,
      previewEntries: entries.slice(0, 18),
    };
  }, [sourcePreviewQuery.data]);

  const stepOneStatus: StepStatus = sourceSelectionReady ? (activeStep === 1 ? 'ready' : 'complete') : 'attention';
  const stepTwoStatus: StepStatus = metadataJob
    ? 'working'
    : currentJob?.kind !== 'process' && currentJob?.status === 'failed'
      ? 'attention'
      : failedMetadataAlbums.length > 0
        ? 'attention'
        : previewReady
          ? activeStep === 2
            ? 'ready'
            : 'complete'
          : sourceSelectionReady
            ? 'ready'
            : 'locked';
  const stepThreeStatus: StepStatus = processJob
    ? 'working'
    : processResult
      ? 'complete'
      : previewReady
        ? outputFolder.trim().length > 0
          ? 'ready'
          : 'attention'
        : 'locked';

  const stepNavItems = [
    {
      step: 1 as WorkflowStep,
      title: 'Choose folder',
      note: sourcePath.trim() ? shortenPath(sourcePath.trim()) : 'Add folder to analyze or convert',
      status: stepOneStatus,
    },
    {
      step: 2 as WorkflowStep,
      title: 'Pull metadata',
      note: metadataJob ? metadataJob.currentStep : previewReady ? `${previewStats?.albumCount ?? 0} albums ready for review` : 'Run the preview after choosing a source',
      status: stepTwoStatus,
    },
    {
      step: 3 as WorkflowStep,
      title: 'Review and save',
      note: previewReady ? (outputFolder.trim() ? shortenPath(outputFolder.trim()) : 'Choose the output folder in this step') : 'Available after preview completes',
      status: stepThreeStatus,
    },
  ];

  const stepTwoStats = metadataJob
    ? [
        { label: 'Status', value: metadataJob.status, detail: metadataJob.currentStep },
        { label: 'Progress', value: `${metadataJob.progress}%`, detail: `${metadataJob.logs.length} updates recorded` },
        { label: 'Job', value: metadataJob.kind === 'metadata-retry' ? 'Retry' : 'Pull', detail: 'Live preview status' },
        { label: 'Mode', value: getMetadataProviderLabel(metadataProvider), detail: shortenPath(sourcePath.trim()) },
      ]
    : [
        { label: 'Albums', value: String(previewStats?.albumCount ?? 0), detail: 'Albums in preview' },
        { label: 'Tracks', value: String(previewStats?.trackCount ?? 0), detail: 'Tracks ready for review' },
        { label: 'Changed', value: String(previewStats?.changedTracks ?? 0), detail: 'Tracks with edits' },
        { label: 'Warnings', value: String(previewStats?.warningCount ?? 0), detail: 'Issues to review' },
      ];

  const renderStepOneContent = () => (
    <ContentShell
      title="Add folder to analyze/convert"
      description="Choose the source here. This step only selects what to scan. The output destination comes later in Step 3."
      controls={
        <div className="grid gap-2 md:grid-cols-4 md:items-end">
          <div className="md:col-span-3">
            <PathPicker
              label="Folder to analyze"
              description="Pick one album or a top-level folder. Nested albums are scanned recursively."
              value={sourcePath}
              browseRoot={configQuery.data?.browseRoot || '/'}
              onChange={setSourcePath}
            />
          </div>

          <button
            className="btn btn-outline btn-sm h-10 md:col-span-1"
            type="button"
            disabled={!configQuery.data}
            onClick={() => setSourcePath(configQuery.data?.sampleSourcePath || '')}
          >
            Use sample folder
          </button>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-base-content/60">Pick the source here. Output location and save behavior happen later.</div>
          <button className="btn btn-primary btn-sm" type="button" disabled={!sourceSelectionReady} onClick={() => setActiveStep(2)}>
            Continue to metadata
          </button>
        </div>
      }
    >
      <div className="flex min-h-full flex-col gap-2.5">
        <div className="grid gap-2 md:grid-cols-4">
          <StatStrip label="Entries" value={String(sourcePreviewStats.entryCount)} detail="Immediate items at the root" />
          <StatStrip label="Folders" value={String(sourcePreviewStats.directoryCount)} detail="Directories visible before recursion" />
          <StatStrip label="Files" value={String(sourcePreviewStats.fileCount)} detail="Direct files at the selected root" />
          <InlineInfo label="Scan mode" value="Recursive import" detail="Top-level folders are discovered automatically." />
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-base-300 bg-base-100/72">
          <div className="shrink-0 border-b border-base-300 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-base-content/45">Selected source preview</div>
            <div className="mt-1 break-all text-sm text-base-content/70">{sourcePath.trim() || 'Choose a folder to analyze'}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {sourcePreviewQuery.isFetching ? (
              <div className="text-sm text-base-content/55">Loading folder preview…</div>
            ) : sourcePreviewQuery.isError ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-base-content/70">{sourcePreviewQuery.error.message}</div>
            ) : sourcePreviewStats.previewEntries.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {sourcePreviewStats.previewEntries.map((entry) => (
                  <div className="rounded-xl border border-base-300 bg-base-200/45 px-3 py-2.5" key={entry.path}>
                    <div className="truncate text-sm font-medium text-base-content/80">{entry.name}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-base-content/55">
                      <span>{entry.kind === 'directory' ? 'Directory' : 'File'}</span>
                      <span className={`badge badge-xs ${entry.kind === 'directory' ? 'badge-success badge-outline' : 'badge-ghost'}`}>
                        {entry.kind}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-base-content/55">No preview entries yet. Choose a valid source folder to see what will be scanned.</div>
            )}
          </div>
        </div>
      </div>
    </ContentShell>
  );

  const renderStepTwoContent = () => {
    const failedImportJob = currentJob?.kind !== 'process' && currentJob?.status === 'failed';
    const canContinueAnyway = Boolean(importResult);

    return (
      <ContentShell
        title="Pull and analyze metadata"
        description="Keep the controls fixed at the top, watch the live job in the middle, and continue only when the preview looks right."
        controls={
          <div className="grid gap-2 md:grid-cols-4 md:items-end">
            <label className="form-control rounded-xl border border-base-300 bg-base-100/72 px-3 py-2.5 md:col-span-1">
              <div className="label py-0">
                <span className="label-text text-[10px] uppercase tracking-[0.14em] text-base-content/45">Metadata source</span>
              </div>
              <select
                className="select select-bordered select-sm mt-2"
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

            <div className="grid gap-2 md:col-span-3 md:grid-cols-3">
              <InlineInfo label="Source" value={shortenPath(sourcePath.trim())} detail="Selected in Step 1" />
              <InlineInfo label="Mode" value={getMetadataProviderLabel(metadataProvider)} detail="Live lookup or local-only tags" />
              <InlineInfo
                label="Preview state"
                value={metadataJob ? 'Running' : previewReady ? 'Ready' : 'Waiting'}
                detail={metadataJob ? metadataJob.currentStep : previewReady ? 'Preview complete and waiting for your input' : 'No preview job running yet'}
              />
            </div>
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-base-content/60">
              {failedMetadataAlbums.length > 0
                ? 'Some albums still need metadata attention. Retry them here, or continue anyway with the current preview.'
                : previewReady
                  ? 'Metadata preview is ready. Continue when you want to review the conversion table.'
                  : 'Pull metadata to build the review plan.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {failedImportJob ? (
                <button className="btn btn-error btn-sm" type="button" disabled={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
                  Retry pull metadata
                </button>
              ) : null}
              {failedMetadataAlbums.length > 0 ? (
                <button className="btn btn-warning btn-sm" type="button" disabled={!canRetryMetadata} onClick={() => retryMetadataMutation.mutate()}>
                  {retryMetadataMutation.isPending || (metadataJob?.kind === 'metadata-retry' && metadataJob.status !== 'failed') ? 'Retrying failed metadata…' : 'Retry failed metadata'}
                </button>
              ) : null}
              <button className="btn btn-primary btn-sm" type="button" disabled={!canPreview} onClick={() => previewMutation.mutate()}>
                {previewMutation.isPending || (metadataJob?.kind === 'import-preview' && metadataJob.status !== 'failed') ? 'Pulling metadata…' : 'Pull metadata'}
              </button>
              <button className="btn btn-outline btn-sm" type="button" disabled={!(previewReady || canContinueAnyway)} onClick={() => setActiveStep(3)}>
                {failedMetadataAlbums.length > 0 || failedImportJob ? 'Continue anyway' : 'Continue to review'}
              </button>
            </div>
          </div>
        }
      >
        <div className="flex min-h-full flex-col gap-2.5">
          <div className="grid gap-2 md:grid-cols-4">
            {stepTwoStats.map((card) => (
              <StatStrip key={card.label} label={card.label} value={card.value} detail={card.detail} />
            ))}
          </div>

          <div className="grid min-h-0 flex-1 gap-2.5 md:grid-cols-12">
            <div className="space-y-2.5 md:col-span-8">
              {metadataJob ? (
                <JobStatusPanel job={metadataJob} />
              ) : (
                <div className="rounded-xl border border-dashed border-base-300 bg-base-200/35 px-4 py-4 text-sm text-base-content/60">
                  Pull metadata to start the preview. This step stays put when the job finishes, then enables the continue action in the footer.
                </div>
              )}

              {failedImportJob && currentJob?.error ? (
                <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-4 text-sm text-base-content/80">
                  <div className="font-medium">Metadata pull failed</div>
                  <div className="mt-1 text-xs text-base-content/60">{currentJob.error}</div>
                </div>
              ) : null}

              {failedMetadataAlbums.length > 0 ? (
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm text-base-content/80">
                  <div className="font-medium">{failedMetadataAlbums.length} album{failedMetadataAlbums.length === 1 ? '' : 's'} still need metadata attention</div>
                  <div className="mt-1 text-xs text-base-content/60">Retry only the failed albums, or keep the current preview and continue anyway.</div>
                </div>
              ) : null}

              {!metadataJob && previewReady ? (
                <div className="rounded-xl border border-success/25 bg-success/8 px-4 py-4 text-sm text-base-content/75">
                  <div className="font-medium text-base-content">Metadata preview ready</div>
                  <div className="mt-1">Nothing moves automatically. Use the footer when you want to continue into Step 3.</div>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-col rounded-2xl border border-base-300 bg-base-100/72 md:col-span-4">
              <div className="shrink-0 border-b border-base-300 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-base-content/45">Recent updates</div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                {(currentJob?.logs ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {[...(currentJob?.logs ?? [])].slice(-8).reverse().map((log, index) => (
                      <div className="flex items-start gap-2 text-xs leading-5" key={`${log.at}-${index}`}>
                        <span className="badge badge-ghost badge-xs mt-0.5 shrink-0">{log.progress}%</span>
                        <span className="text-base-content/70">{log.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-base-content/55">No updates yet. Live job messages will appear here while metadata is being pulled.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </ContentShell>
    );
  };

  const renderStepThreeContent = () => (
    <ContentShell
      title="Convert and save"
      description="Set the destination here, choose the output rules, review the compact table, then save from the footer."
      controls={
        <div className="grid gap-2 md:grid-cols-4 md:items-end">
          <div className="md:col-span-2">
            <PathPicker
              label="Output folder"
              description="Choose where the cleaned files should be written."
              value={outputFolder}
              browseRoot={configQuery.data?.browseRoot || '/'}
              directoriesOnly
              onChange={setOutputFolder}
            />
          </div>

          <label className="form-control rounded-xl border border-base-300 bg-base-100/72 px-3 py-2.5 md:col-span-1">
            <div className="label py-0">
              <span className="label-text text-[10px] uppercase tracking-[0.14em] text-base-content/45">Output format</span>
            </div>
            <select className="select select-bordered select-sm mt-2" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>
              <option value="source">Keep original format</option>
              <option value="mp3-320">Convert to MP3 320 kbps</option>
            </select>
          </label>

          <label className="form-control rounded-xl border border-base-300 bg-base-100/72 px-3 py-2.5 md:col-span-1">
            <div className="label py-0">
              <span className="label-text text-[10px] uppercase tracking-[0.14em] text-base-content/45">File naming</span>
            </div>
            <select
              className="select select-bordered select-sm mt-2"
              value={prefixTrackNumbers ? 'numbered' : 'title-only'}
              onChange={(event) => setPrefixTrackNumbers(event.target.value === 'numbered')}
            >
              <option value="numbered">Track number + title</option>
              <option value="title-only">Title only</option>
            </select>
          </label>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-base-content/60">Destination: <span className="font-mono text-xs text-base-content">{outputFolder || 'Choose an output folder before saving'}</span></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setActiveStep(2)}>
              Back to metadata
            </button>
            <button className="btn btn-secondary min-w-[15rem]" type="button" disabled={!canApply} onClick={() => applyMutation.mutate()}>
              {applyMutation.isPending || processJob ? 'Saving to output folder…' : 'Save to output folder'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
          <span className="badge badge-ghost badge-sm">{previewStats?.albumCount ?? 0} albums</span>
          <span className="badge badge-ghost badge-sm">{previewStats?.trackCount ?? 0} tracks</span>
          <span className="badge badge-ghost badge-sm">{previewStats?.changedTracks ?? 0} changed</span>
          <span className="badge badge-ghost badge-sm">{previewStats?.warningCount ?? 0} warnings</span>
        </div>

        {processJob ? <JobStatusPanel job={processJob} /> : null}

        {previewIsStale ? (
          <div className="alert alert-warning py-2 text-sm"><span>Source folder or metadata mode changed after preview. Refresh Step 2 before saving.</span></div>
        ) : null}

        {importResult?.warnings.length ? (
          <div className="alert alert-warning py-2 text-sm">
            <div className="flex flex-col gap-1">
              {importResult.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          </div>
        ) : null}

        {processResult ? (
          <div className="alert alert-success py-2 text-sm">
            <span>
              Finished {processResult.copiedCount} file{processResult.copiedCount === 1 ? '' : 's'} into {processResult.outputFolder} as {getOutputFormatLabel(processResult.outputFormat)}.
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <MetadataPreview importResult={importResult} outputFormat={outputFormat} prefixTrackNumbers={prefixTrackNumbers} outputFolder={outputFolder} />
        </div>
      </div>
    </ContentShell>
  );

  const renderActiveContent = () => {
    if (activeStep === 1) {
      return renderStepOneContent();
    }

    if (activeStep === 2) {
      return renderStepTwoContent();
    }

    return renderStepThreeContent();
  };

  return (
    <div
      className="grid h-dvh max-h-dvh min-h-0 w-full gap-2 overflow-hidden bg-base-200/20 p-2.5"
      style={{ gridTemplateColumns: navCollapsed ? '72px minmax(0, 1fr)' : '216px minmax(0, 1fr)' }}
    >
      <aside className={`flex min-h-0 flex-col rounded-3xl border border-base-300 bg-base-100/90 py-3 shadow-lg shadow-base-300/8 ${navCollapsed ? 'items-center px-2' : 'px-3'}`}>
        <div className={`flex w-full items-center ${navCollapsed ? 'justify-center' : 'justify-between'}`}>
          <button
            aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className={`btn border-base-300 bg-base-100/80 hover:bg-base-100 ${navCollapsed ? 'btn-square btn-sm' : 'btn-sm gap-2 px-2'}`}
            type="button"
            onClick={() => setNavCollapsed((collapsed) => !collapsed)}
          >
            <SiteMark className="h-6 w-6" />
            {!navCollapsed ? <span className="text-xs font-semibold">Music Cleaner</span> : null}
          </button>
        </div>

        <div className={`mt-3 ${navCollapsed ? '' : 'w-full'}`}>
          <ThemePicker theme={theme} collapsed={navCollapsed} onChange={setTheme} />
        </div>

        <div className={`mt-3 flex flex-col gap-2 ${navCollapsed ? 'items-center' : 'w-full'}`}>
          {stepNavItems.map((item) => (
            <StepNavItem
              key={item.step}
              step={item.step}
              title={item.title}
              note={item.note}
              status={item.status}
              isActive={activeStep === item.step}
              collapsed={navCollapsed}
              onClick={() => setActiveStep(item.step)}
            />
          ))}
        </div>
      </aside>

      <div className="min-h-0 overflow-hidden">{renderActiveContent()}</div>

      {configQuery.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{configQuery.error.message}</span></div> : null}
      {saveOutputMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{saveOutputMutation.error.message}</span></div> : null}
      {saveMetadataProviderMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{saveMetadataProviderMutation.error.message}</span></div> : null}
      {previewMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{previewMutation.error.message}</span></div> : null}
      {retryMetadataMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{retryMetadataMutation.error.message}</span></div> : null}
      {applyMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{applyMutation.error.message}</span></div> : null}
      {currentJob?.status === 'failed' && currentJob.error ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{currentJob.error}</span></div> : null}
    </div>
  );
}