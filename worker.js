const SOURCES = [
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/"
  },
  {
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"
  },
  {
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml"
  }
];

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const MAX_ITEMS_PER_SOURCE = 10;
const MAX_TOTAL_ITEMS = 30;

const CACHE_KEY = "latest_radar";


// ================================
// TEXT CLEANING
// ================================

function clean(text) {
  if (!text) return "";

  return String(text)
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#8217;|&#x2019;/gi, "'")
    .replace(/&#8216;|&#x2018;/gi, "'")
    .replace(/&#8220;|&#x201C;/gi, '"')
    .replace(/&#8221;|&#x201D;/gi, '"')
    .replace(/&#8230;|&hellip;/gi, "...")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}


// ================================
// HTML ESCAPE
// ================================

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ================================
// RSS HELPERS
// ================================

function getTag(block, tag) {
  const regex = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = block.match(regex);

  return match ? clean(match[1]) : "";
}


function getLink(block) {
  let match = block.match(
    /<link[^>]*href=["']([^"']+)["'][^>]*>/i
  );

  if (match) {
    return match[1].trim();
  }

  match = block.match(
    /<link[^>]*>([\s\S]*?)<\/link>/i
  );

  if (match) {
    return clean(match[1]);
  }

  match = block.match(
    /<guid[^>]*>([\s\S]*?)<\/guid>/i
  );

  return match ? clean(match[1]) : "";
}


// ================================
// RSS PARSER
// ================================

function parseFeed(xml) {
  const entries = [];

  const blocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s\S]*?<\/entry>/gi) ||
    [];

  for (
    const block of blocks.slice(0, MAX_ITEMS_PER_SOURCE)
  ) {
    const title =
      getTag(block, "title") ||
      "Untitled";

    const description =
      getTag(block, "description") ||
      getTag(block, "summary") ||
      getTag(block, "content") ||
      "";

    const link = getLink(block);

    if (title && link) {
      entries.push({
        title,
        description: description.slice(0, 500),
        link
      });
    }
  }

  return entries;
}


// ================================
// COLLECT NEWS
// ================================

async function collectRadar() {
  const results = [];

  await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const response = await fetch(
          source.url,
          {
            headers: {
              "User-Agent": "AI-Radar-Insights/1.0"
            }
          }
        );

        if (!response.ok) {
          console.log(
            "Source failed:",
            source.name,
            response.status
          );

          return;
        }

        const xml = await response.text();

        const entries = parseFeed(xml);

        for (const entry of entries) {
          results.push({
            source: source.name,
            title: entry.title,
            description: entry.description,
            link: entry.link
          });
        }

      } catch (error) {
        console.log(
          "Source error:",
          source.name,
          String(error)
        );
      }
    })
  );

  return results.slice(0, MAX_TOTAL_ITEMS);
}


// ================================
// AI RESPONSE PARSER
// ================================

function parseAIResponse(raw) {
  if (!raw) return [];

  let text = String(raw).trim();

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");

  if (
    firstBracket !== -1 &&
    lastBracket !== -1 &&
    lastBracket > firstBracket
  ) {
    text = text.slice(
      firstBracket,
      lastBracket + 1
    );
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      if (Array.isArray(parsed.insights)) {
        return parsed.insights;
      }

      if (
        typeof parsed.response === "string"
      ) {
        return parseAIResponse(
          parsed.response
        );
      }
    }

  } catch (error) {
    console.log(
      "AI JSON parse failed:",
      String(error)
    );
  }

  return [];
}


// ================================
// GENERATE AI INSIGHTS
// ================================

