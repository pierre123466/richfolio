import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_MODEL } from "./providers/gemini.js";
import type { QuoteData } from "./fetchPrices.js";

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_API_BASE = "https://newsapi.org/v2/everything";

const MAX_ARTICLES_PER_TICKER = 3;
const CONCURRENCY = 5;

// ── Curated search names ────────────────────────────────────────────
// Yahoo's company names are sometimes wrong or too verbose. These overrides
// give us clean, distinctive search terms for the NewsAPI query.
// Key = ticker as it appears in config.json. Value = search terms.
//
// Tickers NOT listed here use the Yahoo name from priceData (cleaned).

const TICKER_NAME_OVERRIDES: Record<string, string[]> = {
  // ── Short / ambiguous US tickers ──
  V: ["Visa"],
  MA: ["Mastercard"],
  PG: ["Procter & Gamble", "Procter and Gamble"],
  GM: ["General Motors"],
  FDX: ["FedEx"],
  UPS: ["United Parcel Service", "UPS"],
  BLK: ["BlackRock"],
  MCD: ["McDonald's"],

  // ── Numeric-only tickers ──
  "7203.T": ["Toyota"],
  "6758.T": ["Sony"],
  "6723.T": ["Renesas"],
  "7936.T": ["Asics"],

  // ── Hyphenated / non-ASCII ──
  "NOVO-B.CO": ["Novo Nordisk"],

  // ── Asian exchanges ──
  "1211.HK": ["BYD"],
  "1810.HK": ["Xiaomi"],
  "300750.SZ": ["CATL", "Contemporary Amperex"],

  // ── European names ──
  "ADS.DE": ["Adidas"],
  "BAYN.DE": ["Bayer"],
  "MC.PA": ["LVMH", "Moet Hennessy"],
  "NESN.SW": ["Nestle"],
  "PIRC.MI": ["Pirelli"],
  "ULVR.L": ["Unilever"],
  ASML: ["ASML"],

  // ── Portuguese ──
  "BCP.LS": ["Banco Comercial Portugues", "BCP"],
  "EDPR.LS": ["EDP Renovaveis", "EDP Renewables"],
  "GALP.LS": ["Galp Energia", "Galp"],
  "JMT.LS": ["Jeronimo Martins"],
  "NOS.LS": ["NOS SGPS"],
  "SEM.LS": ["Semapa"],
  "SON.LS": ["Sonae"],
  "SNC.LS": ["Sonaecom"],
  "COR.LS": ["Corticeira Amorim"],
  "CTT.LS": ["CTT Correios"],
  "EGL.LS": ["Mota-Engil"],
  "FCP.LS": ["Futebol Clube do Porto"],
  "RAM.LS": ["Ramada Investimentos"],
  "TDSA.LS": ["Teixeira Duarte"],
  "ALTR.LS": ["Altri"],
  "PHRA.LS": ["Pharol"],
};

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
  source: { name: string };
  publishedAt: string;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
  code?: string;
  message?: string;
}

// ── Query building ──────────────────────────────────────────────────

/**
 * Extract the base symbol by removing the exchange suffix.
 *   "ADS.DE"     → "ADS"
 *   "7203.T"     → "7203"
 *   "NOVO-B.CO"  → "NOVO-B"
 *   "GOOGL"      → "GOOGL"
 */
function baseTicker(ticker: string): string {
  const dotIndex = ticker.indexOf(".");
  return dotIndex === -1 ? ticker : ticker.slice(0, dotIndex);
}

/**
 * Is the base ticker distinctive enough to search for on its own?
 * Reject: too short (< 4 chars), purely numeric, or contains only digits.
 */
function isDistinctive(ticker: string): boolean {
  if (ticker.length < 4) return false;
  if (/^\d+$/.test(ticker)) return false;
  // Must contain at least one letter
  return /[A-Z]/i.test(ticker);
}

/**
 * Clean a Yahoo company name into a search term.
 * Removes common suffixes like "Inc.", "Corp.", "SA", etc.
 */
