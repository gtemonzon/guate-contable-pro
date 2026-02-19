import { useEffect, useRef } from "react";

export interface FormShortcutsOptions {
  /** Primary save / post action */
  onSave?: () => void;
  /** Save draft action (Ctrl+Shift+Enter) */
  onSaveDraft?: () => void;
  /** New record action (Alt+N) */
  onNew?: () => void;
  /** Cancel / close action (Esc) */
  onCancel?: () => void;
  /** Whether shortcuts are enabled */
  isEnabled?: boolean;
  /** Whether the form has unsaved changes (used to gate Esc) */
  isDirty?: boolean;
  /** Also intercept Ctrl+S for save-draft (opt-in, risky with browser defaults) */
  allowCtrlS?: boolean;
}

function isInMultilineTextarea(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLTextAreaElement)) return false;
  return true;
}

function isComposingIME(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

/**
 * useFormShortcuts — registers browser-safe keyboard shortcuts for forms.
 *
 * Default shortcuts:
 *  - Ctrl+Enter / Cmd+Enter        → onSave
 *  - Ctrl+Shift+Enter / Cmd+…      → onSaveDraft (falls back to onSave)
 *  - Alt+N                          → onNew
 *  - Esc                            → onCancel (only when not dirty or explicitly)
 *  - Ctrl+S / Cmd+S (opt-in)        → onSaveDraft
 *
 * Shortcuts are suppressed when:
 *  - isEnabled is false
 *  - focus is inside a multiline <textarea>
 *  - IME composition is active
 */
export function useFormShortcuts({
  onSave,
  onSaveDraft,
  onNew,
  onCancel,
  isEnabled = true,
  isDirty = false,
  allowCtrlS = false,
}: FormShortcutsOptions) {
  // Keep stable refs so we don't need to re-register on every render
  const onSaveRef = useRef(onSave);
  const onSaveDraftRef = useRef(onSaveDraft);
  const onNewRef = useRef(onNew);
  const onCancelRef = useRef(onCancel);
  const isEnabledRef = useRef(isEnabled);
  const isDirtyRef = useRef(isDirty);
  const allowCtrlSRef = useRef(allowCtrlS);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onSaveDraftRef.current = onSaveDraft; }, [onSaveDraft]);
  useEffect(() => { onNewRef.current = onNew; }, [onNew]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { isEnabledRef.current = isEnabled; }, [isEnabled]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { allowCtrlSRef.current = allowCtrlS; }, [allowCtrlS]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isEnabledRef.current) return;
      if (isComposingIME(e)) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const primary = isMac ? e.metaKey : e.ctrlKey;
      const target = e.target;

      // --- Ctrl+Enter / Cmd+Enter → Save (primary) ---
      if (primary && e.key === "Enter" && !e.shiftKey) {
        if (isInMultilineTextarea(target)) return;
        if (onSaveRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onSaveRef.current();
        }
        return;
      }

      // --- Ctrl+Shift+Enter / Cmd+Shift+Enter → Save Draft ---
      if (primary && e.shiftKey && e.key === "Enter") {
        if (isInMultilineTextarea(target)) return;
        const handler = onSaveDraftRef.current ?? onSaveRef.current;
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler();
        }
        return;
      }

      // --- Ctrl+S / Cmd+S (opt-in) → Save Draft ---
      if (primary && e.key === "s" && allowCtrlSRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const handler = onSaveDraftRef.current ?? onSaveRef.current;
        if (handler) handler();
        return;
      }

      // --- Alt+N → New record ---
      if (e.altKey && e.key.toLowerCase() === "n") {
        if (onNewRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onNewRef.current();
        }
        return;
      }

      // --- Esc → Cancel (only when not dirty, or no unsaved changes) ---
      if (e.key === "Escape" && !isDirtyRef.current) {
        if (onCancelRef.current) {
          // Don't prevent default here — let dialogs/modals also close naturally
          onCancelRef.current();
        }
        return;
      }
    };

    // Use capture phase so we can intercept before React's synthetic event system
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []); // empty deps — all values read via refs
}
