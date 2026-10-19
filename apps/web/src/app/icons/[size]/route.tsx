import { ImageResponse } from "next/og";

export const dynamic = "force-static";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** PNG app icons for the web manifest, drawn with the same mark as the logo. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.includes(size as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#6366f1,#4338ca)" }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32">
          <path d="M5 7h22v6h-8v13h-6V13H5z" fill="#fff" />
          <circle cx="25.5" cy="25.5" r="3.4" fill="#2dd4bf" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