function cleanCompanyName(name: string): string {
  return name
    .replace(
      /,?\s*(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|PLC|plc|S\.?A\.?|N\.?V\.?|SE|AG|Holdings?|Group|Co\.?|Company|Common Stock|Class [A-Z])\s*$/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a single small query for one ticker.
 * Strategy: prefer curated name(s), add distinctive ticker as fallback.
 * Result is always quoted, never more than 2 terms.
 */
function buildQuery(
  ticker: string,
  quote: QuoteData | undefined,
): string | null {
  const terms: string[] = [];

  // 1. Curated overrides take priority
  const overrides = TICKER_NAME_OVERRIDES[ticker];
  if (overrides && overrides.length > 0) {
    terms.push(`"${overrides[0]}"`);
    if (overrides[1]) {
      terms.push(`"${overrides[1]}"`);
    }
  } else {
    // 2. Otherwise, use the Yahoo company name (cleaned)
    if (quote?.name) {
      const cleaned = cleanCompanyName(quote.name);
      if (cleaned.length > 2) {
        terms.push(`"${cleaned}"`);
      }
    }
  }

  // 3. Add distinctive base ticker as additional fallback (only if room)
  const base = baseTicker(ticker);
  if (
    terms.length < 2 &&
    isDistinctive(base) &&
    !terms.some((t) => t.toUpperCase().includes(base.toUpperCase()))
  ) {
    terms.push(`"${base}"`);
  }

  if (terms.length === 0) return null;
  return terms.slice(0, 2).join(" OR ");
}

// ── Fetch news for a single ticker ──────────────────────────────────

async function fetchForTicker(
  ticker: string,
  quote: QuoteData | undefined,
): Promise<NewsItem[]> {
  const query = buildQuery(ticker, quote);

  if (!query) {
    console.log(`  ✗ ${ticker}: no search terms available`);
    return [];
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    q: query,
    from: since,
    sortBy: "relevancy",
    pageSize: "10",
    apiKey: NEWS_API_KEY!,
  });

  let res: Response;
  try {
    res = await fetch(`${NEWS_API_BASE}?${params}`);
  } catch (err) {
    console.log(`  ✗ ${ticker}: network error — ${(err as Error).message}`);
    return [];
  }

  if (!res.ok) {
    const body = await res.text();
    console.log(`  ✗ ${ticker}: NewsAPI ${res.status} — ${body.slice(0, 120)}`);
    return [];
  }

  let data: NewsApiResponse;
  try {
    data = (await res.json()) as NewsApiResponse;
  } catch {
    console.log(`  ✗ ${ticker}: invalid JSON from NewsAPI`);
    return [];
  }

  if (data.status !== "ok") {
    console.log(
      `  ✗ ${ticker}: NewsAPI status=${data.status} (${data.code ?? "?"}) — ${data.message ?? ""}`,
    );
    return [];
  }

  const articles = (data.articles ?? []).slice(0, MAX_ARTICLES_PER_TICKER);

  if (articles.length > 0) {
    console.log(`  ✓ ${ticker}: ${articles.length} articles (${query})`);
  } else {
    console.log(`  · ${ticker}: 0 articles (${query})`);
  }

  return articles.map((a) => ({
    title: a.title,
    description: a.description ?? undefined,
    url: a.url,
    source: a.source.name,
    publishedAt: a.publishedAt,
  }));
}

// ── Gemini relevance filter ─────────────────────────────────────────

const relevanceSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ticker: { type: Type.STRING },
      articles: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.NUMBER, description: "0-based index of the article" },
            sentiment: { type: Type.STRING, description: "bullish, bearish, or neutral" },
            impact: { type: Type.STRING, description: "high, medium, or low" },
          },
        },
      },
      overallSentiment: {
        type: Type.STRING,
        description: "bullish, bearish, neutral, or mixed",
      },
    },
  },
};

async function filterNewsWithGemini(
  allNews: Record<string, NewsItem[]>,
): Promise<Record<string, NewsItem[]>> {
  if (!GEMINI_API_KEY) return allNews;

  const entries: { ticker: string; headlines: string[] }[] = [];
  for (const [ticker, articles] of Object.entries(allNews)) {
    if (articles.length === 0) continue;
    entries.push({
      ticker,
      headlines: articles.map(
        (a) =>
          `${a.title}${a.description ? ` — ${a.description}` : ""} — ${a.source}`,
      ),
    });
  }

  if (entries.length === 0) {
    console.log("  No articles to filter with Gemini.");
    return allNews;
  }

  const total = entries.reduce((s, e) => s + e.headlines.length, 0);
  console.log(
    `  Sending ${total} articles across ${entries.length} tickers to Gemini...`,
  );

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
    (e) =>
      `${e.ticker}:\n${e.headlines
        .map((h, i) => `  [${i}] ${h}`)
        .join("\n")}`,
  )
  .join("\n\n")}