async function generateInsights(items, env) {
  if (!items || !items.length) return [];

  const newsForAI = items
    .slice(0, 20)
    .map((item) => ({
      source: item.source || "",
      title: item.title || "",
      description: item.description || ""
    }));

  const prompt = `
You are AI Radar Insights.

Analyze the supplied AI news and identify exactly 5 distinct current trends.

Rules:
- Use only information supported by the supplied news.
- Do not invent facts.
- Do not repeat the same story.
- Keep every field concise.
- Return exactly 5 objects.

Each object must contain:
- trend
- why_it_matters
- what_to_watch_next

NEWS:
${JSON.stringify(newsForAI)}
`;

  try {
    const result = await env.AI.run(
      MODEL,
      {
        prompt,

        temperature: 0.2,

        max_tokens: 900,

        response_format: {
          type: "json_schema",

          json_schema: {
            type: "array",

            minItems: 5,

            maxItems: 5,

            items: {
              type: "object",

              properties: {
                trend: {
                  type: "string"
                },

                why_it_matters: {
                  type: "string"
                },

                what_to_watch_next: {
                  type: "string"
                }
              },

              required: [
                "trend",
                "why_it_matters",
                "what_to_watch_next"
              ],

              additionalProperties: false
            }
          }
        }
      }
    );

    const raw =
      result?.response ?? result;

    console.log(
      "AI RAW:",
      typeof raw === "string"
        ? raw
        : JSON.stringify(raw)
    );

    let parsed = raw;

    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch (error) {
        parsed = parseAIResponse(parsed);
      }
    }

    if (
      parsed &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.insights)
    ) {
      parsed = parsed.insights;
    }

    if (!Array.isArray(parsed)) {
      console.log(
        "AI response was not an array"
      );

      return [];
    }

    return parsed
      .map((item) => ({
        trend: String(
          item?.trend || ""
        ).trim(),

        why_it_matters: String(
          item?.why_it_matters || ""
        ).trim(),

        what_to_watch_next: String(
          item?.what_to_watch_next || ""
        ).trim()
      }))

      .filter(
        (item) =>
          item.trend &&
          item.why_it_matters &&
          item.what_to_watch_next
      )

      .slice(0, 5);

  } catch (error) {
    console.log(
      "AI analysis failed:",
      String(error)
    );

    return [];
  }
}


// ================================
// BUILD RADAR DATA
// ================================

async function buildRadarData(
  env,
  forceRefresh = false
) {

  if (!forceRefresh) {

    try {

      const cached =
        await env.RADAR_CACHE.get(
          CACHE_KEY,
          "json"
        );

      if (cached) {

        console.log(
          "Returning cached radar data"
        );

        return cached;
      }

    } catch (error) {

      console.log(
        "KV read failed:",
        String(error)
      );
    }
  }


  const items =
    await collectRadar();


  console.log(
    "News items collected:",
    items.length
  );


  const insights =
    await generateInsights(
      items,
      env
    );


  const data = {

    updated:
      new Date().toISOString(),

    count:
      items.length,

    insights,

    items
  };


  try {

    await env.RADAR_CACHE.put(
      CACHE_KEY,
      JSON.stringify(data)
    );

    console.log(
      "Radar data saved to KV"
    );

  } catch (error) {

    console.log(
      "KV write failed:",
      String(error)
    );
  }


  return data;
}


// ================================
// HTML INSIGHT CARDS
// ================================

function buildInsightsHtml(insights) {

  if (
    !Array.isArray(insights) ||
    !insights.length
  ) {

    return `
      <div class="empty-state">

        <div class="empty-icon">
          ◌
        </div>

        <h3>
          AI analysis temporarily unavailable
        </h3>

        <p>
          Fresh AI news is still available.
          The next automatic refresh will retry
          the analysis.
        </p>

      </div>
    `;
  }


  return insights
    .slice(0, 5)
    .map(
      (insight, index) => `
        <article class="insight-card">

          <div class="insight-top">

            <span class="insight-number">
              ${String(index + 1).padStart(2, "0")}
            </span>

            <span class="insight-label">
              AI RADAR
            </span>

          </div>


          <h3>
            ${escapeHtml(
              insight.trend
            )}
          </h3>


          <div class="insight-block">

            <div class="block-label">
              WHY IT MATTERS
            </div>

            <p>
              ${escapeHtml(
                insight.why_it_matters
              )}
            </p>

          </div>


          <div class="insight-block watch-block">

            <div class="block-label">
              WHAT TO WATCH NEXT
            </div>

            <p>
              ${escapeHtml(
                insight.what_to_watch_next
              )}
            </p>

          </div>

        </article>
      `
    )
    .join("");
}


// ================================
// WORKER FETCH
// ================================

