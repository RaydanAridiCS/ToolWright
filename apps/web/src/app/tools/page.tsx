import { Suspense } from "react";
import type { Metadata } from "next";
import { tools } from "@toolwright/tools";
import { ToolBrowser } from "../../components/tool-browser";

export const metadata: Metadata = {
  title: "All tools",
  description: `Browse all ${tools.length} free, private, browser-based tools: PDF, image, developer, text, color and calculator tools. No uploads, no sign-up.`,
  alternates: { canonical: "/tools" },
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="label-plate mb-3">The catalogue</p>
      <h1 className="font-display text-[clamp(2.6rem,6vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.028em]">All {tools.length} tools</h1>
      <p className="mt-4 max-w-xl text-lg">Everything runs on your device. Search, open a drawer, or star the ones you use most.</p>
      <div className="mt-10">
        {/* useSearchParams requires a Suspense boundary for static rendering */}
        <Suspense fallback={<div className="skeleton h-16 w-full" />}>
          <ToolBrowser />
        </Suspense>
      </div>
    </div>
  );
}
