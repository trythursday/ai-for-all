import { html, r } from "https://esm.sh/jsr/@campfire/core@4.0.4";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@cap.js/wasm@0.0.8/browser/cap_wasm.js";

const STYLES = `
  :host {
    display: block;
    font-family: var(--f-body, sans-serif);
    line-height: var(--f-line, 1.5);
    margin-block: 2rem;
  }

  .panel {
    border: 2px solid var(--c-fg, #202020);
    border-radius: 0.5rem;
    padding: 1.5rem 2rem;
  }

  .panel > :first-child { margin-block-start: 0; }
  .panel > :last-child { margin-block-end: 0; }

  h2 { font-size: 1.25em; margin-block: 0 0.5rem; }

  p { margin-block: 0.5rem; }

  .muted { color: var(--c-gray, #666); font-size: 0.85em; }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  button {
    font: inherit;
    font-size: 0.85em;
    font-weight: bold;
    padding: 0.6rem 1.2rem;
    border: 2px solid LinkText;
    border-radius: 0.5rem;
    background-color: LinkText;
    color: Canvas;
    cursor: pointer;
  }

  button:hover { text-decoration: underline; }

  progress { width: 100%; height: 1rem; }

  .key {
    background-color: ButtonFace;
    font-family: var(--f-code, monospace);
    font-size: 0.85em;
    padding: 0.2em 0.4em;
    user-select: all;
    word-break: break-all;
  }
`;

class WidgetError extends Error {}

const panel = (title, body) => html`
  <div class="panel">
    <h2>${title}</h2>
    ${r(body)}
  </div>
`;

function fnv1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function fnv1aResume(state, str) {
  let h = state;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function prng(state, length) {
  let result = "";
  while (result.length < length) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    result += state.toString(16).padStart(8, "0");
  }
  return result.slice(0, length);
}

let solvePow;

async function loadSolver() {
  if (solvePow) return solvePow;

  try {
    const wasm = await import(WASM_URL);
    await wasm.default();
    solvePow = wasm.solve_pow;
  } catch {
    throw new WidgetError(
      "Could not load the proof-of-work solver. Check your connection and try again.",
    );
  }

  return solvePow;
}

// capjs-core derives a salt and a target per challenge from the token. The wasm
// module only finds the nonce for one salt/target pair, so the loop is here.
async function solve(token, { c, s, d }, onProgress) {
  const findNonce = await loadSolver();
  const tokenHash = fnv1a(token);
  const solutions = [];

  for (let i = 0; i < c; i++) {
    const saltSeed = fnv1aResume(tokenHash, String(i + 1));
    const salt = prng(saltSeed, s);
    const target = prng(fnv1aResume(saltSeed, "d"), d);

    solutions.push(Number(findNonce(salt, target)));

    if (i % 5 === 0 || i === c - 1) {
      onProgress((i + 1) / c);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return solutions;
}

async function post(path, body, rateMessage) {
  const response = await fetch(path, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const reply = await response.json().catch(() => null);

  if (response.status === 429) throw new WidgetError(rateMessage);

  if (!response.ok || !reply?.ok) {
    throw new WidgetError(
      reply?.error?.message ?? "The server rejected the request.",
    );
  }

  return { response, reply };
}

class ApiKeyWidget extends HTMLElement {
  #shadow;
  #state = { phase: "idle" };

  connectedCallback() {
    if (this.#shadow) return;

    this.#shadow = this.attachShadow({ mode: "open" });
    this.#render();
  }

  #render() {
    this.#shadow.innerHTML = html`
      <style>${r(STYLES)}</style>
      ${r(this.#view())}
    `;

    this.#shadow
      .querySelectorAll("[data-start]")
      .forEach((button) => button.addEventListener("click", () => this.#issue()));

    this.#shadow
      .querySelector("[data-copy]")
      ?.addEventListener("click", () => this.#copy());
  }

  #view() {
    const state = this.#state;

    if (state.phase === "solving") {
      const percent = Math.round(state.progress * 100);

      return panel(
        "Getting your key",
        html`
          <p role="status">
            Solving a proof-of-work challenge (${percent}%). Keep this tab open.
          </p>
          <progress value="${state.progress}" max="1"></progress>
          <p class="muted">The work runs in your browser, not on the server.</p>
        `,
      );
    }

    if (state.phase === "done") {
      const expires = state.expires
        ? new Date(state.expires).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : null;

      return panel(
        "Your API key",
        html`
          <p><code class="key">${state.apiKey}</code></p>
          <p class="row">
            <button data-copy>${state.copied ? "Copied" : "Copy"}</button>
            ${expires
              ? r(html`<span class="muted">Expires ${expires}</span>`)
              : ""}
          </p>
          <p class="muted">
            Base URL: <code>${location.origin}/api/v1</code> — 25 requests an
            hour, 32k context.
          </p>
        `,
      );
    }

    if (state.phase === "error") {
      return panel(
        "Could not get a key",
        html`
          <p role="alert">${state.message}</p>
          <p class="row"><button data-start>Try again</button></p>
        `,
      );
    }

    return panel(
      "Get an API key",
      html`
        <p>
          One click to get a key valid for 24 hours. 25 requests/hr per IP. 16k
          in/out, 32k total context.
        </p>
        <p class="row"><button data-start>Solve the challenge</button></p>
      `,
    );
  }

  async #issue() {
    this.#state = { phase: "solving", progress: 0 };
    this.#render();

    try {
      const { reply: challenge } = await post(
        "/api/v1/issue/challenge",
        undefined,
        "A challenge was issued in the past minute. Wait a minute and try again.",
      );

      const { c, s, d } = challenge.payload.challenge;
      const { token } = challenge.payload;

      const solutions = await solve(token, { c, s, d }, (progress) => {
        this.#state = { phase: "solving", progress };
        this.#render();
      });

      const { response, reply } = await post(
        "/api/v1/issue",
        { token, solutions },
        "A key was issued from this IP in the past 10 minutes. Try again shortly.",
      );

      this.#state = {
        phase: "done",
        apiKey: reply.payload.apiKey,
        expires: response.headers.get("x-key-expires-at"),
      };
    } catch (error) {
      this.#state = {
        phase: "error",
        message:
          error instanceof WidgetError
            ? error.message
            : "Something went wrong. Try again.",
      };
    }

    this.#render();
  }

  async #copy() {
    try {
      await navigator.clipboard.writeText(this.#state.apiKey);
    } catch {
      const area = document.createElement("textarea");
      area.value = this.#state.apiKey;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    this.#state = { ...this.#state, copied: true };
    this.#render();
  }
}

customElements.define("api-key-widget", ApiKeyWidget);
