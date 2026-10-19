import { ImageResponse } from "next/og";

export const dynamic = "force-static";

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

/** PNG app icons for the web manifest: the Toolwright mark (spanner head, bolt hole, marker underline) on paper. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.includes(size as (typeof SIZES)[number])) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f0e6" }}>
        <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 32 32">
          <path fill="#1b1a15" fillRule="evenodd" d="M4 3h24v23H4zM12 3h8v10h-8zM16 17a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z" />
          <rect x="4" y="27.5" width="24" height="2.5" fill="#d8ec4e" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
