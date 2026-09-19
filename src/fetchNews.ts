import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_MODEL } from "./providers/gemini.js";
import { toYahooTicker } from "./config.js";
import type { QuoteData } from "./fetchPrices.js";

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_API_BASE = "https://newsapi.org/v2/everything";

const MAX_ARTICLES_PER_TICKER = 3;
const BATCH_SIZE = 5;

// Override search terms for tickers where the Yahoo name is too generic
// or unhelpful.
const TICKER_NAME_OVERRIDES: Record<string, string[]> = {
  VOO: ["S&P 500", "S&P500"],
  QQQ: ["Nasdaq", "NASDAQ"],
  SMH: ["semiconductor ETF", "chip stocks"],
  XLU: ["utilities ETF", "utility stocks"],
  XLV: ["healthcare ETF", "health stocks"],
  ITA: ["defense ETF", "aerospace ETF"],
  GLD: ["gold price", "gold ETF", "gold futures"],
  BSV: ["bond ETF", "bond market", "treasury bond", "fixed income"],
  ESGU: ["ESG investing", "ESG fund"],
  IJH: ["mid-cap ETF", "midcap stocks"],
  AIQ: ["artificial intelligence ETF", "AI stocks"],
};

/**
 * Build search terms for a ticker using Yahoo name + overrides.
 */
function getSearchNames(
  ticker: string,
  priceData: Record<string, QuoteData>,
): string[] {
  if (TICKER_NAME_OVERRIDES[ticker]) {
    return TICKER_NAME_OVERRIDES[ticker];
  }

  const quote = priceData[ticker];

  if (quote?.name) {
    const cleaned = quote.name
      .replace(
        /,?\s*(Inc\.?|Corp\.?|Ltd\.?|PLC|S\.?A\.?|N\.?V\.?|SE|plc|Holdings?|Group|Co\.?)$/i,
        "",
      )
      .trim();

    if (cleaned.length > 1) {
      return [cleaned];
    }
  }

  return [];
}

// ── Types ───────────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  description?: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  impact?: "high" | "medium" | "low";
}

export type TickerSentiment =
  | "bullish"
  | "bearish"
  | "neutral"
  | "mixed"
  | "none";

interface NewsApiArticle {
  title: string;
  description?: string | null;
  url: string;
  source: {
    name: string;
  };
  publishedAt: string;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
}

// ── Fetch a batch of tickers ────────────────────────────────────────

