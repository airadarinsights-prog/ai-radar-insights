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

Analyze the supplied AI and technology news and produce exactly 5 distinct, evidence-based insights.

Rules:
- Use only information supported by the supplied news.
- Do not invent facts.
- First group related stories into themes. When several stories support one theme, synthesize them into a single insight; do not spend multiple insights on that theme.
- Make all 5 insights materially different, each grounded in a separate theme or specific development in the supplied stories.
- Name the specific supported theme in trend; never use a generic label such as "AI", "AI is growing", or "AI is becoming more popular".
- Do not restate headlines or simply summarize individual stories.
- In why_it_matters, explain a concrete practical implication, trade-off, or affected stakeholder for that theme.
- Give each insight a different implication and a different what_to_watch_next signal. Make each signal concrete and observable, and tie it to its insight (for example, a launch, adoption, pricing change, regulatory action, or measured result when supported by the supplied evidence).
- Avoid generic filler, vague predictions, and unsupported certainty.
- If evidence is limited or mixed, say so and use cautious wording.
- If the stories do not support 5 broad recurring themes, use distinct, specific supported developments for the remaining insights rather than inventing themes or duplicating an insight.
- Keep each field concise and specific.
- Return exactly 5 insight objects, using only the fields below.

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
  // STATIC INFORMATION PAGES
  // ================================

  const staticPages = {
    "/about": {
      title: "About AI Radar Insights",
      body: `
        <p>AI Radar Insights tracks selected public news sources covering artificial intelligence and technology. We organize notable developments and use AI-assisted analysis to identify recurring themes, explain their context, and offer an original perspective on what may matter next.</p>
        <p>Our analysis is generated from the information available in the linked reports. It is intended to add context to those sources, not to replace them.</p>
      `
    },
    "/privacy": {
      title: "Privacy Policy",
      body: `
        <p>AI Radar Insights may process basic technical information needed to operate and protect the website, such as request and device information. We do not currently use analytics or advertising cookies. If analytics or advertising cookies are introduced in the future, this policy will be updated to explain them.</p>
        <p>News links lead to third-party websites. Their privacy practices and content are governed by their own policies, which we encourage you to review.</p>
        <p>We may update this policy as the site changes. Updates will be published on this page. Questions about privacy can be sent to <a href="mailto:airadarinsights@gmail.com">airadarinsights@gmail.com</a>.</p>
      `
    },
    "/contact": {
      title: "Contact AI Radar Insights",
      body: `
        <p>For questions, feedback, corrections, or business inquiries, email <a href="mailto:airadarinsights@gmail.com">airadarinsights@gmail.com</a>.</p>
      `
    },
    "/disclaimer": {
      title: "Disclaimer",
      body: `
        <p>News links on AI Radar Insights belong to their original publishers. AI-assisted analysis is generated from available information and may contain errors or omissions.</p>
        <p>All content is provided for general informational purposes and is not professional advice. Please consult qualified professionals for advice suited to your situation.</p>
        <p>Affiliate or sponsored relationships may apply to particular content when relevant; any such relationship will be disclosed with that content.</p>
      `
    }
  };

  const staticPage = staticPages[url.pathname];

  if (staticPage) {
    return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${staticPage.title} | AI Radar Insights</title>
  <style>
    body { max-width: 760px; margin: 48px auto; padding: 0 22px; color: #172033; background: #f6f8fb; font: 16px/1.7 Arial, sans-serif; }
    main { padding: 30px; background: #fff; border: 1px solid #e4e8ef; border-radius: 16px; }
    h1 { line-height: 1.2; }
    a { color: #175cd3; }
    nav { margin-top: 28px; }
  </style>
</head>
<body>
  <main>
    <h1>${staticPage.title}</h1>
    ${staticPage.body}
    <nav><a href="/">AI Radar Insights home</a></nav>
  </main>
</body>
</html>`, {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }


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
box-shadow:
0 4px 14px rgba(0,0,0,0.06);
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

/* =========================================
   AI RADAR INSIGHTS — PREMIUM UI
   UI ONLY — BACKEND UNTOUCHED
   ========================================= */

body {
  background: #f6f8fb;
  color: #172033;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

main {
  max-width: 980px;
  margin: 0 auto;
  padding: 48px 22px 70px;
}

h1 {
  font-size: clamp(32px, 5vw, 46px);
  font-weight: 800;
  letter-spacing: -1.5px;
  margin-bottom: 8px;
}

.subtitle {
  color: #667085;
  font-size: 17px;
  margin-bottom: 12px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-radius: 999px;
  background: #eef7f1;
  color: #16794a;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 34px;
}

h2 {
  font-size: 25px;
  letter-spacing: -0.5px;
  margin: 34px 0 18px;
}

.card,
.insight-card {
  border: 1px solid #e4e8ef;
  border-radius: 16px;
  padding: 22px;
  margin-bottom: 16px;
  background: rgba(255,255,255,0.96);
  box-shadow: 0 8px 28px rgba(16,24,40,0.06);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}

.card:hover,
.insight-card:hover {
  transform: translateY(-2px);
  border-color: #d5dbe5;
  box-shadow: 0 14px 34px rgba(16,24,40,0.10);
}

.card h3,
.insight-card h3 {
  font-size: 20px;
  line-height: 1.35;
  margin: 8px 0 12px;
  color: #101828;
}

.card p,
.insight-card p {
  color: #475467;
  line-height: 1.65;
}

.card a {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  color: #175cd3;
  font-weight: 700;
  text-decoration: none;
}

.card a:hover {
  text-decoration: underline;
}

.insight-card {
  border-left: 4px solid #175cd3;
  background: linear-gradient(135deg, #ffffff, #f8fbff);
}

.insight-card h3 {
  font-size: 21px;
}

.insight-card strong {
  color: #101828;
}

@media (max-width: 700px) {
  main {
    padding: 30px 16px 50px;
  }

  .card,
  .insight-card {
    padding: 18px;
    border-radius: 14px;
  }

  .card h3,
  .insight-card h3 {
    font-size: 18px;
  }

  h2 {
    font-size: 22px;
  }
}</style>

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


<section>

<h2>
How AI Radar Insights Works
</h2>

<p>
We track selected AI and technology sources, organize notable developments, and use AI-assisted analysis to surface recurring themes, useful context, and signals to watch next.
</p>

</section>


<footer>
<nav aria-label="Footer navigation">
  <a href="/about">About</a> |
  <a href="/privacy">Privacy</a> |
  <a href="/contact">Contact</a> |
  <a href="/disclaimer">Disclaimer</a>
</nav>
</footer>


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
