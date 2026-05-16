import express from 'express';
import cors from 'cors';
import { dirname, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { z } from 'zod';

import { importSource, retryMetadataForImportedAlbums } from './lib/importer.js';
import { ensureDirectory, listDirectoryEntries, pathExists } from './lib/filesystem.js';
import { completeJob, createJob, failJob, getJob, markJobRunning, updateJobProgress } from './lib/jobs.js';
import { SAMPLE_SOURCE_PATH } from './lib/paths.js';
import { DEFAULT_OUTPUT_FORMAT, processAlbums } from './lib/processor.js';
import { readAppState, writeAppState } from './lib/state.js';
import type { MetadataProvider } from './lib/types.js';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3001', 10);

const importSchema = z.object({
  sourcePath: z.string().min(1),
  metadataProvider: z.enum(['musicbrainz', 'local-only']).optional(),
});

const outputFolderSchema = z.object({
  outputFolder: z.string().min(1),
});

const metadataProviderSchema = z.object({
  metadataProvider: z.enum(['musicbrainz', 'local-only']),
});

const importedTrackSchema = z.object({
  id: z.string(),
  sourcePath: z.string(),
  sourceFileName: z.string(),
  extension: z.string(),
  discNumber: z.number().int().positive(),
  totalDiscs: z.number().int().positive(),
  trackNumber: z.number().int().positive(),
  totalTracks: z.number().int().positive(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  sourceYear: z.number().optional(),
  sourceGenre: z.string().optional(),
  canonicalTitle: z.string(),
  canonicalArtist: z.string(),
  canonicalAlbum: z.string(),
  year: z.number().optional(),
  genre: z.string().optional(),
  destinationRelativePath: z.string(),
});

const importedAlbumSchema = z.object({
  id: z.string(),
  sourcePath: z.string(),
  artist: z.string(),
  album: z.string(),
  canonicalArtist: z.string(),
  canonicalAlbum: z.string(),
  year: z.number().optional(),
  genre: z.string().optional(),
  totalDiscs: z.number().int().positive(),
  releaseMatch: z
    .object({
      id: z.string(),
      score: z.number(),
      title: z.string(),
      artist: z.string(),
      year: z.number().optional(),
      sourceUrl: z.string(),
    })
    .nullable(),
  metadataLookupError: z.string().optional(),
  tracks: z.array(importedTrackSchema),
});

const processSchema = z.object({
  outputFolder: z.string().min(1).optional(),
  outputFormat: z.enum(['source', 'mp3-320']).optional(),
  prefixTrackNumbers: z.boolean().optional(),
  albums: z.array(importedAlbumSchema),
});

const retryMetadataSchema = z.object({
  sourcePath: z.string().min(1),
  metadataProvider: z.enum(['musicbrainz', 'local-only']).optional(),
  warnings: z.array(z.string()),
  albums: z.array(importedAlbumSchema),
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', async (_request, response) => {
  const state = await readAppState();
  response.json({
    ok: true,
    outputFolder: state.outputFolder,
    sampleSourcePath: SAMPLE_SOURCE_PATH,
  });
});

app.get('/api/config', async (_request, response) => {
  const state = await readAppState();
  response.json({
    ...state,
    sampleSourcePath: SAMPLE_SOURCE_PATH,
    browseRoot: homedir(),
  });
});

app.post('/api/config/output-folder', async (request, response) => {
  const parsed = outputFolderSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const nextOutputFolder = resolve(parsed.data.outputFolder);
  await ensureDirectory(nextOutputFolder);

  const currentState = await readAppState();
  const nextState = await writeAppState({
    ...currentState,
    outputFolder: nextOutputFolder,
  });

  response.json(nextState);
});

app.post('/api/config/metadata-provider', async (request, response) => {
  const parsed = metadataProviderSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const currentState = await readAppState();
  const nextState = await writeAppState({
    ...currentState,
    metadataProvider: parsed.data.metadataProvider,
  });

  response.json(nextState);
});

app.get('/api/browse', async (request, response) => {
  const rawPath = typeof request.query.path === 'string' && request.query.path.length > 0 ? request.query.path : homedir();
  const resolvedPath = resolve(rawPath);

  if (!(await pathExists(resolvedPath))) {
    response.status(404).json({ error: `Path does not exist: ${resolvedPath}` });
    return;
  }

  const stat = await fs.stat(resolvedPath);

  if (!stat.isDirectory()) {
    response.status(400).json({ error: `Not a directory: ${resolvedPath}` });
    return;
  }

  response.json({
    path: resolvedPath,
    parentPath: dirname(resolvedPath),
    entries: await listDirectoryEntries(resolvedPath),
  });
});

app.post('/api/library/import', async (request, response) => {
  const parsed = importSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const currentState = await readAppState();
    const metadataProvider = parsed.data.metadataProvider ?? currentState.metadataProvider;
    const releaseLookup =
      metadataProvider === 'local-only'
        ? (async () => null)
        : undefined;

    const importResult = await importSource(parsed.data.sourcePath, { releaseLookup });

    await writeAppState({
      ...currentState,
      lastSourcePath: resolve(parsed.data.sourcePath),
      metadataProvider,
    });
    response.json(importResult);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown import error',
    });
  }
});

