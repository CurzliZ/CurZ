# CurZ: 2-minute demo

## Before the demo

Do this once; it is preparation, not part of the two-minute walkthrough:

1. Start the app with `npm run dev`, then Settings → **Load sample vault**.
   The sample contains 43 original, dated notes and opens in a dedicated folder.
2. In Settings, enable **Demo Mode (MockProvider)** and save. This makes the
   AI-dependent steps deterministic; all mock responses are labeled as mock.
3. In Review, choose **Find suggestions** and wait for the background task to
   finish. Ensure the Relations and Tensions tabs have items to review.
4. Open dated sample notes and use Lens → Evidence → **Extract claims** to
   prepare verified claims for Evolution.
5. Run `npm run eval` with `CURZ_EVAL_PROVIDER=mock` so Trust Report has
   a fresh, clearly labeled result. These results measure the mock fixture, not
   real-model quality.

If running on an already prepared sample vault, the first step below can use
**Open sample vault**. On a fresh vault, relationship and claim tasks may need
to finish before those screens have prepared content.

## Timed walkthrough

| Time | Show | Say / do |
|---|---|---|
| 0:00–0:15 | Sample vault | Settings → **Open sample vault**. Point out that the sample is separate from the user's existing vault. |
| 0:15–0:35 | Brain + Replay | Open Brain, start Replay, and scrub/play through the dated nodes. Select a node to focus its neighborhood; click it again/double-click to open its note. |
| 0:35–0:55 | Review a relation | Open Review → Relations. Show the two verified source quotes, then accept one suggestion. Explain that AI suggestions do not enter the graph until a person accepts them. |
| 0:55–1:10 | Review a tension | Open Review → Tensions. Read both statements and the “What seems to conflict” framing; emphasize that a tension is not an automatic contradiction verdict. |
| 1:10–1:30 | Ask | Open Ask from the Lens or command palette. Ask a question answered by the sample notes, select a citation, and open the note at its verified quote. |
| 1:30–1:48 | Evolution | Open Lens → Timeline. Show dated verified claims and the **AI interpretation** label on any generated change summary. |
| 1:48–2:00 | Trust Report | Open Trust Report. Show the provider, run date, and measured fractions; call out the MockProvider banner so results are not mistaken for real-model performance. |

## Eight screenshot/GIF moments

1. Sample vault open in Settings, with the dedicated sample folder identified.
2. Home with quick capture, recent notes, and “Why now?” reason visible.
3. Brain graph with a selected node and its focused neighborhood.
4. Replay scrubber with its current date and play/speed controls.
5. Review relation showing verified evidence and the Accept action.
6. Tension review with both notes side by side.
7. Ask answer with a verified citation opened at its source quote.
8. Evolution timeline beside a Trust Report with provider/model and measured values.
