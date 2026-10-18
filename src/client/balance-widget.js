import { html, r } from "https://esm.sh/jsr/@campfire/core@4.0.4";

const STYLES = `
  :host { display: block; font-family: var(--f-body, sans-serif); }

  p { margin-block: 1rem; }

  .muted { color: var(--c-gray, #666); font-size: 0.85em; }
`;

const pct = (value) => `${value.toFixed(2)}%`;

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
      const status = body?.payload;

      if (
        !res.ok ||
        !body?.ok ||
        typeof status?.dailyUsedPercent !== "number" ||
        typeof status?.monthlyRemainingPercent !== "number"
      ) {
        return;
      }

      shadow.innerHTML = html`
        <style>${r(STYLES)}</style>
        <p>
          Daily budget: <strong>${pct(status.dailyUsedPercent)}</strong> used ·
          Monthly balance: <strong>${pct(status.monthlyRemainingPercent)}</strong>
          <span class="muted">
            · updated ${new Date(status.updatedAt).toLocaleTimeString([], {
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
