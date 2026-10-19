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
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">All tools</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Everything runs in your browser. Search, filter by category, or star the tools you use most.</p>
      <div className="mt-8">
        {/* useSearchParams requires a Suspense boundary for static rendering */}
        <Suspense fallback={<div className="skeleton h-14 w-full" />}>
          <ToolBrowser />
        </Suspense>
      </div>
    </div>
  );
}
