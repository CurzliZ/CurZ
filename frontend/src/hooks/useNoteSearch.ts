import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchNotes } from "@/services/api";

export function useNoteSearch(query: string) {
  const normalized = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(normalized), 75);
    return () => window.clearTimeout(timer);
  }, [normalized]);

  const search = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: ({ signal }) => searchNotes(debouncedQuery, signal),
    enabled: debouncedQuery.length > 0,
    staleTime: 0,
  });

  return {
    ...search,
    isDebouncing: normalized !== debouncedQuery,
    results: normalized === debouncedQuery ? search.data?.items ?? [] : [],
  };
}