async function workerFetch(
  request,
  env
) {

  const url =
    new URL(request.url);


  // ================================
  // API TEST
  // ================================

  if (
    url.pathname ===
    "/api/test"
  ) {

    return Response.json({

      success: true,

      message:
        "AI Radar Insights is working."
    });
  }


  // ================================
  // AI TEST
  // ================================

  if (
    url.pathname ===
    "/api/ai-test"
  ) {

    try {

      const result =
        await env.AI.run(
          MODEL,
          {
            prompt:
              "In one short sentence, explain what an AI trend is."
          }
        );


      return Response.json({

        success: true,

        ai:
          result?.response || ""
      });

    } catch (error) {

      return Response.json(

        {
          success: false,

          error:
            String(error)
        },

        {
          status: 500
        }
      );
    }
  }


  // ================================
  // RADAR API
  // ================================

  if (
    url.pathname ===
    "/api/radar"
  ) {

    const forceRefresh =
      url.searchParams.get(
        "refresh"
      ) === "1";


    const data =
      await buildRadarData(
        env,
        forceRefresh
      );


    return Response.json(
      data,
      {
        headers: {
          "Cache-Control":
            "no-store"
        }
      }
    );
  }


  // ================================
  // MAIN WEBSITE
  // ================================

  const forceRefresh =
    url.searchParams.get(
      "refresh"
    ) === "1";


  const data =
    await buildRadarData(
      env,
      forceRefresh
    );


  // ================================
  // NEWS CARDS
  // ================================

  const cards =
    data.items
      .slice(0, 15)
      .map(
        (item, index) => `
          <article class="news-card">

            <div class="news-meta">

              <span class="source-pill">
                ${escapeHtml(
                  item.source
                )}
              </span>

              <span class="news-number">
                ${String(
                  index + 1
                ).padStart(2, "0")}
              </span>

            </div>


            <h3>
              ${escapeHtml(
                item.title
              )}
            </h3>


            <p>
              ${escapeHtml(
                item.description
              )}
            </p>


            <a
              href="${escapeHtml(
                item.link
              )}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read original source
              <span>→</span>
            </a>

          </article>
        `
      )
      .join("");


  // ================================
  // INSIGHTS
  // ================================

  const insightsSection =
    buildInsightsHtml(
      data.insights
    );


  // ================================
  // UPDATED TIME
  // ================================

  let updatedText =
    "Recently updated";

  try {

    updatedText =
      new Date(
        data.updated
      ).toLocaleString(
        "en-IN",
        {
          dateStyle:
            "medium",

          timeStyle:
            "short"
        }
      );

  } catch (error) {

    updatedText =
      "Recently updated";
  }


  // ================================
  // HTML
  // ================================

  return new Response(

`<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
/>

<meta
  name="description"
  content="AI Radar Insights — automated AI trends, developments and news."
/>

<title>
AI Radar Insights
</title>


<style>

/* ================================
   RESET
================================ */

* {
  box-sizing: border-box;
}


html {
  scroll-behavior: smooth;
}


body {

  margin: 0;

  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background:
    #f6f7fb;

  color:
    #101114;

  line-height:
    1.5;
}


a {
  color: inherit;
}


/* ================================
   PAGE
================================ */

.page {

  width:
    min(1120px, calc(100% - 32px));

  margin:
    0 auto;

  padding:
    28px 0 60px;
}


/* ================================
   HEADER
================================ */

.header {

  position:
    relative;

  overflow:
    hidden;

  border:
    1px solid #e5e7eb;

  border-radius:
    24px;

  padding:
    42px;

  background:
    linear-gradient(
      135deg,
      #111318 0%,
      #1c2029 55%,
      #2b313d 100%
    );

  color:
    #ffffff;

  box-shadow:
    0 18px 50px rgba(0,0,0,.10);
}


.header::after {

  content: "";

  position:
    absolute;

  width:
    260px;

  height:
    260px;

  right:
    -100px;

  top:
    -120px;

  border-radius:
    50%;

  border:
    1px solid rgba(
      255,
      255,
      255,
      .12
    );
}


.brand {

  display:
    inline-flex;

  align-items:
    center;

  gap:
    9px;

  font-size:
    13px;

  font-weight:
    800;

  letter-spacing:
    1.4px;

  color:
    #d7dbe3;
}


.live-dot {

  width:
    8px;

  height:
    8px;

  border-radius:
    50%;

  background:
    #ffffff;

  box-shadow:
    0 0 0 5px
    rgba(
      255,
      255,
      255,
      .10
    );
}


.header h1 {

  margin:
    18px 0 10px;

  font-size:
    clamp(
      38px,
      7vw,
      64px
    );

  line-height:
    .98;

  letter-spacing:
    -2.5px;
}


.header-subtitle {

  max-width:
    680px;

  margin:
    0;

  color:
    #c5cad4;

  font-size:
    17px;
}


.header-bottom {

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    20px;

  margin-top:
    32px;
}


.stats {

  display:
    flex;

  gap:
    12px;

  flex-wrap:
    wrap;
}


.stat {

  min-width:
    120px;

  padding:
    13px 16px;

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      .12
    );

  border-radius:
    14px;

  background:
    rgba(
      255,
      255,
      255,
      .06
    );
}


.stat-number {

  display:
    block;

  font-size:
    21px;

  font-weight:
    800;
}


.stat-label {

  display:
    block;

  margin-top:
    2px;

  color:
    #aeb5c0;

  font-size:
    11px;

  text-transform:
    uppercase;

  letter-spacing:
    .8px;
}


.refresh {

  display:
    inline-flex;

  align-items:
    center;

  gap:
    8px;

  padding:
    12px 17px;

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      .18
    );

  border-radius:
    12px;

  background:
    rgba(
      255,
      255,
      255,
      .08
    );

  color:
    #ffffff;

  text-decoration:
    none;

  font-size:
    13px;

  font-weight:
    700;

  white-space:
    nowrap;
}


.refresh:hover {

  background:
    rgba(
      255,
      255,
      255,
      .14
    );
}


/* ================================
   SECTIONS
================================ */

.section {

  margin-top:
    46px;
}


.section-heading {

  display:
    flex;

  align-items:
    flex-end;

  justify-content:
    space-between;

  gap:
    20px;

  margin-bottom:
    18px;
}


.section-title {

  margin:
    0;

  font-size:
    27px;

  letter-spacing:
    -.7px;
}


.section-description {

  margin:
    5px 0 0;

  color:
    #6b7280;

  font-size:
    14px;
}


.updated {

  color:
    #6b7280;

  font-size:
    12px;

  text-align:
    right;
}


/* ================================
   INSIGHTS GRID
================================ */

.insights-grid {

  display:
    grid;

  grid-template-columns:
    repeat(
      2,
      minmax(0, 1fr)
    );

  gap:
    16px;
}


.insight-card {

  position:
    relative;

  overflow:
    hidden;

  min-height:
    285px;

  padding:
    24px;

  border:
    1px solid #e2e4e9;

  border-radius:
    19px;

  background:
    #ffffff;

  box-shadow:
    0 8px 28px
    rgba(
      20,
      25,
      35,
      .055
    );

  transition:
    transform .18s ease,
    box-shadow .18s ease;
}


.insight-card:hover {

  transform:
    translateY(-3px);

  box-shadow:
    0 14px 35px
    rgba(
      20,
      25,
      35,
      .09
    );
}


.insight-card:first-child {

  grid-column:
    span 2;

  min-height:
    250px;
}


.insight-top {

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  margin-bottom:
    22px;
}


.insight-number {

  font-size:
    13px;

  font-weight:
    900;

  letter-spacing:
    1px;

  color:
    #111318;
}


.insight-label {

  padding:
    5px 9px;

  border:
    1px solid #e3e5ea;

  border-radius:
    999px;

  color:
    #6b7280;

  font-size:
    10px;

  font-weight:
    800;

  letter-spacing:
    1px;
}


.insight-card h3 {

  margin:
    0 0 23px;

  max-width:
    850px;

  font-size:
    clamp(
      22px,
      3vw,
      31px
    );

  line-height:
    1.15;

  letter-spacing:
    -.8px;
}


.insight-block {

  margin-top:
    18px;

  padding-top:
    16px;

  border-top:
    1px solid #eceef2;
}


.block-label {

  margin-bottom:
    6px;

  f
