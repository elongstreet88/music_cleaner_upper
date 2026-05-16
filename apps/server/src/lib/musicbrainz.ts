import { normalizeSearchText } from './filesystem.js';

interface MusicBrainzArtistCredit {
  name: string;
}

interface MusicBrainzReleaseSearchResult {
  id: string;
  title: string;
  score?: number | string;
  date?: string;
  'medium-count'?: number;
  'artist-credit'?: MusicBrainzArtistCredit[];
}

interface MusicBrainzReleaseSearchResponse {
  releases?: MusicBrainzReleaseSearchResult[];
}

interface MusicBrainzTrack {
  number?: string;
  title?: string;
  recording?: {
    title?: string;
  };
  'artist-credit'?: MusicBrainzArtistCredit[];
}

interface MusicBrainzMedium {
  position?: number;
  tracks?: MusicBrainzTrack[];
}

interface MusicBrainzReleaseDetail {
  id: string;
  title: string;
  date?: string;
  media?: MusicBrainzMedium[];
  'artist-credit'?: MusicBrainzArtistCredit[];
}

export interface CanonicalReleaseTrack {
  discNumber: number;
  trackNumber: number;
  title: string;
  artist: string;
}

export interface CanonicalRelease {
  id: string;
  title: string;
  artist: string;
  score: number;
  year?: number;
  sourceUrl: string;
  tracks: CanonicalReleaseTrack[];
}

const musicBrainzBaseUrl = 'https://musicbrainz.org/ws/2';
const userAgent = 'music-cleaner-upper/0.1.0 (local development app)';
const retryableStatuses = new Set([429, 500, 502, 503, 504]);
const maxRetryAttempts = 6;
const retryBaseDelayMs = 500;

function parseYear(date?: string): number | undefined {
  if (!date) {
    return undefined;
  }

  const match = date.match(/^(\d{4})/);
  if (!match) {
    return undefined;
  }

  const parsedYear = Number.parseInt(match[1], 10);
  return Number.isNaN(parsedYear) ? undefined : parsedYear;
}

function joinArtistCredits(credits?: MusicBrainzArtistCredit[]): string {
  return credits?.map((credit) => credit.name).join(', ') ?? '';
}

function parseRetryAfterDelay(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const seconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(seconds)) {
    return Math.max(seconds * 1000, 0);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(retryAt - Date.now(), 0);
}

function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetryAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const shouldRetry = retryableStatuses.has(response.status) && attempt < maxRetryAttempts;
      const error = new Error(`MusicBrainz request failed with ${response.status}`);

      if (!shouldRetry) {
        throw error;
      }

      lastError = error;
      const retryDelay = parseRetryAfterDelay(response.headers.get('retry-after')) ?? retryBaseDelayMs * 2 ** (attempt - 1);
      await wait(retryDelay);
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error('MusicBrainz request failed');

      if (attempt >= maxRetryAttempts) {
        throw resolvedError;
      }

      lastError = resolvedError;
      await wait(retryBaseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error('MusicBrainz request failed');
}

function scoreReleaseCandidate(
  release: MusicBrainzReleaseSearchResult,
  expectedAlbum: string,
  expectedArtist: string,
  totalDiscs: number,
): number {
  const baseScore = typeof release.score === 'string' ? Number.parseInt(release.score, 10) : release.score ?? 0;
  const normalizedReleaseTitle = normalizeSearchText(release.title);
  const normalizedAlbum = normalizeSearchText(expectedAlbum);
  const normalizedReleaseArtist = normalizeSearchText(joinArtistCredits(release['artist-credit']));
  const normalizedArtist = normalizeSearchText(expectedArtist);

  let score = baseScore;

  if (normalizedReleaseTitle === normalizedAlbum) {
    score += 20;
  }

  if (normalizedReleaseArtist === normalizedArtist) {
    score += 20;
  }

  if (release['medium-count'] === totalDiscs) {
    score += 15;
  }

  return score;
}

