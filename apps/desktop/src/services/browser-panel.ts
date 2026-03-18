import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { BrowserWindow, WebContentsView } from "electron";

export class BrowserPanel {
  private view: WebContentsView | null = null;
  private parentWindow: BrowserWindow | null = null;
  private visible = false;
  private splitRatio = 0.5;

  attach(window: BrowserWindow): void {
    this.parentWindow = window;
    this.view = new WebContentsView();
    window.contentView.addChildView(this.view);
    this.view.setVisible(false);
  }

  detach(): void {
    if (this.view && this.parentWindow) {
      this.parentWindow.contentView.removeChildView(this.view);
      this.view.webContents.close();
      this.view = null;
    }
    this.parentWindow = null;
    this.visible = false;
  }

  async navigate(url: string): Promise<void> {
    if (!this.view) return;
    await this.view.webContents.loadURL(url);
  }

  show(): void {
    if (!this.view || !this.parentWindow) return;
    this.visible = true;
    this.view.setVisible(true);
    this.updateBounds();
  }

  hide(): void {
    if (!this.view) return;
    this.visible = false;
    this.view.setVisible(false);
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  updateBounds(): void {
    if (!this.view || !this.parentWindow || !this.visible) return;

    const size = this.parentWindow.getContentSize();
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    const panelWidth = Math.floor(width * this.splitRatio);

    this.view.setBounds({
      x: width - panelWidth,
      y: 0,
      width: panelWidth,
      height,
    });
  }

  async screenshot(): Promise<string> {
    if (!this.view) throw new Error("Browser panel not attached");

    const image = await this.view.webContents.capturePage();
    const pngBuffer = image.toPNG();

    const tmpFile = path.join(os.tmpdir(), `iara-screenshot-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, pngBuffer);
    return tmpFile;
  }

  async getAccessibilityTree(): Promise<string> {
    if (!this.view) throw new Error("Browser panel not attached");

    const result = await this.view.webContents.executeJavaScript(`
			(function() {
				function buildTree(el, depth) {
					if (depth > 10) return '';
					const role = el.getAttribute('role') || el.tagName.toLowerCase();
					const text = el.textContent?.trim().slice(0, 100) || '';
					const indent = '  '.repeat(depth);
					let result = indent + role;
					if (text && !el.children.length) result += ': ' + text;
					result += '\\n';
					for (const child of el.children) {
						result += buildTree(child, depth + 1);
					}
					return result;
				}
				return buildTree(document.body, 0);
			})()
		`);

    return typeof result === "string" ? result : String(result);
  }

  async click(selector: string): Promise<void> {
    if (!this.view) throw new Error("Browser panel not attached");
    await this.view.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)})?.click()`,
    );
  }

  async fill(selector: string, value: string): Promise<void> {
    if (!this.view) throw new Error("Browser panel not attached");
    await this.view.webContents.executeJavaScript(`
			(() => {
				const el = document.querySelector(${JSON.stringify(selector)});
				if (el) {
					el.value = ${JSON.stringify(value)};
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				}
			})()
		`);
  }

  async evaluate(script: string): Promise<unknown> {
    if (!this.view) throw new Error("Browser panel not attached");
    return this.view.webContents.executeJavaScript(script);
  }
}