async function fetchBatch(
  tickers: string[],
  priceData: Record<string, QuoteData>,
): Promise<Record<string, NewsItem[]>> {
  const queryTerms: string[] = [];

  for (const ticker of tickers) {
    queryTerms.push(ticker);

    const names = getSearchNames(ticker, priceData);

    if (names.length > 0) {
      queryTerms.push(...names);
    }
  }

  const query = queryTerms.join(" OR ");

  // Last 24 hours, with precise timestamp rather than only the date.
  const since = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const params = new URLSearchParams({
    q: query,
    from: since,
    sortBy: "relevancy",
    pageSize: "50",
    apiKey: NEWS_API_KEY!,
  });

  const res = await fetch(`${NEWS_API_BASE}?${params}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`NewsAPI ${res.status}: ${body}`);
  }

  const data = (await res.json()) as NewsApiResponse;

  // Start with an empty list for every ticker.
  const result: Record<string, NewsItem[]> = {};

  for (const ticker of tickers) {
    result[ticker] = [];
  }

  // Match articles against ticker/name in title OR description.
  for (const article of data.articles) {
    const titleUpper = article.title.toUpperCase();
    const descriptionUpper = (
      article.description ?? ""
    ).toUpperCase();

    const searchableText = `${titleUpper} ${descriptionUpper}`;

    for (const ticker of tickers) {
      if (result[ticker].length >= MAX_ARTICLES_PER_TICKER) {
        continue;
      }

      const yahooTicker = toYahooTicker(ticker);
      const names = getSearchNames(ticker, priceData);

      const matches =
        // Ignore very short/generic tickers such as V, MA and PG.
        (ticker.length >= 4 &&
          searchableText.includes(ticker.toUpperCase())) ||
        (yahooTicker.length >= 4 &&
          searchableText.includes(yahooTicker.toUpperCase())) ||
        names.some((name) => {
          const upperName = name.toUpperCase();

          return (
            upperName.length > 2 &&
            searchableText.includes(upperName)
          );
        });

      if (matches) {
        result[ticker].push({
          title: article.title,
          description: article.description ?? undefined,
          url: article.url,
          source: article.source.name,
          publishedAt: article.publishedAt,
        });
      }
    }
  }

  return result;
}

// ── Gemini relevance filter ─────────────────────────────────────────

const relevanceSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ticker: {
        type: Type.STRING,
      },

      articles: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: {
              type: Type.NUMBER,
              description: "0-based index of the article",
            },

            sentiment: {
              type: Type.STRING,
              description:
                "bullish, bearish, or neutral",
            },

            impact: {
              type: Type.STRING,
              description:
                "high, medium, or low",
            },
          },
        },

        description:
          "Relevant articles with sentiment and impact assessment",
      },

      overallSentiment: {
        type: Type.STRING,
        description:
          "Overall news sentiment for this ticker: bullish, bearish, neutral, or mixed",
      },
    },
  },
};

async function filterNewsWithGemini(
  allNews: Record<string, NewsItem[]>,
): Promise<Record<string, NewsItem[]>> {
  if (!GEMINI_API_KEY) {
    return allNews;
  }

  const entries: {
    ticker: string;
    headlines: string[];
  }[] = [];

  for (const [ticker, articles] of Object.entries(allNews)) {
    if (articles.length === 0) {
      continue;
    }

    entries.push({
      ticker,

      headlines: articles.map(
        (article) =>
          `${article.title}${
            article.description
              ? ` — ${article.description}`
              : ""
          } — ${article.source}`,
      ),
    });
  }

  if (entries.length === 0) {
    return allNews;
  }

  const prompt = `You are a financial news relevance filter for an investment portfolio tracker.

For each ticker below, determine which articles are actually about the company or stock.

The article may be written in English, Portuguese, Spanish, French, German, Dutch, Japanese, or another language.

KEEP articles about:
- stock price or market reaction
- earnings and financial results
- revenue, profit, margins, guidance
- analyst ratings or price targets
- company strategy
- important products or product launches
- major contracts or customers
- mergers and acquisitions
- leadership changes
- regulatory or legal developments
- major operational developments
- important competitors or sector developments directly affecting the company
- material macroeconomic developments directly affecting the company

REMOVE articles that are:
- shopping/product/deal articles that merely mention a company or brand
- lifestyle, food, fashion, travel, or consumer product reviews
- animal, science, sports, entertainment, or unrelated articles
- advertisements, sponsored content, affiliate content, or promotional content
- articles where the company is only mentioned as a minor example
- duplicate or near-duplicate stories
- articles where the company name appears coincidentally
- articles that are not financially or strategically relevant to the company

Important:
Do not reject an article merely because it is not in English.

Tickers and their matched articles:

${entries
  .map(
    (entry) =>
      `${entry.ticker}:\n${entry.headlines
        .map(
          (headline, index) =>
            `  [${index}] ${headline}`,
        )
        .join("\n")}`,
  )
  .join("\n\n")}

For each ticker return:

- articles: an array containing the relevant article indexes
- sentiment: bullish, bearish, or neutral
- impact: high, medium, or low
- overallSentiment: bullish, bearish, neutral, or mixed

If no articles are relevant, return an empty articles array and "neutral" for overallSentiment.`;

  try {
    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    let responseText: string | undefined;

    // Retry transient Gemini errors.
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,

          config: {
            responseMimeType: "application/json",
            responseSchema: relevanceSchema,
          },
        });

        responseText = response.text!;
        break;
      } catch (retryErr) {
        const msg =
          (retryErr as Error).message ?? "";

        const isRetryable =
          msg.includes("503") ||
          msg.includes("429") ||
          msg.includes("UNAVAILABLE");

        if (isRetryable && attempt < 2) {
          const delay = (attempt + 1) * 5000;

          console.log(
            `  ⚠ Gemini news filter ${
              msg.includes("503") ? "503" : "429"
            } — retrying in ${delay / 1000}s`,
          );

          await new Promise((resolve) =>
            setTimeout(resolve, delay),
          );

          continue;
        }

        throw retryErr;
      }
    }

    if (!responseText) {
      return allNews;
    }

    const filtered = JSON.parse(responseText) as Array<{
      ticker: string;
      articles: Array<{
        index: number;
        sentiment: string;
        impact: string;
      }>;
      overallSentiment: string;
    }>;

    const result: Record<string, NewsItem[]> = {};
    const sentimentMap: Record<
      string,
      TickerSentiment
    > = {};

    // Start with empty arrays for all tickers.
    for (const ticker of Object.keys(allNews)) {
      result[ticker] = [];
    }

    // Keep only Gemini-approved articles.
    for (const entry of filtered) {
      const original = allNews[entry.ticker];

      if (!original) {
        continue;
      }

      result[entry.ticker] = entry.articles
        .filter(
          (article) =>
            article.index >= 0 &&
            article.index < original.length,
        )
        .map((article) => ({
          ...original[article.index],

          sentiment: (
            [
              "bullish",
              "bearish",
              "neutral",
            ].includes(article.sentiment)
              ? article.sentiment
              : "neutral"
          ) as NewsItem["sentiment"],

          impact: (
            [
              "high",
              "medium",
              "low",
            ].includes(article.impact)
              ? article.impact
              : "medium"
          ) as NewsItem["impact"],
        }));

      sentimentMap[entry.ticker] = (
        [
          "bullish",
          "bearish",
          "neutral",
          "mixed",
        ].includes(entry.overallSentiment)
          ? entry.overallSentiment
          : "neutral"
      ) as TickerSentiment;
    }

    _lastSentimentMap = sentimentMap;

    const before = Object.values(allNews).reduce(
      (sum, articles) => sum + articles.length,
      0,
    );

    const after = Object.values(result).reduce(
      (sum, articles) => sum + articles.length,
      0,
    );

    if (before !== after) {
      console.log(
        `  Gemini filter: ${before} → ${after} articles (removed ${
          before - after
        } irrelevant)`,
      );
    }

    return result;
  } catch (err) {
    console.warn(
      `  ⚠ Gemini news filter failed, using unfiltered results: ${
        (err as Error).message
      }`,
    );

    return allNews;
  }
}

// ── Sentiment map ───────────────────────────────────────────────────

let _lastSentimentMap: Record<
  string,
  TickerSentiment
> = {};

export function getNewsSentiment(): Record<
  string,
  TickerSentiment
> {
  return _lastSentimentMap;
}

// ── Fetch news for all tickers ──────────────────────────────────────

export async function fetchNews(
  tickers: string[],
  priceData: Record<string, QuoteData> = {},
): Promise<Record<string, NewsItem[]>> {
  if (!NEWS_API_KEY) {
    console.warn(
      "NEWS_API_KEY not set — skipping news fetch\n",
    );

    return Object.fromEntries(
      tickers.map((ticker) => [ticker, []]),
    );
  }

  console.log(
    `Fetching news for ${tickers.length} tickers...`,
  );

  const allNews: Record<string, NewsItem[]> = {};

  // Batch tickers to reduce API calls.
  for (
    let i = 0;
    i < tickers.length;
    i += BATCH_SIZE
  ) {
    const batch = tickers.slice(
      i,
      i + BATCH_SIZE,
    );

    try {
      const batchNews = await fetchBatch(
        batch,
        priceData,
      );

      Object.assign(
        allNews,
        batchNews,
      );
    } catch (err) {
      console.error(
        `  ✗ News batch [${batch.join(
          ", ",
        )}] failed:`,
        (err as Error).message,
      );

      for (const ticker of batch) {
        allNews[ticker] = [];
      }
    }
  }

  const withNews = Object.values(
    allNews,
  ).filter(
    (articles) => articles.length > 0,
  ).length;

  console.log(
    `Found news for ${withNews}/${tickers.length} tickers`,
  );

  // Second pass:
  // Gemini removes irrelevant articles and assigns sentiment.
  const filtered =
    await filterNewsWithGemini(allNews);

  console.log();

  return filtered;
}

