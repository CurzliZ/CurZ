import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "saved" | "saving" | "unsaved" | "error";

const draftKey = (noteId: number) => `curz-note-draft:${noteId}`;
const legacyDraftKey = (noteId: number) => `threadwise-note-draft:${noteId}`;

function readDraft(noteId: number, fallback: string): string {
  try {
    const currentDraft = window.localStorage.getItem(draftKey(noteId));
    if (currentDraft !== null) return currentDraft;
    const legacyDraft = window.localStorage.getItem(legacyDraftKey(noteId));
    if (legacyDraft !== null) {
      window.localStorage.setItem(draftKey(noteId), legacyDraft);
      window.localStorage.removeItem(legacyDraftKey(noteId));
      return legacyDraft;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

interface SaveResult {
  content: string;
}

interface UseAutosaveOptions {
  noteId: number;
  initialContent: string;
  save: (noteId: number, content: string) => Promise<SaveResult>;
  delay?: number;
}

export function useAutosave({
  noteId,
  initialContent,
  save,
  delay = 700,
}: UseAutosaveOptions) {
  const [content, setContentState] = useState(() => readDraft(noteId, initialContent));
  const [status, setStatus] = useState<AutosaveStatus>(() =>
    content === initialContent ? "saved" : "unsaved",
  );
  const [error, setError] = useState<Error | null>(null);
  const contentRef = useRef(content);
  const savedContentRef = useRef(initialContent);
  const saveRef = useRef(save);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(true);

  saveRef.current = save;

  const saveLatest = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    const attemptedContent = contentRef.current;
    if (attemptedContent === savedContentRef.current) {
      if (mountedRef.current) setStatus("saved");
      return;
    }

    inFlightRef.current = true;
    queuedRef.current = false;
    if (mountedRef.current) {
      setStatus("saving");
      setError(null);
    }
    let succeeded = false;
    try {
      const result = await saveRef.current(noteId, attemptedContent);
      savedContentRef.current = result.content;
      try {
        if (contentRef.current === result.content) {
          window.localStorage.removeItem(draftKey(noteId));
        } else {
          window.localStorage.setItem(draftKey(noteId), contentRef.current);
        }
      } catch {
        if (mountedRef.current) {
          setError(new Error("The browser could not update its local recovery copy."));
          setStatus("error");
        }
      }
      succeeded = true;
      if (mountedRef.current) {
        setStatus(contentRef.current === result.content ? "saved" : "unsaved");
      }
    } catch (reason) {
      const failure =
        reason instanceof Error ? reason : new Error("The note could not be saved.");
      if (mountedRef.current) {
        if (contentRef.current === savedContentRef.current) {
          setError(null);
          setStatus("saved");
        } else {
          setError(failure);
          setStatus("error");
        }
      }
    } finally {
      inFlightRef.current = false;
      const hasNewerDraft = contentRef.current !== savedContentRef.current;
      if ((queuedRef.current || (succeeded && hasNewerDraft)) && hasNewerDraft) {
        queuedRef.current = false;
        void saveLatest();
      }
    }
  }, [noteId]);

  const setContent = useCallback(
    (nextContent: string) => {
      contentRef.current = nextContent;
      setContentState(nextContent);
      setError(null);
      setStatus(nextContent === savedContentRef.current ? "saved" : "unsaved");
      try {
        if (nextContent === savedContentRef.current) {
          window.localStorage.removeItem(draftKey(noteId));
        } else {
          window.localStorage.setItem(draftKey(noteId), nextContent);
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason
            : new Error("The browser could not store a local recovery copy."),
        );
        setStatus("error");
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (nextContent !== savedContentRef.current) {
        timerRef.current = setTimeout(() => void saveLatest(), delay);
      }
    },
    [delay, saveLatest],
  );

  useEffect(() => {
    if (contentRef.current !== savedContentRef.current) {
      timerRef.current = setTimeout(() => void saveLatest(), delay);
    }
  }, [delay, saveLatest]);

  const retry = useCallback(() => {
    setError(null);
    setStatus("unsaved");
    void saveLatest();
  }, [saveLatest]);

  useEffect(() => {
    mountedRef.current = true;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (contentRef.current === savedContentRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (contentRef.current !== savedContentRef.current) {
        void saveLatest();
      }
    },
    [saveLatest],
  );

  return { content, setContent, status, error, retry };
}
