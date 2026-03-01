function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// Slot system: each widget grabs the lowest free slot and releases on destroy.
// Slot N sits at bottom = BASE + N * STEP px from the screen bottom.
const BASE = 24;
const STEP = 160;
const usedSlots = new Set<number>();

function acquireSlot(): number {
  let s = 0;
  while (usedSlots.has(s)) s++;
  usedSlots.add(s);
  return s;
}

/** Floating progress widget shown while a pipeline runs in the background. */
export class FloatingProgress {
  private el: HTMLElement;
  private msgEl: HTMLElement;
  private tokenEl: HTMLElement;
  private slot: number;

  constructor(onStop: () => void, title = "📚 Paper Daily 运行中") {
    this.slot = acquireSlot();
    this.el = document.body.createDiv();
    this.el.style.cssText = [
      "position:fixed",
      `bottom:${BASE + this.slot * STEP}px`,
      "right:24px",
      "z-index:9999",
      "background:var(--background-secondary)",
      "border:1px solid var(--background-modifier-border)",
      "border-radius:10px",
      "padding:14px 18px 12px",
      "min-width:300px",
      "max-width:420px",
      "box-shadow:0 4px 20px rgba(0,0,0,0.25)",
      "font-family:var(--font-interface)",
    ].join(";");

    // Header row
    const header = this.el.createDiv();
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;";

    const titleEl = header.createEl("span", { text: title });
    titleEl.style.cssText = "font-weight:600;font-size:0.92em;color:var(--text-normal);";

    const stopBtn = header.createEl("button", { text: "停止" });
    stopBtn.style.cssText = [
      "padding:2px 10px",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:0.8em",
      "border:1px solid var(--text-error,#cc4444)",
      "color:var(--text-error,#cc4444)",
      "background:transparent",
    ].join(";");
    stopBtn.onclick = () => {
      onStop();
      stopBtn.disabled = true;
      stopBtn.textContent = "停止中...";
    };

    // Progress message
    this.msgEl = this.el.createEl("div");
    this.msgEl.style.cssText = "font-size:0.83em;color:var(--text-muted);word-break:break-word;line-height:1.4;";
    this.msgEl.setText("初始化中...");

    // Token counter — hidden until first LLM call completes
    this.tokenEl = this.el.createEl("div");
    this.tokenEl.style.cssText = [
      "font-size:0.78em",
      "color:var(--text-faint)",
      "margin-top:6px",
      "display:none",
    ].join(";");
  }

  setMessage(msg: string): void {
    this.msgEl.setText(msg);
  }

  setTokens(inputTokens: number, outputTokens: number): void {
    const total = inputTokens + outputTokens;
    this.tokenEl.setText(`tokens: ${fmtTokens(total)}`);
    this.tokenEl.style.display = "";
  }

  destroy(): void {
    usedSlots.delete(this.slot);
    this.el.remove();
  }
}
