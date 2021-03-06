import jquery from 'jquery';
import cheerio from 'cheerio';
import {
  LatestHotManga,
  Manga,
  MangaCallback,
  MangaChapters,
  MangaFilters,
  MangaGenre,
  MangaMeta,
  MangaOrder,
  MangaParkGenres,
  MangaParkOrderBy,
  MangaRating,
  MangaSearch,
  MangaStatus,
  MangaType,
  ScrapingOptions,
} from '..';
import failure from '../functions/failure';
import readHtml from '../functions/readHtml';
import success from '../functions/success';
import automateBrowser from '../functions/automateBrowser';

export type MangaParkMeta = {
  title: {
    main: string;
    alt?: string[];
  };
  authors: string[];
  artists: string[];
  coverImage: string;
  summary: string;
  genres: MangaGenre<MangaPark>[];
  type: MangaType<MangaPark>;
  status: Omit<MangaStatus<MangaPark>, 'any'>;
  rating: MangaRating;
  popularity: string;
  chapters: {
    recentlyUpdated?: 'duck' | 'fox' | 'rock' | 'panda' | 'mini' | 'toon';
    duck: MangaChapters<MangaPark>[];
    fox: MangaChapters<MangaPark>[];
    rock: MangaChapters<MangaPark>[];
    panda: MangaChapters<MangaPark>[];
    mini: MangaChapters<MangaPark>[];
    toon: MangaChapters<MangaPark>[];
  };
};

export interface MangaParkLatestHotManga {
  title: string;
  url: string;
  coverImage: string;
  updatedWhen: string;
  genres: MangaGenre<MangaPark>[];
}

export type MangaParkManga = {
  title: string;
  url: string;
  authors: string[];
  coverImage: string;
  genres: string[];
  rating: MangaRating;
};

export interface MangaParkOptions {
  genres?: {
    include?: MangaGenre<MangaPark>[];
    exclude?: MangaGenre<MangaPark>[];
  };
  status?: MangaStatus<MangaPark> | 'any';
  rating?: '5☆' | '4☆' | '3☆' | '2☆' | '1☆' | '0☆' | 'any';
  type?: MangaType<MangaPark> | 'any';
  yearReleased?: string;
  orderBy?: MangaOrder<MangaPark>;
  page?: number;
}

export type MangaParkGenre = keyof typeof MangaParkGenres;

let memo: string[] = [];

export default class MangaPark {
  private options: ScrapingOptions;

  constructor(options: ScrapingOptions = {}) {
    this.options = options;
  }

