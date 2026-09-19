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
  // Atom style:
  // <link href="...">

  let match = block.match(
    /<link[^>]*href=["']([^"']+)["'][^>]*>/i
  );

  if (match) {
    return match[1].trim();
  }

  // RSS style:
  // <link>...</link>

  match = block.match(
    /<link[^>]*>([\s\S]*?)<\/link>/i
  );

  if (match) {
    return clean(match[1]);
  }

  // GUID fallback

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
              "User-Agent":
                "AI-Radar-Insights/1.0"
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

  // Remove markdown code fences

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();


  // Find JSON array if model adds extra text

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
        parsed.insights &&
        typeof parsed.insights === "string"
      ) {
        return [
          {
            trend: parsed.insights,
            why_it_matters: "",
            what_to_watch_next: ""
          }
        ];
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

  const newsForAI = items.slice(0, 20).map((item) => ({
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
    const result = await env.AI.run(MODEL, {
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
    });

    const raw = result?.response ?? result;

    console.log(
      "AI RAW:",
      typeof raw === "string"
        ? raw
        : JSON.stringify(raw)
    );

    let parsed = raw;

    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }

    if (
      parsed &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.insights)
    ) {
      parsed = parsed.insights;
    }

    if (!Array.isArray(parsed)) {
      console.log("AI response was not an array");
      return [];
    }

    return parsed
      .map((item) => ({
        trend: String(item?.trend || "").trim(),

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

  // --------------------------------
  // READ CACHE
  // --------------------------------

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


  // --------------------------------
  // COLLECT NEWS
  // --------------------------------

  const items =
    await collectRadar();


  console.log(
    "News items collected:",
    items.length
  );


  // --------------------------------
  // GENERATE INSIGHTS
  // --------------------------------

  const insights =
    await generateInsights(
      items,
      env
    );


  // --------------------------------
  // CREATE DATA
  // --------------------------------

  const data = {

    updated:
      new Date().toISOString(),

    count:
      items.length,

    insights,

    items
  };


  // --------------------------------
  // SAVE TO KV
  // --------------------------------

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

function buildInsightsHtml(
  insights
) {

  if (
    !Array.isArray(insights) ||
    !insights.length
  ) {

    return `
      <article class="insight-card">
        <h3>AI analysis temporarily unavailable</h3>
        <p>
          Fresh AI news is still available above.
          The next scheduled refresh will try the
          analysis again.
        </p>
      </article>
    `;
  }


  return insights
    .slice(0, 5)
    .map(
      (insight, index) => `
        <article class="insight-card">

          <div class="insight-number">
            ${index + 1}
          </div>

          <h3>
            ${escapeHtml(
              insight.trend
            )}
          </h3>

          <div class="insight-section">
            <strong>
              Why it matters
            </strong>

            <p>
              ${escapeHtml(
                insight.why_it_matters
              )}
            </p>
          </div>

          <div class="insight-section">
            <strong>
              What to watch next
            </strong>

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

  const data =
    await buildRadarData(
      env
    );


  // ================================
  // NEWS CARDS
  // ================================

  const cards =
    data.items
      .slice(0, 15)
      .map(
        (item) => `
          <article class="card">

            <small>
              ${escapeHtml(
                item.source
              )}
            </small>

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
              Read source →
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
  // HTML
  // ================================

  return new Response(

    `<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
/>

<title>
AI Radar Insights
</title>


<style>

/* ================================
   BASE
================================ */

* {
  box-sizing: border-box;
}


body {

  font-family:
    Arial,
    sans-serif;

  max-width:
    1000px;

  margin:
    40px auto;

  padding:
    20px;

  background:
    #ffffff;

  color:
    #111111;
}


/* ================================
   HEADER
================================ */

h1 {

  font-size:
    38px;

  margin-bottom:
    8px;
}


.subtitle {

  color:
    #555;

  margin-bottom:
    10px;
}


.status {

  margin-bottom:
    25px;
}


/* ================================
   SECTIONS
================================ */

section {

  margin-top:
    35px;
}


section h2 {

  margin-bottom:
    18px;
}


/* ================================
   NEWS CARDS
================================ */

.card,
.insight-card {

  border:
    1px solid #ddd;

  border-radius:
    12px;

  padding:
    18px;

  margin-bottom:
    15px;

  background:
    #fff;
}


.card h3,
.insight-card h3 {

  margin:
    8px 0 12px;

  line-height:
    1.35;
}


.card p,
.insight-card p {

  line-height:
    1.55;

  color:
    #333;
}


.card a {

  color:
    #333;

  text-decoration:
    none;

  font-weight:
    600;
}


.card a:hover {

  text-decoration:
    underline;
}


small {

  color:
    #666;
}


/* ================================
   INSIGHT CARDS
================================ */

.insight-card {

  position:
    relative;

  padding-left:
    22px;
}


.insight-number {

  font-size:
    14px;

  font-weight:
    bold;

  margin-bottom:
    8px;

  color:
    #666;
}


.insight-card h3 {

  font-size:
    21px;
}


.insight-section {

  margin-top:
    12px;
}


.insight-section strong {

  display:
    block;

  margin-bottom:
    3px;
}


.insight-section p {

  margin-top:
    4px;
}


/* ================================
   MOBILE
================================ */

@media (
  max-width: 600px
) {

  body {

    margin:
      15px auto;

    padding:
      15px;
  }


  h1 {

    font-size:
      30px;
  }


  .card,
  .insight-card {

    padding:
      15px;
  }

}

</style>

</head>


<body>


<h1>
AI Radar Insights
</h1>


<p class="subtitle">
Automated AI trends, tools and insights.
</p>


<p class="status">

<strong>
Live sources:
</strong>

${data.count}

items collected

</p>


<section>

<h2>
Latest AI News
</h2>


${
  cards ||
  `
    <div class="card">

      No news items
      available right now.

    </div>
  `
}

</section>


<section>

<h2>
AI Insights
</h2>


${insightsSection}


</section>


</body>

</html>`,

    {

      headers: {

        "content-type":
          "text/html;charset=UTF-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}


// ================================
// WORKER
// ================================

export default {
  async fetch(request, env, ctx) {
    return workerFetch(request, env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      buildRadarData(env, true).catch((error) => {
        console.log(
          "Scheduled radar failed:",
          String(error)
        );
      })
    );
  },
};
