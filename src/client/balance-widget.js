import { html, r } from "https://esm.sh/jsr/@campfire/core@4.0.4";

const STYLES = `
  :host { display: block; font-family: var(--f-body, sans-serif); }

  p { margin-block: 1rem; }

  .muted { color: var(--c-gray, #666); font-size: 0.85em; }
`;

const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});

class BalanceWidget extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    this.#load(shadow);
  }

  async #load(shadow) {
    // The README has no fallback here, so a failure renders nothing.
    try {
      const res = await fetch("/api/v1/balance");
      const body = await res.json();
      const balance = body?.payload;

      if (!res.ok || !body?.ok || typeof balance?.remainingUsd !== "number") {
        return;
      }

      shadow.innerHTML = html`
        <style>${r(STYLES)}</style>
        <p>
          OpenRouter balance: <strong>${usd.format(balance.remainingUsd)}</strong> left
          <span class="muted">
            · updated ${new Date(balance.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
      `;
    } catch {
      return;
    }
  }
}

customElements.define("balance-widget", BalanceWidget);
