export interface AppConfig {
  outputFolder: string | null;
  lastSourcePath: string | null;
  metadataProvider: MetadataProvider;
  sampleSourcePath: string;
  browseRoot: string;
}

export type OutputFormat = 'source' | 'mp3-320';
export type MetadataProvider = 'musicbrainz' | 'local-only';
export type LibraryJobKind = 'import-preview' | 'metadata-retry' | 'process';
export type LibraryJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobLogEntry {
  at: string;
  progress: number;
  message: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
}

export interface BrowseResponse {
  path: string;
  parentPath: string;
  entries: DirectoryEntry[];
}

export interface ReleaseMatch {
  id: string;
  score: number;
  title: string;
  artist: string;
  year?: number;
  sourceUrl: string;
}

export interface ImportedTrack {
  id: string;
  sourcePath: string;
  sourceFileName: string;
  extension: string;
  discNumber: number;
  totalDiscs: number;
  trackNumber: number;
  totalTracks: number;
  title: string;
  artist: string;
  album: string;
  sourceYear?: number;
  sourceGenre?: string;
  canonicalTitle: string;
  canonicalArtist: string;
  canonicalAlbum: string;
  year?: number;
  genre?: string;
  destinationRelativePath: string;
}

export interface ImportedAlbum {
  id: string;
  sourcePath: string;
  artist: string;
  album: string;
  canonicalArtist: string;
  canonicalAlbum: string;
  year?: number;
  genre?: string;
  totalDiscs: number;
  tracks: ImportedTrack[];
  releaseMatch: ReleaseMatch | null;
  metadataLookupError?: string;
}

export interface ImportResponse {
  sourcePath: string;
  albumCount: number;
  trackCount: number;
  albums: ImportedAlbum[];
  warnings: string[];
}

export interface ProcessedFile {
  sourcePath: string;
  destinationPath: string;
  relativePath: string;
}

export interface ProcessResponse {
  outputFolder: string;
  outputFormat: OutputFormat;
  copiedCount: number;
  files: ProcessedFile[];
  warnings: string[];
}

export interface LibraryJobState {
  id: string;
  kind: LibraryJobKind;
  status: LibraryJobStatus;
  progress: number;
  currentStep: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  logs: JobLogEntry[];
  error?: string;
  result?: ImportResponse | ProcessResponse;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config');
}

export function browsePath(path: string): Promise<BrowseResponse> {
  return request<BrowseResponse>(`/api/browse?path=${encodeURIComponent(path)}`);
}

export function saveOutputFolder(outputFolder: string): Promise<AppConfig> {
  return request<AppConfig>('/api/config/output-folder', {
    method: 'POST',
    body: JSON.stringify({ outputFolder }),
  });
}

export function saveMetadataProvider(metadataProvider: MetadataProvider): Promise<AppConfig> {
  return request<AppConfig>('/api/config/metadata-provider', {
    method: 'POST',
    body: JSON.stringify({ metadataProvider }),
  });
}

export function importLibrary(sourcePath: string, metadataProvider: MetadataProvider): Promise<ImportResponse> {
  return request<ImportResponse>('/api/library/import', {
    method: 'POST',
    body: JSON.stringify({ sourcePath, metadataProvider }),
  });
}

export function startImportJob(sourcePath: string, metadataProvider: MetadataProvider): Promise<LibraryJobState> {
  return request<LibraryJobState>('/api/library/import-jobs', {
    method: 'POST',
    body: JSON.stringify({ sourcePath, metadataProvider }),
  });
}

export function startRetryMetadataJob(payload: {
  sourcePath: string;
  metadataProvider: MetadataProvider;
  warnings: string[];
  albums: ImportedAlbum[];
}): Promise<LibraryJobState> {
  return request<LibraryJobState>('/api/library/retry-metadata-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function processLibrary(payload: {
  outputFolder: string;
  outputFormat: OutputFormat;
  prefixTrackNumbers: boolean;
  albums: ImportedAlbum[];
}): Promise<ProcessResponse> {
  return request<ProcessResponse>('/api/library/process', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function startProcessJob(payload: {
  outputFolder: string;
  outputFormat: OutputFormat;
  prefixTrackNumbers: boolean;
  albums: ImportedAlbum[];
}): Promise<LibraryJobState> {
  return request<LibraryJobState>('/api/library/process-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getJob(jobId: string): Promise<LibraryJobState> {
  return request<LibraryJobState>(`/api/jobs/${encodeURIComponent(jobId)}`);
}