  /**
   * Search up a manga from MangaParkv2
   *
   * @param query - Title of manga. By default, it searches for titles matching this value. If you want to search for author and/or title, pass in an object containing either/both `author` and/or `title`.
   * @param filters - Filters to apply to query
   * @param callback - Callback function
   * @returns Returns an array of mangas from MangaPark (v2)
   * @example
   * ```js
   * const mangapark = new MangaPark();
   * ```
   * ```js
   * mangapark.search('Berserk');
   * ```
   * ```js
   * mangapark.search({ author: 'Gotouge Koyoharu' })
   * ```
   * ```js
   * mangapark.search(null, { type: 'manga', genre: { include: ['Horror'] } })
   * ```
   */
  search(
    query: MangaSearch<MangaPark> = '',
    filters: MangaFilters<MangaPark> = {},
    callback: MangaCallback<Manga<MangaPark>[]> = () => void 0,
  ): Promise<Manga<MangaPark>[]> {
    if (query == null) query = '';
    if (filters == null) filters = {};

    const {
      genres,
      status = 'any',
      rating = 'any',
      type = 'any',
      yearReleased,
      orderBy = 'most_views',
      page = 1,
    } = filters;

    const url = (() => {
      const queryParam = (() => {
        if (query == null || (typeof query === 'string' && query.length === 0)) return '';
        if (typeof query === 'string') return `q=${encodeURIComponent(query)}`;

        let author;
        let _query;

        if (query.author == null) author = '';
        else author = `autart=${encodeURIComponent(query.author)}`;
        if (query.title == null) _query = '';
        else _query = `q=${encodeURIComponent(query.title)}`;
        return [_query, author].filter((item) => item.length !== 0).join('');
      })();

      const includeGenres =
        genres && genres.include && genres.include.length > 0
          ? `genres=${genres.include.map((genre) => MangaParkGenres[genre])}`
          : '';

      const excludeGenres =
        genres && genres.exclude && genres.exclude.length > 0
          ? `genres-exclude=${genres.exclude.map((genre) => MangaParkGenres[genre])}`
          : '';

      const mangaRating = rating !== 'any' ? `rating=${rating.substring(0, 0)}` : '';

      const mangaStatus = status !== 'any' ? `status=${status}` : '';

      const mangaType = type !== 'any' ? `types=${type}` : '';

      const year = yearReleased ? `years=${yearReleased}` : '';

      const order = `orderby=${MangaParkOrderBy[orderBy]}`;

      const args = [
        queryParam,
        includeGenres,
        excludeGenres,
        mangaRating,
        mangaStatus,
        mangaType,
        year,
        order,
        'st-ss=0',
        `page=${page}`,
      ]
        .filter((i) => i.length !== 0)
        .join('&');

      return `https://v2.mangapark.net/search?${args}`;
    })();

    return new Promise(async (res, rej) => {
      if (typeof page !== 'number') return failure('"page" must be a number', callback, rej);
      if (page == null) return failure('Missing argument "page" is required', callback, rej);
      try {
        // Parse HTML document
        const $ = await readHtml(url, this.options);
        const titleURLs = $('h2 > a')
          .map((_, el) => {
            const anchorEl = $(el);
            const href = `https://v2.mangapark.net${anchorEl.attr('href')}` || '';
            const title = anchorEl.attr('title') || '';
            return {
              url: href,
              title,
            };
          })
          .get();

        const authors = $('div:contains("Authors/Artists") > b.pd')
          .prevAll()
          .map((_, el) => {
            const text = $(el).text();
            if (!text.match('Authors/Artists:')) memo = [...memo, text];
            else {
              const prevMemo = memo;
              memo = [];
              return [prevMemo];
            }
          })
          .get();

        const mangaGenres = $('div.field.last > a')
          .map((_, el) => {
            const anchorEl = $(el);
            const text = anchorEl.text();
            if (anchorEl.next().is('a')) memo = [...memo, text];
            else {
              const prevMemo = memo;
              memo = [];
              return [prevMemo];
            }
          })
          .get();

        const mangaRating = $('div.rate').map((_, el) => {
          const divEl = $(el);
          const ratingText = divEl.attr('title')?.split(' ') || [];
          const numerator = Number(ratingText[1]);
          const denominator = Number(ratingText[3]);
          const voteCount = Number(ratingText[6]).toLocaleString();
          return {
            sourceRating: 'MangaPark.net',
            voteCount,
            ratingPercentage: `${((numerator / denominator) * 100).toFixed(2)}%`,
            ratingStars: `${numerator} / ${denominator}`,
          };
        });

        const coverImage: string[] = $('a.cover > img')
          .map((_, el) => $(el).attr('src') ?? '')
          .get();

        const data = titleURLs.map(({ title, url: mangaUrl }, i) => ({
          title,
          url: mangaUrl,
          authors: authors[i],
          coverImage: coverImage[i],
          genres: mangaGenres[i],
          rating: mangaRating[i],
        }));

        success(data, callback, res);
      } catch (e) {
        failure(e, callback, rej);
      }
    });
  }

