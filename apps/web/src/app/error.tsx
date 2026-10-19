"use client";

import { useEffect } from "react";
import { Button } from "@toolwright/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">An unexpected error stopped this page. Your data is safe: nothing was sent anywhere.</p>
      <Button className="mt-8" variant="primary" size="lg" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
