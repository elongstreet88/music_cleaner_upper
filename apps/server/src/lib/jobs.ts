import { randomUUID } from 'node:crypto';

import type { ImportResponse, LibraryJobKind, LibraryJobState, OperationProgress, ProcessResponse } from './types.js';

const jobs = new Map<string, LibraryJobState>();
const maxLogsPerJob = 40;

function now(): string {
  return new Date().toISOString();
}

export function createJob(kind: LibraryJobKind, initialStep: string): LibraryJobState {
  const timestamp = now();
  const job: LibraryJobState = {
    id: randomUUID(),
    kind,
    status: 'queued',
    progress: 0,
    currentStep: initialStep,
    startedAt: timestamp,
    updatedAt: timestamp,
    logs: [
      {
        at: timestamp,
        progress: 0,
        message: initialStep,
      },
    ],
  };

  jobs.set(job.id, job);
  return job;
}

export function getJob(jobId: string): LibraryJobState | undefined {
  return jobs.get(jobId);
}

function pushLog(job: LibraryJobState, progress: number, message: string): void {
  const lastLog = job.logs.at(-1);
  if (lastLog?.message === message && lastLog.progress === progress) {
    return;
  }

  job.logs.push({
    at: now(),
    progress,
    message,
  });

  if (job.logs.length > maxLogsPerJob) {
    job.logs.splice(0, job.logs.length - maxLogsPerJob);
  }
}

export function markJobRunning(jobId: string, initialStep?: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = 'running';
  job.updatedAt = now();

  if (initialStep) {
    job.currentStep = initialStep;
    pushLog(job, job.progress, initialStep);
  }
}

export function updateJobProgress(jobId: string, update: OperationProgress): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  const nextProgress = Math.max(job.progress, Math.min(100, Math.round(update.progress)));
  job.progress = nextProgress;
  job.currentStep = update.message;
  job.updatedAt = now();
  pushLog(job, nextProgress, update.message);
}

export function completeJob(jobId: string, result: ImportResponse | ProcessResponse, message: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  const timestamp = now();
  job.status = 'completed';
  job.progress = 100;
  job.currentStep = message;
  job.updatedAt = timestamp;
  job.completedAt = timestamp;
  job.result = result;
  pushLog(job, 100, message);
}

export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  const timestamp = now();
  job.status = 'failed';
  job.error = error;
  job.currentStep = error;
  job.updatedAt = timestamp;
  job.completedAt = timestamp;
  pushLog(job, job.progress, error);
}