  /**
   * Get the metadata of a manga
   *
   * @param url - URL of manga
   * @param callback - Callback function
   * @returns Returns the metadata of a manga
   * @example
   * ```js
   * const mangapark = new MangaPark();
   * ```
   * ```js
   * await mangapark.getMangaMeta('https://v2.mangapark.net/manga/berserk');
   * ```
   */
  public getMangaMeta(
    url: string,
    callback: MangaCallback<MangaMeta<MangaPark>> = () => void 0,
  ): Promise<MangaMeta<MangaPark>> {
    return new Promise(async (res, rej) => {
      if (url == null) return failure('Missing argument "url" is required', callback, rej);

      try {
        // Parse HTML document
        const html = await automateBrowser(
          this.options,
          async (page) => {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('h2');
            return await page.evaluate(() => document.documentElement.innerHTML);
          },
          { resource: { method: 'unblock', type: ['document'] } },
        );

        const $ = cheerio.load(html);

        const mainTitle = $('h2 > a').text().split(' ').slice(0, -1).join(' ');

        const altTitles = $('th:contains("Alternative")')
          .siblings('td')
          .map((_, el) =>
            $(el)
              .text()
              .trim()
              .split(';')
              .map((text) => text.trim()),
          )
          .get();

        const rating: MangaRating = (() => {
          const textArray = $('th:contains("Rating")').siblings('td').text().trim().split(' ');
          const numerator = Number(textArray[1]);
          const denominator = Number(textArray[3]);
          const voteCount = Number(textArray[6]).toLocaleString();
          return {
            sourceRating: 'MangaPark.net',
            voteCount,
            ratingPercentage: `${((numerator / denominator) * 100).toFixed(2)}%`,
            ratingStars: `${numerator} / ${denominator}`,
          };
        })();
        const authors = $('th:contains("Author(s)")')
          .siblings('td')
          .children()
          .map((_, el) => $(el).text().trim())
          .get();
        const artists = $('th:contains("Artist(s)")')
          .siblings('td')
          .children()
          .map((_, el) => $(el).text().trim())
          .get();
        const genres = $('th:contains("Genre(s)")')
          .siblings('td')
          .children()
          .map((_, el) => $(el).text().trim() as MangaGenre<MangaPark>)
          .get();
        const type = (() => {
          let mangaType = $('th:contains("Type")').siblings().text().trim().split(' ')[1];
          if (mangaType === 'Webtoon') mangaType = 'manhwa';
          return mangaType.toLowerCase() as MangaType<MangaPark>;
        })();
        const status: MangaMeta<MangaPark>['status'] = $('th:contains("Status")')
          .siblings()
          .text()
          .trim()
          .toLowerCase();
        const summary = $('div.summary').children().remove().end().text().trim();
        const coverImage: string = (() => $('img.w-100').attr('src') ?? '')();

        const sourceChapters: MangaChapters<MangaPark>[][] = [[], [], [], [], [], []];
        $('div.volumes').each((_, div) => {
          const container = $(div);
          const version = container
            .siblings()
            .find('div > a > span')
            .text()
            .slice(8)
            .toLowerCase() as MangaMeta<MangaPark>['chapters']['recentlyUpdated'];

          const mangaChapters = container
            .find('a.visited.ch')
            .map((__, a) => {
              const anchorEl = $(a);
              const chapterUrl = `https://v2.mangapark.net${anchorEl.attr('href')?.slice(0, -1)}` || '';
              const name = anchorEl.text();
              return {
                name,
                url: chapterUrl,
              };
            })
            .get();

          const uploadWhen = container
            .find('span.time')
            .map((__, span) => $(span).text().trim())
            .get();

          const data = mangaChapters.map(({ url: chapterUrl, name }, i) => ({
            name,
            url: chapterUrl,
            uploadWhen: uploadWhen[i],
          }));

          switch (version) {
            case 'duck':
              sourceChapters[0] = data;
              break;
            case 'fox':
              sourceChapters[1] = data;
              break;
            case 'rock':
              sourceChapters[2] = data;
              break;
            case 'panda':
              sourceChapters[3] = data;
              break;
            case 'mini':
              sourceChapters[4] = data;
              break;
            case 'toon':
              sourceChapters[5] = data;
            default:
              break;
          }
        });

        const recommendedSource = $('div#list > div.stream')
          .filter((_, el) => !$(el).hasClass('collapsed'))
          .find('div > div > a > span')
          .text()
          .substring(8)
          .toLowerCase() as NonNullable<MangaMeta<MangaPark>['chapters']['recentlyUpdated']>;

        const chapters: MangaMeta<MangaPark>['chapters'] = {
          recentlyUpdated: recommendedSource.length === 0 ? undefined : recommendedSource,
          duck: sourceChapters[0],
          fox: sourceChapters[1],
          rock: sourceChapters[2],
          panda: sourceChapters[3],
          mini: sourceChapters[4],
          toon: sourceChapters[5],
        };

        const popularity =
          $('tr > th:contains("Popularity")')
            .siblings('td')
            .text()
            .trim()
            .match(/\d+\w{2}/)
            ?.toString() ?? '?';

        success(
          {
            title: {
              main: mainTitle,
              alt: altTitles.filter((title) => title.length !== 0),
            },
            summary,
            coverImage,
            authors,
            artists: artists.filter((artist) => artist.length !== 0),
            popularity,
            genres,
            rating,
            type,
            status,
            chapters,
          },
          callback,
          res,
        );
      } catch (e) {
        failure(e, callback, rej);
      }
    });
  }

