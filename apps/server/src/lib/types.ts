export interface DirectoryEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
}

export type OutputFormat = 'source' | 'mp3-320';
export type MetadataProvider = 'musicbrainz' | 'local-only';
export type LibraryJobKind = 'import-preview' | 'metadata-retry' | 'process';
export type LibraryJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface OperationProgress {
  progress: number;
  message: string;
}

export interface JobLogEntry {
  at: string;
  progress: number;
  message: string;
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

export interface AppState {
  outputFolder: string | null;
  lastSourcePath: string | null;
  metadataProvider: MetadataProvider;
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