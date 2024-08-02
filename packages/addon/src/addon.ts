import { Cache, MetaDetail, MetaVideo, Stream } from 'stremio-addon-sdk';
import addonBuilder from 'stremio-addon-sdk/src/builder';
import landingTemplate from 'stremio-addon-sdk/src/landingTemplate';
import { catalog, manifest } from './manifest';
import {
  buildSearchQuery,
  createStreamPath,
  createStreamUrl,
  createThumbnailUrl,
  getDuration,
  getFileExtension,
  getPostTitle,
  getQuality,
  getSize,
  isBadVideo,
  logError,
} from './utils';
import { EasynewsAPI, SearchOptions, createBasic } from '@easynews/api';
import { publicMetaProvider } from './meta';
import { fromHumanReadable, toDirection } from './sort-option';

const builder = new addonBuilder(manifest);

const prefix = `${catalog.id}:`;

builder.defineCatalogHandler(async ({ extra: { search } }) => {
  return {
    metas: [
      {
        id: `${prefix}${encodeURIComponent(search)}`,
        name: search,
        type: 'tv',
        logo: manifest.logo,
        background: manifest.background,
        posterShape: 'square',
        poster: manifest.logo,
        description: `Provides search results from Easynews for '${search}'`,
      },
    ],
    cacheMaxAge: 3600 * 24 * 30, // The returned data is static so it may be cached for a long time (30 days).
  };
});

builder.defineMetaHandler(
  async ({ id, type, config: { username, password } }) => {
    try {
      if (!id.startsWith(catalog.id)) {
        return { meta: null as unknown as MetaDetail };
      }

      const search = decodeURIComponent(id.replace(prefix, ''));

      const videos: MetaVideo[] = [];

      const api = new EasynewsAPI({ username, password });
      const res = await api.searchAll({ query: search });

      if (!res || !Array.isArray(res.data)) {
        return { meta: null as unknown as MetaDetail };
      }

      // Fetch all public video URLs in parallel.
      // This might take a while depending on the number of items.
      const urls = await Promise.all(
        res.data.map((file) =>
          api.resolveRedirectLocation(
            `${createStreamUrl(res)}/${createStreamPath(file)}`
          )
        )
      );

      for (let i = 0; i < res.data.length; i++) {
        const file = res.data[i];

        if (isBadVideo(file)) {
          continue;
        }

        const title = getPostTitle(file);

        const url = urls[i];

        if (!url) {
          continue;
        }

        videos.push({
          id: `${prefix}${file.sig}`,
          released: new Date(file['5']).toISOString(),
          title,
          overview: file['6'],
          thumbnail: createThumbnailUrl(res, file),
          streams: [
            mapStream({
              username,
              password,
              title,
              fullResolution: file.fullres,
              fileExtension: getFileExtension(file),
              duration: getDuration(file),
              size: getSize(file),
              url,
              videoSize: file.rawSize,
            }),
          ],
        });
      }

      return {
        meta: {
          id,
          name: search,
          type: 'tv',
          logo: manifest.logo,
          background: manifest.background,
          poster: manifest.logo,
          posterShape: 'square',
          description: `Provides search results from Easynews for '${search}'`,
          videos,
        },
        ...getCacheOptions(videos.length),
      };
    } catch (error) {
      logError({
        message: 'failed to handle meta',
        error,
        context: { resource: 'meta', id, type },
      });
      return { meta: null as unknown as MetaDetail };
    }
  }
);

builder.defineStreamHandler(
  async ({ id, type, config: { username, password, ...options } }) => {
    try {
      if (!id.startsWith('tt')) {
        return { streams: [] };
      }

      // Sort options are profiled as human-readable strings in the manifest.
      // so we need to convert them back to their internal representation
      // before passing them to the search function below.
      const sortOptions: Partial<SearchOptions> = {
        sort1: fromHumanReadable(options.sort1),
        sort2: fromHumanReadable(options.sort2),
        sort3: fromHumanReadable(options.sort3),
        sort1Direction: toDirection(options.sort1Direction),
        sort2Direction: toDirection(options.sort2Direction),
        sort3Direction: toDirection(options.sort3Direction),
      };

      const meta = await publicMetaProvider(id, type);

      const api = new EasynewsAPI({ username, password });

      let res = await api.search({
        ...sortOptions,
        query: buildSearchQuery(type, { ...meta, year: undefined }),
      });

      if (res?.data?.length <= 1 && meta.year !== undefined) {
        res = await api.search({
          ...sortOptions,
          query: buildSearchQuery(type, meta),
        });
      }

      if (!res || !Array.isArray(res.data)) {
        return { streams: [] };
      }

      const streams: Stream[] = [];

      const urls = await Promise.all(
        res.data.map((file) =>
          api.resolveRedirectLocation(
            `${createStreamUrl(res)}/${createStreamPath(file)}`
          )
        )
      );

      for (let i = 0; i < res.data.length; i++) {
        const file = res.data[i];

        if (isBadVideo(file)) {
          continue;
        }

        const url = urls[i];

        if (!url) {
          continue;
        }

        streams.push(
          mapStream({
            username,
            password,
            fullResolution: file.fullres,
            fileExtension: getFileExtension(file),
            duration: getDuration(file),
            size: getSize(file),
            title: getPostTitle(file),
            url,
            videoSize: file.rawSize,
          })
        );
      }

      return { streams, ...getCacheOptions(streams.length) };
    } catch (error) {
      logError({
        message: 'failed to handle stream',
        error,
        context: { resource: 'stream', id, type },
      });
      return { streams: [] };
    }
  }
);

function mapStream({
  username,
  password,
  duration,
  size,
  fullResolution,
  title,
  fileExtension,
  videoSize,
  url,
}: {
  title: string;
  url: string;
  username: string;
  password: string;
  fileExtension: string;
  videoSize: number | undefined;
  duration: string | undefined;
  size: string | undefined;
  fullResolution: string | undefined;
}): Stream {
  const quality = getQuality(title, fullResolution);

  return {
    name: `Easynews+${quality ? `\n${quality}` : ''}`,
    description: [
      `${title}${fileExtension}`,
      `🕛 ${duration ?? 'unknown duration'}`,
      `📦 ${size ?? 'unknown size'}`,
    ].join('\n'),
    url: url,
    behaviorHints: {
      fileName: title,
      videoSize,
    } as Stream['behaviorHints'],
  };
}

function getCacheOptions(itemsLength: number): Partial<Cache> {
  if (itemsLength === 0) {
    return {};
  }

  const oneDay = 3600 * 24;
  const oneWeek = oneDay * 7;

  return {
    cacheMaxAge: oneWeek,
    staleError: oneDay,
    staleRevalidate: oneDay,
  };
}

export const addonInterface = builder.getInterface();
export const landingHTML = landingTemplate(addonInterface.manifest);
