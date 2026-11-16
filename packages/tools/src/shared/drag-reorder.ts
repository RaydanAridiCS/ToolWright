"use client";

import { useState, type DragEvent } from "react";

/**
 * Drag-and-drop reordering for a list or grid, with the browser's own drag and drop. Spread `itemProps(index)` on each
 * item. Lists that use it still need move buttons: drag and drop does not work with a keyboard or on most touch screens.
 * Files dropped from outside are ignored here (they bubble up to the drop zone).
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const end = () => {
    setDragging(null);
    setOver(null);
  };

  const itemProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragging(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    onDragOver: (e: DragEvent) => {
      if (dragging === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== index) setOver(index);
    },
    onDrop: (e: DragEvent) => {
      if (dragging === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (dragging !== index) onMove(dragging, index);
      end();
    },
    onDragEnd: end,
  });

  return { itemProps, dragging, over };
}

/** Moves one entry of a list to another place. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
