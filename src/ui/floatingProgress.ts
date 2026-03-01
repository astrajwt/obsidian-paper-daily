/** Floating progress widget shown while the daily pipeline runs in the background. */
export class FloatingProgress {
  private el: HTMLElement;
  private msgEl: HTMLElement;

  constructor(onStop: () => void) {
    this.el = document.body.createDiv();
    this.el.style.cssText = [
      "position:fixed",
      "bottom:24px",
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

    const title = header.createEl("span", { text: "📚 Paper Daily 运行中" });
    title.style.cssText = "font-weight:600;font-size:0.92em;color:var(--text-normal);";

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
  }

  setMessage(msg: string): void {
    this.msgEl.setText(msg);
  }

  destroy(): void {
    this.el.remove();
  }
}
