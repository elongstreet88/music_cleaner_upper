import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCanonicalRelease } from '../src/lib/musicbrainz.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    status: init?.status,
    statusText: init?.statusText,
  });
}

describe('fetchCanonicalRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries transient 503 search failures and then succeeds', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/release/?')) {
        const callCount = fetchMock.mock.calls.filter(([request]) => String(request).includes('/release/?')).length;

        if (callCount === 1) {
          return new Response(null, {
            status: 503,
            headers: {
              'Retry-After': '0',
            },
          });
        }

        return jsonResponse({
          releases: [
            {
              id: 'release-1',
              title: 'Millennium',
              score: 100,
              date: '1999-05-18',
              'medium-count': 1,
              'artist-credit': [{ name: 'Backstreet Boys' }],
            },
          ],
        });
      }

      if (url.includes('/release/release-1?')) {
        return jsonResponse({
          id: 'release-1',
          title: 'Millennium',
          date: '1999-05-18',
          'artist-credit': [{ name: 'Backstreet Boys' }],
          media: [
            {
              position: 1,
              tracks: [{ number: '1', title: 'Larger Than Life' }],
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchCanonicalRelease({
      artist: 'Backstreet Boys',
      album: 'Millennium',
      totalDiscs: 1,
      year: 1999,
      tracks: [{ discNumber: 1, trackNumber: 1, title: 'Larger Than Life' }],
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result?.id).toBe('release-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips release-detail candidates that keep failing when another candidate succeeds', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/release/?')) {
        return jsonResponse({
          releases: [
            {
              id: 'broken-release',
              title: 'Millennium',
              score: 95,
              date: '1999-05-18',
              'medium-count': 1,
              'artist-credit': [{ name: 'Backstreet Boys' }],
            },
            {
              id: 'good-release',
              title: 'Millennium',
              score: 90,
              date: '1999-05-18',
              'medium-count': 1,
              'artist-credit': [{ name: 'Backstreet Boys' }],
            },
          ],
        });
      }

      if (url.includes('/release/broken-release?')) {
        return new Response(null, {
          status: 503,
          headers: {
            'Retry-After': '0',
          },
        });
      }

      if (url.includes('/release/good-release?')) {
        return jsonResponse({
          id: 'good-release',
          title: 'Millennium',
          date: '1999-05-18',
          'artist-credit': [{ name: 'Backstreet Boys' }],
          media: [
            {
              position: 1,
              tracks: [{ number: '1', title: 'Larger Than Life' }],
            },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchCanonicalRelease({
      artist: 'Backstreet Boys',
      album: 'Millennium',
      totalDiscs: 1,
      year: 1999,
      tracks: [{ discNumber: 1, trackNumber: 1, title: 'Larger Than Life' }],
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result?.id).toBe('good-release');
  });
});