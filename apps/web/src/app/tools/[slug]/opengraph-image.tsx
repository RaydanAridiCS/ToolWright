import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { CATEGORY_BY_ID, getTool, tools } from "@toolwright/tools";

export const alt = "Toolwright tool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

// Satori can read WOFF (not WOFF2). Loaded once at build time; this route is statically generated.
const fontFile = (weight: 700 | 800) =>
  readFileSync(path.join(process.cwd(), "../../node_modules/@fontsource/bricolage-grotesque/files", `bricolage-grotesque-latin-${weight}-normal.woff`));

const PAPER = "#f4f0e6";
const INK = "#1b1a15";
const MUTED = "#5b574a";
const GREEN = "#0b6b55";
const MARKER = "#d8ec4e";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getTool(slug);
  const name = tool?.name ?? "Toolwright";
  const tagline = tool?.tagline ?? "Do the job. Keep the data.";
  const category = tool ? CATEGORY_BY_ID[tool.category].name.toUpperCase() : "";
  const index = tool ? String(tools.findIndex((t) => t.slug === tool.slug) + 1).padStart(3, "0") : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, padding: 36, fontFamily: "Bricolage" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", border: `3px solid ${INK}`, padding: "44px 56px", background: "#fbf9f3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <svg width="48" height="48" viewBox="0 0 32 32">
                <path fill={INK} fillRule="evenodd" d="M2 2h28v25H2zM11 2h10v11H11zM16 17a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z" />
                <rect x="2" y="28.5" width="28" height="3" fill={MARKER} />
              </svg>
              <div style={{ fontSize: 34, fontWeight: 800, color: INK, letterSpacing: -1 }}>Toolwright</div>
            </div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: MUTED, letterSpacing: 3 }}>{tool ? `TOOL ${index} · ${category}` : "TOOL CATALOGUE"}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: name.length > 26 ? 84 : 100, fontWeight: 800, color: INK, lineHeight: 0.98, letterSpacing: -3 }}>{name}</div>
            <div style={{ width: 280, height: 16, background: MARKER, marginTop: 14, marginBottom: 26 }} />
            <div style={{ fontSize: 34, fontWeight: 700, color: MUTED, lineHeight: 1.3, maxWidth: 940 }}>{tagline}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 700, letterSpacing: 2, color: INK, borderTop: `2px solid ${INK}`, paddingTop: 22 }}>
            <div style={{ width: 16, height: 16, background: GREEN, border: `2px solid ${INK}` }} />
            RUNS ON YOUR DEVICE · OUTSIDE REQUESTS 0
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: fontFile(700), weight: 700, style: "normal" },
        { name: "Bricolage", data: fontFile(800), weight: 800, style: "normal" },
      ],
    },
  );
}