  /**
   * Get a list of mangas from MangaPark's latest manga releases
   *
   * @param options - Options to provide when getting latest updates
   * @param callback - Callback function
   * @returns Returns an array of mangas from MangaPark's latest manga releases page
   */
  public getLatestUpdates(
    options: { page: number } = { page: 1 },
    callback: MangaCallback<LatestHotManga<MangaPark>[]> = () => void 0,
  ): Promise<LatestHotManga<MangaPark>[]> {
    const { page } = options;
    return new Promise(async (res, rej) => {
      if (page < 1) return failure('Argument "page" must be greater than or equal to 1', callback, rej);
      try {
        const $ = await readHtml(
          `https://v2.mangapark.net/latest/${page}`,
          this.options,
          { resource: { type: ['document', 'image'], method: 'unblock' } },
          'domcontentloaded',
        );
        const itemsOnPage = $('div.d-flex.flex-row.item');
        const lengthOfItems = itemsOnPage.length;
        const mangas: LatestHotManga<MangaPark>[] = [];

        for (let i = 0; i < lengthOfItems; i++) {
          const divContainer = itemsOnPage.eq(i);
          const anchorEl = divContainer.children('a');
          const title = $(anchorEl).attr('title') ?? '';
          const href = $(anchorEl).attr('href') ?? '';
          const imgEl = $(anchorEl).children('img');
          const src = $(imgEl).attr('src') ?? '';
          const genres = divContainer
            .find('div.mb-2.gens')
            .map((_, el) => $(el).text().trim().split(', '))
            .get() as MangaGenre<MangaPark>[];
          const uploadWhen = divContainer.children('ul').children('li').eq(0).find('span.time').text();
          mangas.push({
            title,
            url: `https://v2.mangapark.net${href}`,
            coverImage: src,
            genres,
            updatedWhen: uploadWhen,
          });
        }

        success(mangas, callback, res);
      } catch (e) {
        failure(e, callback, rej);
      }
    });
  }

  /**
   * Get raw image URLs from a chapter URL. Since MangaPark uses Cloudflare, make sure to add `referer: https://v2.mangapark.net/` to every GET request when fetching the image or else the image will not load.
   *
   * @param url - URL of chapter
   * @param callback - Callback function
   * @returns Returns an array of strings that contain the img URLs of the pages from the chapter URL
   * @example
   * ```js
   * const mangapark = new MangaPark();
   * ```
   * ```js
   * await mangapark.getPages('https://xcdn-222.mangapark.net/10102/69/9b/5c791a3ae9c047226f2bb996/02_75696_711_1114.webp');
   * ```
   */
  public getPages(url: string, callback: MangaCallback<string[]> = () => void 0): Promise<string[]> {
    const BLOCKED_REQUESTS = [
      'https://v2.mangapark.net/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/',
      'https://cdnjs.cloudflare.com/ajax/libs/jquery_lazyload/',
      'https://cdnjs.cloudflare.com/ajax/libs/axios/',
      'https://static.mangapark.net/v2/js/global.js',
      'https://static.mangapark.net/v2/js/manga-global.js',
      'https://v2.mangapark.net/book-list/',
      'https://mangapark.net/misc/',
      'https://mangaparkcom.disqus.com/',
      'https://www.googletagmanager.com/',
      'https://hm.baidu.com/',
      'https://s7.addthis.com/',
      'https://tags.crwdcntrl.net/',
      'https://cdn.run-syndicate.com/',
      'https://go.bebi.com/',
      'https://st.bebi.com/',
      'https://run-syndicate.com/',
      'https://platform.bidgear.com/',
    ];

    return new Promise(async (res, rej) => {
      if (url == null) return failure('Missing argument "url" is required', callback, rej);

      try {
        const data = await automateBrowser(
          this.options,
          async (page) => {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.addScriptTag({ path: require.resolve('jquery') });
            await page.waitForSelector('a.img-link');
            return await page.evaluate(() => {
              const { $ } = window as typeof window & { $: typeof jquery };
              return $('a.img-link > img')
                .map((_, el) => $(el).attr('src') || '')
                .get();
            });
          },
          {
            domains: { method: 'block', value: BLOCKED_REQUESTS },
            resource: { method: 'unblock', type: ['document', 'script'] },
          },
        );
        success(data, callback, res);
      } catch (e) {
        failure(e, callback, rej);
      }
    });
  }
}
