"use client";

import * as React from "react";

/**
 * A registry of forms that currently hold unsaved edits.
 *
 * Sign-out is meant to ask for confirmation *only* when there is something to
 * lose. A form knows whether it is dirty; the menu that triggers sign-out does
 * not, and there is no route-level way to ask. So a dirty form registers itself
 * here and sign-out consults the result.
 *
 * It is a count rather than a boolean because two settings tabs can be open in
 * two tabs, and one of them saving should not clear the other's flag.
 */

let dirtyForms = 0;
const subscribers = new Set<() => void>();

function publish() {
  subscribers.forEach((listener) => listener());
}

export function hasUnsavedChanges(): boolean {
  return dirtyForms > 0;
}

/**
 * Mark this form dirty or clean for as long as it is mounted.
 *
 * The release is in the effect cleanup rather than in the setter, so navigating
 * away — or a form unmounting mid-edit — can never leave a stale "unsaved"
 * behind that blocks the next sign-out.
 */
export function useUnsavedChanges(isDirty: boolean): void {
  React.useEffect(() => {
    if (!isDirty) return;

    dirtyForms += 1;
    publish();

    return () => {
      dirtyForms = Math.max(0, dirtyForms - 1);
      publish();
    };
  }, [isDirty]);
}

/** Re-render on change. Cheap, and there are only ever a few subscribers. */
export function useHasUnsavedChanges(): boolean {
  const [dirty, setDirty] = React.useState(hasUnsavedChanges());

  React.useEffect(() => {
    const listener = () => setDirty(hasUnsavedChanges());
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  return dirty;
}