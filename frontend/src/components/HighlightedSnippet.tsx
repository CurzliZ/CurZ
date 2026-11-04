import type { ReactNode } from "react";

export function HighlightedSnippet({ snippet }: { snippet: string }) {
  const parts = snippet.split(/(<mark>|<\/mark>)/g);
  let highlighted = false;
  const content: ReactNode[] = [];

  for (const [index, part] of parts.entries()) {
    if (part === "<mark>") {
      highlighted = true;
    } else if (part === "</mark>") {
      highlighted = false;
    } else if (part) {
      content.push(
        highlighted ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>,
      );
    }
  }

  return <>{content}</>;
}
