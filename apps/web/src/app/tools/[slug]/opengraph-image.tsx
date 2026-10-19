import { ImageResponse } from "next/og";
import { CATEGORY_BY_ID, getTool, tools } from "@toolwright/tools";

export const alt = "Toolwright tool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getTool(slug);
  const name = tool?.name ?? "Toolwright";
  const tagline = tool?.tagline ?? "Free, open-source tools that never see your data.";
  const category = tool ? CATEGORY_BY_ID[tool.category].name : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#ececf8",
          background: "linear-gradient(135deg, #0a0a18 0%, #1b1b4b 55%, #0f3d3a 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#6366f1,#4338ca)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 36, fontWeight: 800 }}>T</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>Toolwright</div>
          {category ? <div style={{ marginLeft: 12, padding: "6px 16px", borderRadius: 999, background: "rgba(139,147,255,0.18)", color: "#b9beff", fontSize: 24 }}>{category}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{name}</div>
          <div style={{ fontSize: 34, color: "#a0a0c6", lineHeight: 1.3, maxWidth: 980 }}>{tagline}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, color: "#2dd4bf" }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: "#2dd4bf" }} />
          Runs in your browser · Nothing is uploaded · Open source
        </div>
      </div>
    ),
    size,
  );
}
