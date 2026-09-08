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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ai-test") {
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    prompt: "You are the AI Radar Insights engine. In one short sentence, explain what an AI trend is."
  });

  return Response.json({
    success: true,
    ai: result.response
  });
}
    if (url.pathname === "/api/radar") {
      const items = await collectRadar();
      return Response.json({
        updated: new Date().toISOString(),
        count: items.length,
        items
      });
    }

    const items = await collectRadar();

    const cards = items.slice(0, 15).map(item => `
      <article style="padding:16px;margin:12px 0;border:1px solid #ddd;border-radius:10px">
        <small>${escapeHtml(item.source)}</small>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <a href="${item.link}" target="_blank" rel="noopener">Read source →</a>
      </article>
    `).join("");

    return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Radar Insights</title>
<style>
body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px}
h1{font-size:38px}
.card{margin-bottom:15px}
</style>
</head>
<body>
<h1>AI Radar Insights</h1>
<p>Automated AI trends, tools and insights.</p>
<p><b>Live sources:</b> ${items.length} items collected</p>
${cards || "<p>No data available right now. Sources will be retried automatically.</p>"}
</body>
</html>
`, {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};

async function collectRadar() {
  const results = [];

  await Promise.all(
    SOURCES.map(async source => {
      try {
        const response = await fetch(source.url, {
          headers: {
            "User-Agent": "AI-Radar-Insights/1.0"
          }
        });

        if (!response.ok) return;

        const xml = await response.text();
        const entries = parseFeed(xml);

        for (const entry of entries.slice(0, 10)) {
          results.push({
            source: source.name,
            title: clean(entry.title),
            description: clean(entry.description).slice(0, 300),
            link: entry.link
          });
        }
      } catch (error) {
        console.log("Source failed:", source.name, error);
      }
    })
  );

  return results;
}

function parseFeed(xml) {
  const entries = [];

  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];

  for (const block of blocks) {
    const title =
      getTag(block, "title") ||
      "Untitled";

    const description =
      getTag(block, "description") ||
      getTag(block, "summary") ||
      "";

    let link = getTag(block, "link") || "";

    const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    if (hrefMatch) link = hrefMatch[1];

    if (title && link) {
      entries.push({ title, description, link });
    }
  }

  return entries;
}

function getTag(text, tag) {
  const regex = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = text.match(regex);
  return match ? match[1] : "";
}

function clean(text) {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
