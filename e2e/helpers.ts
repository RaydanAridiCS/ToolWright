import type { Page, Request } from "@playwright/test";

/** Records every network request a page makes (including fetch, XHR, images, workers). */
export function trackRequests(page: Page) {
  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));
  return {
    all: requests,
    /** Requests that left the site's own origin. */
    external(origin: string) {
      return requests.filter((r) => {
        const url = r.url();
        return !url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:");
      });
    },
    /** Requests whose URL or body contains the text. */
    containing(text: string) {
      return requests.filter((r) => r.url().includes(text) || (r.postData() ?? "").includes(text) || decodeURIComponent(r.url()).includes(text));
    },
  };
}

/** Builds a PNG in the browser (so the tests need no image library) and returns its bytes. */
export async function makePng(page: Page, width = 400, height = 300): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w as number;
      canvas.height = h as number;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createLinearGradient(0, 0, w as number, h as number);
      gradient.addColorStop(0, "#4f46e5");
      gradient.addColorStop(1, "#14b8a6");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w as number, h as number);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
        ctx.fillRect((i * 53) % (w as number), (i * 91) % (h as number), 6, 6);
      }
      return canvas.toDataURL("image/png");
    },
    [width, height],
  );
  return Buffer.from(dataUrl.split(",")[1] as string, "base64");
}

/** App alerts, excluding Next.js's built-in (empty) route announcer which also has role="alert". */
export const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
