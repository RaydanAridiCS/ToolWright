"use client";

import { useMemo } from "react";
import { Eraser } from "lucide-react";
import { Button, Panel, Stat, StatGrid, Textarea, useShareableState } from "@toolwright/ui";
import { countText } from "@toolwright/core/text";
import { formatInt, formatMinutes } from "../../shared/format";

export default function Tool() {
  const { state, setState } = useShareableState({ text: "" });
  const stats = useMemo(() => countText(state.text), [state.text]);

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Your text"
        actions={
          <Button size="sm" variant="ghost" disabled={!state.text} onClick={() => setState({ text: "" })}>
            <Eraser /> Clear
          </Button>
        }
      >
        <Textarea
          aria-label="Your text"
          mono={false}
          rows={12}
          className="min-h-56 text-base"
          placeholder="Start typing or paste your text here…"
          value={state.text}
          onChange={(e) => setState({ text: e.target.value })}
        />
      </Panel>
      <StatGrid>
        <Stat label="Words" value={formatInt(stats.words)} />
        <Stat label="Characters" value={formatInt(stats.characters)} />
        <Stat label="Characters (no spaces)" value={formatInt(stats.charactersNoSpaces)} />
        <Stat label="Sentences" value={formatInt(stats.sentences)} />
        <Stat label="Paragraphs" value={formatInt(stats.paragraphs)} />
        <Stat label="Lines" value={formatInt(stats.lines)} />
        <Stat label="Size (UTF-8)" value={`${formatInt(stats.bytes)} B`} />
        <Stat label="Reading time" value={formatMinutes(stats.readingMinutes)} />
        <Stat label="Speaking time" value={formatMinutes(stats.speakingMinutes)} />
      </StatGrid>
    </div>
  );
}
