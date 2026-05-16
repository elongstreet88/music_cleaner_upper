import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';

import {
  browsePath,
  getConfig,
  getJob,
  saveOutputFolder,
  startImportJob,
  startProcessJob,
  type ImportResponse,
  type LibraryJobState,
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
type WorkflowStep = 1 | 2 | 3;
type StepStatus = 'locked' | 'ready' | 'working' | 'attention' | 'complete';

const themeLabels: Record<ThemeName, { full: string; short: string }> = {
  dim: { full: 'Dim', short: 'DM' },
  business: { full: 'Business', short: 'BS' },
  night: { full: 'Night', short: 'NG' },
  coffee: { full: 'Coffee', short: 'CF' },
  nord: { full: 'Nord', short: 'ND' },
  emerald: { full: 'Emerald', short: 'EM' },
  synthwave: { full: 'Synthwave', short: 'SW' },
};

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

function ThemePicker({ theme, collapsed, onChange }: { theme: ThemeName; collapsed: boolean; onChange: (theme: ThemeName) => void }) {
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

function StepNavItem({
  step,
  title,
  note,
  status,
  isActive,
  collapsed,
  onClick,
}: {
  step: WorkflowStep;
  title: string;
  note: string;
  status: StepStatus;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
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

function SourceFolderModal({
  isOpen,
  path,
  browseRoot,
  onPathChange,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  path: string;
  browseRoot: string;
  onPathChange: (path: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const folderQuery = useQuery({
    queryKey: ['source-folder-picker', path],
    queryFn: () => browsePath(path),
    enabled: isOpen && path.trim().length > 0,
    retry: false,
  });

  if (!isOpen) {
    return null;
  }

  const directories = folderQuery.data?.entries.filter((entry) => entry.kind === 'directory') ?? [];
  const parentPath = folderQuery.data?.parentPath || browseRoot;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-content/45 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="flex h-[min(78vh,44rem)] w-full max-w-3xl min-h-0 flex-col overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-2xl shadow-base-content/20">
        <div className="shrink-0 border-b border-base-300 px-4 py-3">
          <h3 className="text-lg font-semibold">Choose folder to process</h3>
          <p className="mt-1 break-all font-mono text-xs text-base-content/60">{path}</p>
        </div>

        <div className="shrink-0 border-b border-base-300 px-4 py-3">
          <button className="btn btn-outline btn-sm" type="button" onClick={() => onPathChange(parentPath)}>
            Up one level
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {folderQuery.isFetching ? <div className="text-sm text-base-content/55">Loading folders…</div> : null}
          {folderQuery.isError ? <div className="rounded-xl border border-error/30 bg-error/10 px-3 py-3 text-sm text-base-content/75">{folderQuery.error.message}</div> : null}

          {!folderQuery.isFetching && !folderQuery.isError ? (
            directories.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {directories.map((entry) => (
                  <button
                    className="rounded-xl border border-base-300 bg-base-100/70 px-3 py-3 text-left transition hover:border-base-content/25 hover:bg-base-100"
                    key={entry.path}
                    type="button"
                    onClick={() => onPathChange(entry.path)}
                  >
                    <div className="truncate text-sm font-medium text-base-content">{entry.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-base-content/50">{entry.path}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-base-content/55">No subfolders here. Press OK to use the current folder.</div>
            )
          ) : null}
        </div>

        <div className="shrink-0 border-t border-base-300 px-4 py-3">
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm min-w-28" type="button" onClick={onConfirm}>
              OK
            </button>
          </div>
        </div>
      </section>
    </div>
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
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('source');
  const [prefixTrackNumbers, setPrefixTrackNumbers] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => getThemeFromStorage());
  const [navCollapsed, setNavCollapsed] = useState(() => getNavCollapsedFromStorage());
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sourceBrowserPath, setSourceBrowserPath] = useState('');
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [previewContext, setPreviewContext] = useState<{ sourcePath: string } | null>(null);
  const [pendingPreviewContext, setPendingPreviewContext] = useState<{ sourcePath: string } | null>(null);
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
  }, [configQuery.data]);

  const metadataProvider = configQuery.data?.metadataProvider ?? 'musicbrainz';
  const defaultSourcePath = configQuery.data?.lastSourcePath || configQuery.data?.sampleSourcePath || '';

  const saveOutputMutation = useMutation({
    mutationFn: saveOutputFolder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['config'] });
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => startImportJob(sourcePath.trim(), metadataProvider),
    onSuccess: (job) => {
      setPendingPreviewContext({ sourcePath: sourcePath.trim() });
      setActiveJobId(job.id);
      setActiveJobSnapshot(job);
      setProcessResult(null);
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
      if (job.kind === 'import-preview' || job.kind === 'metadata-retry') {
        startTransition(() => {
          setImportResult(job.result as ImportResponse);
          setPreviewContext(pendingPreviewContext);
          setProcessResult(null);
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
  const failedImportJob = currentJob?.kind !== 'process' && currentJob?.status === 'failed';
  const previewIsStale = Boolean(importResult && previewContext && previewContext.sourcePath !== sourcePath.trim());
  const sourceSelectionReady = sourcePath.trim().length > 0;
  const previewReady = Boolean(importResult && !previewIsStale);
  const isBusy = currentJob?.status === 'queued' || currentJob?.status === 'running' || previewMutation.isPending || applyMutation.isPending;
  const canPreview = sourceSelectionReady && !isBusy;
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

  const stepOneStatus: StepStatus = sourceSelectionReady ? (activeStep === 1 ? 'ready' : 'complete') : 'attention';
  const stepTwoStatus: StepStatus = metadataJob
    ? 'working'
    : failedImportJob
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
      note: sourcePath.trim() ? shortenPath(sourcePath.trim()) : 'Add folder to process',
      status: stepOneStatus,
    },
    {
      step: 2 as WorkflowStep,
      title: 'Pull metadata',
      note: metadataJob ? metadataJob.currentStep : previewReady ? `${previewStats?.albumCount ?? 0} albums ready` : 'Run metadata pull',
      status: stepTwoStatus,
    },
    {
      step: 3 as WorkflowStep,
      title: 'Review and save',
      note: previewReady ? (outputFolder.trim() ? shortenPath(outputFolder.trim()) : 'Choose output folder') : 'Wait for preview',
      status: stepThreeStatus,
    },
  ];

  const openSourceModal = () => {
    setSourceBrowserPath(sourcePath.trim() || defaultSourcePath || configQuery.data?.browseRoot || '/');
    setIsSourceModalOpen(true);
  };

  return (
    <>
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

        <div className="min-h-0 overflow-hidden">
          {activeStep === 1 ? (
            <ContentShell
              title="Choose folder"
              description="Select one folder to process, or use the default source path."
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-base-content/60">Once the source folder is set, continue to metadata.</div>
                  <button className="btn btn-primary btn-sm" type="button" disabled={!sourceSelectionReady} onClick={() => setActiveStep(2)}>
                    Continue to metadata
                  </button>
                </div>
              }
            >
              <div className="flex h-full items-center justify-center">
                <div className="w-full max-w-3xl space-y-4 text-center">
                  <div className="rounded-2xl border border-base-300 bg-base-100/72 px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-base-content/45">Selected folder</div>
                    <div className="mt-2 break-all font-mono text-sm text-base-content/70">{sourcePath.trim() || 'No folder selected yet'}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button className="btn btn-primary h-20 text-base" type="button" onClick={openSourceModal}>
                      Add a folder to process
                    </button>

                    <button className="btn btn-outline h-20" type="button" disabled={!defaultSourcePath} onClick={() => setSourcePath(defaultSourcePath)}>
                      <span>
                        <span className="block text-base font-medium">Use default</span>
                        <span className="mt-1 block text-xs font-normal text-base-content/60">{defaultSourcePath ? shortenPath(defaultSourcePath) : 'No default folder available'}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </ContentShell>
          ) : null}

          {activeStep === 2 ? (
            <ContentShell
              title="Pull metadata"
              description="Run the metadata pull, then watch the live report below while it works."
              controls={
                <div className="flex justify-start">
                  <button className="btn btn-primary btn-sm" type="button" disabled={!canPreview} onClick={() => previewMutation.mutate()}>
                    {previewMutation.isPending || (metadataJob?.kind === 'import-preview' && metadataJob.status !== 'failed') ? 'Pulling metadata…' : 'Pull metadata'}
                  </button>
                </div>
              }
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-base-content/60">
                    {failedImportJob
                      ? 'The metadata pull failed. Run it again to retry.'
                      : previewReady
                        ? 'Metadata preview is ready. Continue when you want to review the changes.'
                        : 'Pull metadata to build the review plan.'}
                  </div>
                  <button className="btn btn-outline btn-sm" type="button" disabled={!previewReady} onClick={() => setActiveStep(3)}>
                    Continue to review
                  </button>
                </div>
              }
            >
              <div className="flex min-h-full flex-col gap-3">
                {metadataJob ? <JobStatusPanel job={metadataJob} /> : null}

                {failedImportJob && currentJob?.error ? (
                  <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-4 text-sm text-base-content/80">
                    <div className="font-medium">Metadata pull failed</div>
                    <div className="mt-1 text-xs text-base-content/60">{currentJob.error}</div>
                  </div>
                ) : null}

                {!metadataJob && !failedImportJob && !previewReady ? (
                  <div className="rounded-xl border border-dashed border-base-300 bg-base-200/35 px-4 py-4 text-sm text-base-content/60">
                    Press Pull metadata to start the live progress report.
                  </div>
                ) : null}

                {!metadataJob && previewReady ? (
                  <div className="rounded-xl border border-success/25 bg-success/8 px-4 py-4 text-sm text-base-content/75">
                    <div className="font-medium text-base-content">Metadata preview ready</div>
                    <div className="mt-1">Found {previewStats?.albumCount ?? 0} albums and {previewStats?.trackCount ?? 0} tracks.</div>
                  </div>
                ) : null}

                {importResult?.warnings.length ? (
                  <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm text-base-content/80">
                    <div className="font-medium">Warnings</div>
                    <div className="mt-2 space-y-1 text-xs text-base-content/65">
                      {importResult.warnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </ContentShell>
          ) : null}

          {activeStep === 3 ? (
            <ContentShell
              title="Review and save"
              description="Choose the output destination, review the table, then save from the footer."
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
                    <button className="btn btn-secondary min-w-60" type="button" disabled={!canApply} onClick={() => applyMutation.mutate()}>
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
                  <div className="alert alert-warning py-2 text-sm"><span>Source folder changed after preview. Pull metadata again before saving.</span></div>
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
          ) : null}
        </div>

        {configQuery.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{configQuery.error.message}</span></div> : null}
        {saveOutputMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{saveOutputMutation.error.message}</span></div> : null}
        {previewMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{previewMutation.error.message}</span></div> : null}
        {applyMutation.isError ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{applyMutation.error.message}</span></div> : null}
        {currentJob?.status === 'failed' && currentJob.error ? <div className="alert alert-error col-span-2 py-2 text-sm"><span>{currentJob.error}</span></div> : null}
      </div>

      <SourceFolderModal
        isOpen={isSourceModalOpen}
        path={sourceBrowserPath || configQuery.data?.browseRoot || '/'}
        browseRoot={configQuery.data?.browseRoot || '/'}
        onPathChange={setSourceBrowserPath}
        onClose={() => setIsSourceModalOpen(false)}
        onConfirm={() => {
          setSourcePath(sourceBrowserPath || configQuery.data?.browseRoot || '/');
          setIsSourceModalOpen(false);
        }}
      />
    </>
  );
}