function scoreReleaseDetail(
  detail: MusicBrainzReleaseDetail,
  input: {
    totalDiscs: number;
    year?: number;
    tracks: Array<{ discNumber: number; trackNumber: number; title: string }>;
  },
): number {
  let score = 0;
  const detailYear = parseYear(detail.date);

  if ((detail.media?.length ?? 0) === input.totalDiscs) {
    score += 20;
  }

  if (input.year && detailYear) {
    if (input.year === detailYear) {
      score += 20;
    } else {
      score -= Math.min(Math.abs(input.year - detailYear) * 2, 20);
    }
  }

  const trackLookup = new Map(
    input.tracks.map((track) => [`${track.discNumber}:${track.trackNumber}`, normalizeSearchText(track.title)]),
  );

  for (const medium of detail.media ?? []) {
    const discNumber = medium.position ?? 1;

    for (const track of medium.tracks ?? []) {
      const trackNumber = Number.parseInt(track.number ?? '', 10);
      if (Number.isNaN(trackNumber)) {
        continue;
      }

      const localTitle = trackLookup.get(`${discNumber}:${trackNumber}`);
      if (!localTitle) {
        continue;
      }

      const releaseTitle = normalizeSearchText(track.title || track.recording?.title || '');

      if (releaseTitle === localTitle) {
        score += 12;
      } else if (releaseTitle.includes(localTitle) || localTitle.includes(releaseTitle)) {
        score += 6;
      } else {
        score -= 4;
      }
    }
  }

  return score;
}

export async function fetchCanonicalRelease(input: {
  artist: string;
  album: string;
  totalDiscs: number;
  year?: number;
  tracks: Array<{ discNumber: number; trackNumber: number; title: string }>;
}): Promise<CanonicalRelease | null> {
  const searchQuery = `artist:"${input.artist}" AND release:"${input.album}"`;
  const searchUrl = `${musicBrainzBaseUrl}/release/?fmt=json&limit=10&query=${encodeURIComponent(searchQuery)}`;
  const searchResponse = await fetchJson<MusicBrainzReleaseSearchResponse>(searchUrl);
  const releases = searchResponse.releases ?? [];

  if (releases.length === 0) {
    return null;
  }

  const detailedCandidates = (await Promise.allSettled(
    releases.slice(0, 5).map(async (release) => {
      const detailUrl = `${musicBrainzBaseUrl}/release/${release.id}?fmt=json&inc=artist-credits+recordings`;
      const detail = await fetchJson<MusicBrainzReleaseDetail>(detailUrl);
      const score =
        scoreReleaseCandidate(release, input.album, input.artist, input.totalDiscs) +
        scoreReleaseDetail(detail, input);

      return { detail, release, score };
    }),
  )).flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));

  if (detailedCandidates.length === 0) {
    return null;
  }

  const bestCandidate = detailedCandidates.sort((left, right) => right.score - left.score)[0];

  if (!bestCandidate) {
    return null;
  }

  const { detail, release: bestRelease, score } = bestCandidate;
  const albumArtist = joinArtistCredits(detail['artist-credit']) || input.artist;

  const tracks: CanonicalReleaseTrack[] = [];

  for (const medium of detail.media ?? []) {
    const discNumber = medium.position ?? tracks.length + 1;

    for (const track of medium.tracks ?? []) {
      const parsedTrackNumber = Number.parseInt(track.number ?? '', 10);
      if (Number.isNaN(parsedTrackNumber)) {
        continue;
      }

      tracks.push({
        discNumber,
        trackNumber: parsedTrackNumber,
        title: track.title || track.recording?.title || 'Unknown Title',
        artist: joinArtistCredits(track['artist-credit']) || albumArtist,
      });
    }
  }

  return {
    id: detail.id,
    title: detail.title,
    artist: albumArtist,
    score,
    year: parseYear(detail.date) ?? parseYear(bestRelease.date),
    sourceUrl: `https://musicbrainz.org/release/${detail.id}`,
    tracks,
  };
}