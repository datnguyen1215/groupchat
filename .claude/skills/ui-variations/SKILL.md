---
name: ui-variations
description: Mock up UI/UX design variations as a static HTML page, serve it on localhost, and open it in the browser. Use when the user asks to see design options, variations, mockups, or "a few UI/UX designs" for a feature before it is built — e.g. a delete flow, a context menu, an empty state, a dialog.
---

# UI variations

Produce one HTML page showing the **current UI** followed by **3–5 recommended variations**. Serve it. Open it. No production code is touched.

## Steps

1. **Find the real component.** Locate the Svelte component the request is about. Read it. The "Current" panel must match what is actually on screen — same spacing, same wording, same missing pieces.
2. **Read the tokens.** `src/routes/layout.css` holds the `@theme` block. Copy those hex values into the mockup's `:root`. Never invent colors.
3. **Write one self-contained file** to `~/tmp/groupchat-<task>-mockup/index.html`. Inline CSS, no build step, no CDN.
4. **Serve and open** on port **10204**:
   ```bash
   cd ~/tmp/groupchat-<task>-mockup && nohup python3 -m http.server 10204 >/dev/null 2>&1 &
   xdg-open http://localhost:10204/
   ```
   Port busy? Take the next free port at or above 10204.
5. **Report** the URL and a one-line summary per option. Nothing else.

## Page structure

- `<h1>` = the feature. One-line subtitle.
- Section 1: tag `Current`, then the replica.
- Sections 2..n: tag `Option A`, `Option B`, … Mark exactly one `Option X — recommended`.
- Each section: a short `note` on the tradeoff, the frame(s), and a `caption` under each frame.
- Multi-step flows get one frame per step, side by side.

## Rules

- Real tokens only. Pull them from `layout.css`.
- Replicate the app chrome around the change — sidebar, main pane — so options are judged in context.
- Every option must be a genuinely different approach, not a restyle. Vary the interaction model: overlay vs inline vs optimistic-with-undo vs friction.
- Include one option that is deliberately too heavy and say so in its note. It calibrates the others.
- Static HTML. No JS unless a variation is meaningless without it.
- Notes state the tradeoff, not the praise.

## Reference

`reference/delete-thread.html` is a worked example: dark tokens, sidebar replica, context menu, dialog, inline confirm, undo toast, type-to-confirm. Copy its CSS scaffold (`.frame`, `.rail`, `.menu`, `.dlg`, `.scrim`, `.tag`) rather than rewriting it.
