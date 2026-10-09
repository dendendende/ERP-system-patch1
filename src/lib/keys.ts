/** Typing in a field, so a letter is a letter, not a shortcut. */
export function typingIn(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']"),
  );
}