app.post('/api/library/import-jobs', async (request, response) => {
  const parsed = importSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const currentState = await readAppState();
  const metadataProvider = parsed.data.metadataProvider ?? currentState.metadataProvider;
  const job = createJob('import-preview', 'Queued preview import');

  markJobRunning(job.id, `Starting preview import from ${resolve(parsed.data.sourcePath)}`);

  void (async () => {
    try {
      const releaseLookup = metadataProvider === 'local-only' ? async () => null : undefined;
      const importResult = await importSource(parsed.data.sourcePath, {
        releaseLookup,
        onProgress: (update) => updateJobProgress(job.id, update),
      });

      await writeAppState({
        ...currentState,
        lastSourcePath: resolve(parsed.data.sourcePath),
        metadataProvider,
      });

      completeJob(job.id, importResult, 'Preview import complete');
    } catch (error) {
      failJob(job.id, error instanceof Error ? error.message : 'Unknown import error');
    }
  })();

  response.status(202).json(job);
});

app.post('/api/library/process', async (request, response) => {
  const parsed = processSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const state = await readAppState();
  const outputFolder = parsed.data.outputFolder ? resolve(parsed.data.outputFolder) : state.outputFolder;

  if (!outputFolder) {
    response.status(400).json({ error: 'Select an output folder before processing files.' });
    return;
  }

  try {
    await ensureDirectory(outputFolder);
    const processResult = await processAlbums(parsed.data.albums, outputFolder, {
      outputFormat: parsed.data.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
      prefixTrackNumbers: parsed.data.prefixTrackNumbers,
    });
    await writeAppState({
      ...state,
      outputFolder,
    });
    response.json(processResult);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown processing error',
    });
  }
});

app.post('/api/library/retry-metadata-jobs', async (request, response) => {
  const parsed = retryMetadataSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const currentState = await readAppState();
  const metadataProvider = parsed.data.metadataProvider ?? currentState.metadataProvider;

  if (metadataProvider === 'local-only') {
    response.status(400).json({ error: 'Metadata retry requires an external lookup provider.' });
    return;
  }

  const job = createJob('metadata-retry', 'Queued failed metadata retry');
  markJobRunning(job.id, 'Retrying failed metadata lookups');

  void (async () => {
    try {
      const importResult = await retryMetadataForImportedAlbums(parsed.data.sourcePath, parsed.data.albums, {
        existingWarnings: parsed.data.warnings,
        onProgress: (update) => updateJobProgress(job.id, update),
      });

      await writeAppState({
        ...currentState,
        lastSourcePath: resolve(parsed.data.sourcePath),
        metadataProvider,
      });

      completeJob(job.id, importResult, 'Metadata retry complete');
    } catch (error) {
      failJob(job.id, error instanceof Error ? error.message : 'Unknown metadata retry error');
    }
  })();

  response.status(202).json(job);
});

app.post('/api/library/process-jobs', async (request, response) => {
  const parsed = processSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const state = await readAppState();
  const outputFolder = parsed.data.outputFolder ? resolve(parsed.data.outputFolder) : state.outputFolder;

  if (!outputFolder) {
    response.status(400).json({ error: 'Select an output folder before processing files.' });
    return;
  }

  const job = createJob('process', 'Queued library processing job');
  markJobRunning(job.id, `Starting ${parsed.data.outputFormat === 'mp3-320' ? 'conversion' : 'copy'} job`);

  void (async () => {
    try {
      await ensureDirectory(outputFolder);
      const processResult = await processAlbums(parsed.data.albums, outputFolder, {
        outputFormat: parsed.data.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
        prefixTrackNumbers: parsed.data.prefixTrackNumbers,
        onProgress: (update) => updateJobProgress(job.id, update),
      });

      await writeAppState({
        ...state,
        outputFolder,
      });

      completeJob(job.id, processResult, 'Library processing complete');
    } catch (error) {
      failJob(job.id, error instanceof Error ? error.message : 'Unknown processing error');
    }
  })();

  response.status(202).json(job);
});

app.get('/api/jobs/:jobId', (request, response) => {
  const job = getJob(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: `Job not found: ${request.params.jobId}` });
    return;
  }

  response.json(job);
});

app.listen(port, () => {
  console.log(`Music Cleaner Upper API listening on http://localhost:${port}`);
});