import type { LibraryJobState } from '../api';

interface JobStatusPanelProps {
  job: LibraryJobState | null;
}

function getStatusBadgeClass(job: LibraryJobState): string {
  if (job.status === 'failed') {
    return 'badge-error';
  }

  if (job.status === 'completed') {
    return 'badge-success';
  }

  return job.kind === 'process' ? 'badge-secondary' : 'badge-primary';
}

function getProgressClass(job: LibraryJobState): string {
  if (job.status === 'failed') {
    return 'progress-error';
  }

  return job.kind === 'process' ? 'progress-secondary' : 'progress-primary';
}

export function JobStatusPanel({ job }: JobStatusPanelProps) {
  if (!job) {
    return null;
  }

  const title = job.kind === 'process'
    ? 'Save progress'
    : job.kind === 'metadata-retry'
      ? 'Metadata retry progress'
      : 'Metadata pull progress';

  return (
    <section className="rounded-box border border-base-300 bg-base-200/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {job.status === 'running' || job.status === 'queued' ? <span className="loading loading-spinner loading-xs" /> : null}
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <p className="mt-1 text-sm text-base-content/70">{job.currentStep}</p>
        </div>
        <span className={`badge ${getStatusBadgeClass(job)}`}>{job.status}</span>
      </div>

      <progress className={`progress mt-3 w-full ${getProgressClass(job)}`} value={job.progress} max={100} />
      <div className="mt-1 flex items-center justify-between text-xs text-base-content/60">
        <span>{job.progress}%</span>
        <span>{job.logs.length} status update{job.logs.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mt-3 max-h-36 space-y-2 overflow-auto rounded-box bg-base-100/70 p-3">
        {[...job.logs].slice(-8).reverse().map((log, index) => (
          <div className="flex items-start gap-2 text-xs" key={`${log.at}-${index}`}>
            <span className="badge badge-ghost badge-xs mt-0.5 shrink-0">{log.progress}%</span>
            <span className="text-base-content/70">{log.message}</span>
          </div>
        ))}
      </div>

      {job.error ? (
        <div className="alert alert-error mt-3 py-2 text-sm">
          <span>{job.error}</span>
        </div>
      ) : null}
    </section>
  );
}