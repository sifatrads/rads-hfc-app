/**
 * Undo/redo history for the project model. `set` commits an edit (pushes the
 * previous state onto the undo stack and clears redo); `reset` swaps in a fresh
 * document and clears history (file open / New / cloud restore). All in-app
 * editors — the Project-tab tables and the 3D editor — go through `set`, so any
 * edit is undoable.
 */
import { useCallback, useState } from "react";
import type { ProjectModel } from "@rads/model";

const CAP = 40; // bounded so large models (e.g. embedded datasheets) don't pile up

interface History {
  past: ProjectModel[];
  present: ProjectModel | null;
  future: ProjectModel[];
}

export interface ModelHistory {
  model: ProjectModel | null;
  /** Commit an edit (value or updater of the current model). Undoable. */
  set: (next: ProjectModel | ((m: ProjectModel) => ProjectModel)) => void;
  /** Replace the document and clear history (open / New / restore). */
  reset: (m: ProjectModel) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useModelHistory(): ModelHistory {
  const [h, setH] = useState<History>({ past: [], present: null, future: [] });

  const set = useCallback((next: ProjectModel | ((m: ProjectModel) => ProjectModel)) => {
    setH((cur) => {
      if (!cur.present) return cur;
      const value = typeof next === "function" ? next(cur.present) : next;
      if (!value || value === cur.present) return cur;
      const past = [...cur.past, cur.present];
      if (past.length > CAP) past.splice(0, past.length - CAP);
      return { past, present: value, future: [] };
    });
  }, []);

  const reset = useCallback((m: ProjectModel) => setH({ past: [], present: m, future: [] }), []);

  const undo = useCallback(() => setH((c) => {
    if (!c.past.length || !c.present) return c;
    const prev = c.past[c.past.length - 1]!;
    return { past: c.past.slice(0, -1), present: prev, future: [c.present, ...c.future] };
  }), []);

  const redo = useCallback(() => setH((c) => {
    if (!c.future.length) return c;
    const next = c.future[0]!;
    return { past: c.present ? [...c.past, c.present] : c.past, present: next, future: c.future.slice(1) };
  }), []);

  return { model: h.present, set, reset, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
