import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { Decoration, EditorView, ViewPlugin, highlightActiveLine } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import type { Completion, CompletionContext } from "@codemirror/autocomplete";

import { resolveWikilink, getWikilinkCompletions } from "@/lib/wikilinks";
import type { NoteTarget } from "@/services/api";

interface MarkdownEditorProps {
  value: string;
  targets: NoteTarget[];
  onChange: (value: string) => void;
  onOpenNote: (id: number) => void;
  evidenceRange: { start: number; end: number; revision: number } | null;
}

const setEvidenceHighlight = StateEffect.define<{ from: number; to: number } | null>();
const evidenceHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let decorations = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setEvidenceHighlight)) {
        const range = effect.value;
        decorations = range
          ? Decoration.set([
              Decoration.mark({ class: "cm-evidence-highlight" }).range(range.from, range.to),
            ])
          : Decoration.none;
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function wikilinkSource(targets: NoteTarget[]) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\[\[[^\]]*/);
    if (!match) return null;
    const query = match.text.slice(2);
    const options = getWikilinkCompletions(query, targets).map((item) => ({
      label: item.label,
      detail: item.alias ? `Alias for ${item.title}` : "Note",
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        const start = from - 2;
        const insert = `[[${item.title}]]`;
        view.dispatch({
          changes: { from: start, to, insert },
          selection: { anchor: start + insert.length },
        });
      },
    }));
    return { from: match.from + 2, options, validFor: /^[^\]]*$/ };
  };
}

function syntaxDecorations(targets: NoteTarget[]) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: { view: EditorView; docChanged: boolean; selectionSet: boolean }) {
        if (update.docChanged || update.selectionSet) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView) {
        const ranges = [];
        const markers = /^(?:#{1,6}\s+|>\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)|\*\*|__|~~|`{1,3}|\*|_/g;
        for (let number = 1; number <= view.state.doc.lines; number += 1) {
          const line = view.state.doc.line(number);
          markers.lastIndex = 0;
          for (const match of line.text.matchAll(markers)) {
            const start = line.from + (match.index ?? 0);
            ranges.push(Decoration.mark({ class: "cm-markdown-marker" }).range(start, start + match[0].length));
          }
          for (const match of line.text.matchAll(/\[[ xX]\]/g)) {
            const start = line.from + (match.index ?? 0);
            ranges.push(Decoration.mark({ class: "cm-task-checkbox" }).range(start, start + match[0].length));
          }
          for (const match of line.text.matchAll(/\[\[([^\]]+)\]\]/g)) {
            const start = line.from + (match.index ?? 0);
            const resolved = resolveWikilink(match[1], targets);
            ranges.push(
              Decoration.mark({
                class: resolved ? "cm-wikilink" : "cm-wikilink cm-wikilink-unresolved",
              }).range(start, start + match[0].length),
            );
          }
        }
        return Decoration.set(ranges, true);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export function MarkdownEditor({
  value,
  targets,
  onChange,
  onOpenNote,
  evidenceRange,
}: MarkdownEditorProps) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const extensions = useMemo(
    () => [
      markdown(),
      evidenceHighlightField,
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "Note content",
        "aria-multiline": "true",
      }),
      highlightActiveLine(),
      autocompletion({ override: [wikilinkSource(targets)] }),
      syntaxDecorations(targets),
      EditorView.domEventHandlers({
        click(event, view) {
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (position === null) return false;
          const line = view.state.doc.lineAt(position);
          const match = [...line.text.matchAll(/\[\[([^\]]+)\]\]/g)].find(
            (item) => position >= line.from + (item.index ?? 0) &&
              position <= line.from + (item.index ?? 0) + item[0].length,
          );
          if (!match) return false;
          const target = resolveWikilink(match[1], targets);
          if (!target) return false;
          onOpenNote(target.id);
          return true;
        },
      }),
    ],
    [onOpenNote, targets],
  );

  useEffect(() => {
    const view = editorView;
    if (!view) return;
    if (!evidenceRange) {
      view.dispatch({ effects: setEvidenceHighlight.of(null) });
      return;
    }
    const from = Math.min(evidenceRange.start, view.state.doc.length);
    const to = Math.min(Math.max(evidenceRange.end, from + 1), view.state.doc.length);
    if (to <= from) return;
    view.dispatch({
      effects: setEvidenceHighlight.of({ from, to }),
      selection: { anchor: from },
      scrollIntoView: true,
    });
  }, [editorView, evidenceRange]);

  return (
    <CodeMirror
      aria-label="Note content"
      basicSetup={{
        foldGutter: false,
        lineNumbers: false,
        highlightActiveLineGutter: false,
      }}
      className="markdown-editor"
      extensions={extensions}
      onCreateEditor={setEditorView}
      onChange={onChange}
      value={value}
    />
  );
}
