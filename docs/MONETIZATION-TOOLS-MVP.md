# AI Radar Insights — Monetization Tools MVP

## Purpose
Extend AI Radar Insights with useful decision tools that can create a path to revenue without depending on local clients, paid APIs, or paid hosting.

This document is a planning artifact only. It does not change the production Worker or deploy anything.

## Product direction
Build two small, useful tools first:

1. **AI Tool Finder** — helps a visitor discover relevant AI products based on a task, budget, and use case.
2. **AI Cost & ROI Calculator** — estimates costs and potential time savings using user-entered assumptions. It must label estimates clearly and never present them as guaranteed savings.

## MVP scope

### AI Tool Finder
- Search and filter a small, manually reviewed directory.
- Categories: writing, coding, research, image, video, customer support, automation.
- Filters: free plan available, task/category, and pricing model.
- Every listing must show: product name, category, what it does, pricing checked date, official website, and source for pricing/feature claims.
- Do not claim a product is free unless its official pricing page confirms a free tier.
- No affiliate links in the initial MVP. Add affiliate links only after the publisher is accepted by the relevant program and the relationship is clearly disclosed.

### AI Cost & ROI Calculator
- Inputs: monthly task volume, minutes spent per task today, estimated minutes with a tool, hourly value of time, and monthly tool cost.
- Outputs: estimated hours saved, estimated value of time saved, estimated net value, and break-even task volume.
- Clearly state that results are estimates based on user inputs, not financial advice or guaranteed outcomes.
- Run calculations in the browser; do not send user inputs to a server.

## Technical constraints
- Keep the existing production Worker and current routes unchanged in this phase.
- Build the tools as static client-side pages/assets where possible.
- No AI API calls, database, login, payment integration, analytics tracker, or external file uploads in MVP.
- Use the existing Cloudflare/GitHub setup only if the deployment path can be isolated and tested.
- Keep all new work on this feature branch until reviewed.

## Monetization sequence
1. Launch useful free tools and measure whether visitors complete them.
2. Apply to relevant affiliate programs only after reviewing their terms and eligibility.
3. Add disclosed affiliate links only after approval.
4. Consider paid features only after evidence of repeat usage and willingness to pay.
5. Do not activate payment processing or paid infrastructure without explicit owner approval.

## Validation gates before public launch
- Verify each directory entry against the vendor's official website.
- Record a checked date for pricing and free-plan claims.
- Test calculator formulas with known examples and edge cases.
- Test mobile layout, keyboard accessibility, and empty/error states.
- Confirm no user-entered data is transmitted.
- Review privacy/disclosure text before adding affiliate tracking.
- Get owner approval before merging to main or deploying.

## Initial success metrics
These are internal validation targets, not forecasts:
- 100 relevant visitors try either tool.
- 20 complete a meaningful search or calculation.
- 5 return or request a feature.
- At least 2 demonstrate willingness to pay or click an approved affiliate link.

If usage is weak, interview users through public communities where promotion is allowed and revise the problem before expanding scope.
