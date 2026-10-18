import { describe, expect, it } from "bun:test";

import { createApp } from "../app";
import { renderHome } from "../home";
import { CONFIG } from "./utils";

describe("home", () => {
  it("renders the README around the widget", () => {
    const home = renderHome();

    expect(home).toContain("<api-key-widget>");
    expect(home).toContain("https://ai-for-all.trythursday.org");
    expect(home).toContain('src="/widget.js"');
  });

  it("serves the widget as a module", async () => {
    const res = await createApp(CONFIG).request("http://x/widget.js");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/javascript");
    expect(await res.text()).toContain('customElements.define("api-key-widget"');
  });
});
