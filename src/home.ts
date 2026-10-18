import { template } from "@jsr/campfire__core";

const STYLESHEET =
  "https://cdn.jsdelivr.net/gh/trythursday/fieber@main/fieber.css";

const page = template<{ content: string }>(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Thursday AI For All</title>
    <link rel="stylesheet" href="${STYLESHEET}" />
  </head>
  <body>
    {{{content}}}
    <script type="module" src="/api-key-widget.js"></script>
    <script type="module" src="/balance-widget.js"></script>
  </body>
</html>`);

const markdown = await Bun.file(
  new URL("../README.md", import.meta.url),
).text();

const rendered = Bun.markdown.html(markdown);

export function renderHome() {
  return page({ content: rendered });
}