For each ticker return:
- articles: array of relevant indexes, each with sentiment + impact
- overallSentiment: bullish, bearish, neutral, or mixed

If no articles are relevant for a ticker, return an empty articles array and "neutral" for overallSentiment.`;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    let responseText: string | undefined;
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
        responseText = response.text ?? undefined;
        break;
      } catch (retryErr) {
        const msg = (retryErr as Error).message ?? "";
        const isRetryable =
          msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE");

        if (isRetryable && attempt < 2) {
          const delay = (attempt + 1) * 5000;
          console.log(
            `  ⚠ Gemini news filter ${msg.includes("503") ? "503" : "429"} — retrying in ${delay / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw retryErr;
      }
    }

    if (!responseText) return allNews;

    const filtered = JSON.parse(responseText) as Array<{
      ticker: string;
      articles: Array<{ index: number; sentiment: string; impact: string }>;
      overallSentiment: string;
    }>;

    const result: Record<string, NewsItem[]> = {};
    const sentimentMap: Record<string, TickerSentiment> = {};

    for (const ticker of Object.keys(allNews)) result[ticker] = [];

    for (const entry of filtered) {
      const original = allNews[entry.ticker];
      if (!original) continue;

      result[entry.ticker] = entry.articles
        .filter((a) => a.index >= 0 && a.index < original.length)
        .map((a) => ({
          ...original[a.index],
          sentiment: (["bullish", "bearish", "neutral"].includes(a.sentiment)
            ? a.sentiment
            : "neutral") as NewsItem["sentiment"],
          impact: (["high", "medium", "low"].includes(a.impact)
            ? a.impact
            : "medium") as NewsItem["impact"],
        }));

      sentimentMap[entry.ticker] = (
        ["bullish", "bearish", "neutral", "mixed"].includes(entry.overallSentiment)
          ? entry.overallSentiment
          : "neutral"
      ) as TickerSentiment;
    }

    _lastSentimentMap = sentimentMap;

    const before = Object.values(allNews).reduce((s, a) => s + a.length, 0);
    const after = Object.values(result).reduce((s, a) => s + a.length, 0);

    console.log(
      `  Gemini filter: ${before} → ${after} articles (removed ${before - after} irrelevant)`,
    );

    return result;
  } catch (err) {
    console.warn(
      `  ⚠ Gemini news filter failed, using unfiltered results: ${(err as Error).message}`,
    );
    return allNews;
  }
}

// ── Sentiment map ───────────────────────────────────────────────────

let _lastSentimentMap: Record<string, TickerSentiment> = {};

export function getNewsSentiment(): Record<string, TickerSentiment> {
  return _lastSentimentMap;
}

// ── Public entry point ──────────────────────────────────────────────

export async function fetchNews(
  tickers: string[],
  priceData: Record<string, QuoteData> = {},
): Promise<Record<string, NewsItem[]>> {
  if (!NEWS_API_KEY) {
    console.warn("NEWS_API_KEY not set — skipping news fetch\n");
    return Object.fromEntries(tickers.map((t) => [t, []]));
  }

  console.log(`Fetching news for ${tickers.length} tickers...`);

  const allNews: Record<string, NewsItem[]> = {};

  // Process in batches of CONCURRENCY to avoid hammering the API.
  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (ticker) => {
        try {
          const news = await fetchForTicker(ticker, priceData[ticker]);
          return [ticker, news] as const;
        } catch (err) {
          console.log(`  ✗ ${ticker}: ${(err as Error).message}`);
          return [ticker, []] as const;
        }
      }),
    );

    for (const [ticker, news] of results) {
      allNews[ticker] = news;
    }
  }

  const withNews = Object.values(allNews).filter((a) => a.length > 0).length;
  const totalArticles = Object.values(allNews).reduce((s, a) => s + a.length, 0);

  console.log(
    `Found news for ${withNews}/${tickers.length} tickers (${totalArticles} articles total)`,
  );

  const filtered = await filterNewsWithGemini(allNews);
  console.log();
  return filtered;
}

