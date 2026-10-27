import { describe, expect, it } from "bun:test";

import { createApp } from "../app";
import { renderHome } from "../home";
import { CONFIG } from "./utils";

const WIDGETS = {
  "api-key-widget.js": "api-key-widget",
  "balance-widget.js": "balance-widget",
};

describe("home", () => {
  it("renders the README with both widgets and their scripts", () => {
    const home = renderHome();

    expect(home).toContain("<api-key-widget>");
    expect(home).toContain('<balance-widget id="balance">');
    expect(home).toContain("https://ai-for-all.trythursday.org/#balance");
    expect(home).toContain("<title>Thursday | AI For All</title>");
    expect(home).toContain(
      'src="https://analytics.shantaram.xyz/script.js"',
    );
    expect(home).toContain(
      'data-website-id="bb5e9a75-a021-4f3b-a41f-9826db60979c"',
    );

    for (const name of Object.keys(WIDGETS)) {
      expect(home).toContain(`src="/${name}"`);
    }
  });

  it.each(Object.entries(WIDGETS))("serves %s as a module", async (name, tag) => {
    const res = await createApp(CONFIG).request(`http://x/${name}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/javascript");
    expect(await res.text()).toContain(`customElements.define("${tag}"`);
  });
});
