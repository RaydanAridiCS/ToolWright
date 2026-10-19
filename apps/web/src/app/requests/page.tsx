import type { Metadata } from "next";
import { RequestBoard } from "../../components/request-board";

export const metadata: Metadata = {
  title: "Request a tool",
  description: "Suggest the next Toolwright tool and vote on ideas from the community. No account needed.",
  alternates: { canonical: "/requests" },
};

export default function RequestsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Request a tool</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Tell us what to build next. The most-voted ideas get built first, and anyone can contribute one.</p>
      <div className="mt-10">
        <RequestBoard />
      </div>
    </div>
  );
}
