import { createBasic } from './utils';
import { EasynewsSearchResponse, FileData } from './types';

export class EasynewsAPI {
  private readonly baseUrl = 'https://members.easynews.com';
  private readonly headers: Headers;

  constructor(options: { username: string; password: string }) {
    if (!options) {
      throw new Error('Missing options');
    }

    this.headers = new Headers();
    const basic = createBasic(options.username, options.password);
    this.headers.append('Authorization', basic);
  }

  async search(query: string, pageNr = 1, maxResults = 1000) {
    const searchParams = {
      st: 'adv',
      sb: '1',
      fex: 'm4v,3gp,mov,divx,xvid,wmv,avi,mpg,mpeg,mp4,mkv,avc,flv,webm',
      'fty[]': 'VIDEO',
      spamf: '1',
      u: '1',
      gx: '1',
      pno: pageNr.toString(),
      sS: '3',
      s1: 'relevance',
      s1d: '-',
      s2: 'dsize',
      s2d: '-',
      s3: 'dtime',
      s3d: '-',
      pby: maxResults.toString(),
      safeO: '0',
      gps: query,
    };

    const url = new URL(`${this.baseUrl}/2.0/search/solr-search/advanced`);
    url.search = new URLSearchParams(searchParams).toString();

    const res = await fetch(url, {
      headers: this.headers,
      signal: AbortSignal.timeout(20_000), // 20 seconds
    });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch search results of query '${query}': ${res.status} ${res.statusText}`
      );
    }

    const json = await res.json();

    return json as EasynewsSearchResponse;
  }

  async searchAll(query: string): Promise<EasynewsSearchResponse> {
    const data: FileData[] = [];
    let res: EasynewsSearchResponse;
    let pageNr = 1;

    while (true) {
      res = await this.search(query, pageNr);

      // No more results.
      if (res.data.length === 0) {
        break;
      }

      data.push(...res.data);

      pageNr++;
    }

    res.data = data;

    return res;
  }
}