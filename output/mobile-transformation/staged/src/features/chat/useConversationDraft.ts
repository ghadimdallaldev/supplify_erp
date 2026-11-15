import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { businessSessionKey } from "../auth/sessionIsolation";

let activeScope: string | null = null;
const drafts = new Map<string, string>();

/** In-memory presentation drafts, isolated by the same identity as the navigator. */
export function useConversationDraft(
  conversationId: string,
): [string, (value: string) => void] {
  const { user } = useAuth();
  const scope = businessSessionKey(user);
  if (activeScope !== scope) {
    drafts.clear();
    activeScope = scope;
  }
  const key = String(scope) + ":" + conversationId;
  const [draft, setDraft] = useState(() => drafts.get(key) ?? "");
  useEffect(() => {
    setDraft(drafts.get(key) ?? "");
  }, [key]);
  const update = useCallback(
    (value: string) => {
      drafts.set(key, value);
      setDraft(value);
    },
    [key],
  );
  return [draft, update];
}
