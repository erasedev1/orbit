# Orbit

Two-player abstract strategy game on four concentric rotating rings.

- `ORBIT.md` — complete rules, design rationale, and simulation-backed audit.
- `orbit_sim.py` — legal-move generator, random + greedy bots, self-play
  harness used to validate the rules. Run with `python3 orbit_sim.py`.
- `orbit_game.html` — the playable game (self-contained; open directly for
  local two-player on one screen).
- `server.js` — tiny relay server for online play.

## How a game ends

Capturing three enemy moons wins. Beyond that, the **Match** panel beside the
board carries the endings from `ORBIT.md` §3.3:

- **Round limit.** The panel counts rounds against the 80-round limit and the bar
  turns red over the last quarter. At 80 rounds each the game stops and the
  tiebreak decides: more captures, then more pieces on Rings 1–2, otherwise a
  draw. A game can no longer run forever.
- **Threefold repetition.** When the same position — same pieces, same player to
  move, same anti-reversal state — comes up a third time, a **Claim draw** button
  appears. As in chess the draw is *claimable*, not automatic, and either player
  may claim it whether or not it's their turn. The panel warns you at the second
  occurrence.
- **Offer draw** / **Resign.** Resigning asks for confirmation first. Against the
  computer, a draw offer is answered on the spot — it takes the draw only when
  it isn't better off playing on. Online, offers lapse as soon as a move is made,
  and both go through the server so the clock and the opponent stay in sync.

Resignations and draws don't move a piece, so they annotate the final logged
position rather than appending a phantom turn — the review and the text export
handle them as first-class results.

## Game review

**🔍 Review** becomes available once the game ends (win, draw, resignation or
timeout) and replays the finished game with the same search the computer opponent uses — an alpha-beta minimax over full turns, backed by a
transposition table so work is reused across every position it grades — and grades
each move against the best turn available: Best / Good / Inaccuracy / Mistake /
Blunder, plus an evaluation graph you can scrub. Depth 1–3 is selectable and depth 3
is the default; lower is faster, higher is stricter. The review searches a wider set
of candidate moves than the live opponent (grading has no clock to beat): at depth 3
its grades match a full-width search on essentially every move, and the transposition
table still makes it faster than the previous, less accurate engine despite the far
wider search.

**Accuracy.** Each player gets a headline accuracy percentage. A move is scored
on the *win probability* it gave away, not on raw evaluation loss — an 8-point
slip in a knife-edge position costs far more than the same slip in a position
already decided. The per-game number blends a volatility-weighted mean (sharp
phases count for more) with a harmonic mean (so one catastrophe can't be
averaged away by a long quiet tail).

**Finding your mistakes.** The filter in the review header narrows the move list
to **⚠ Mistakes** (all inaccuracies, mistakes and blunders) or **⚠ Mine** (just
yours, when the game knows which seat you played — online or vs. the computer).
The `⚠◀` / `⚠▶` buttons — or Shift+←/→ — hop straight between flagged moves.

**Text export/import.** **⇅ Text** in the review, or **⇩ Import** in the toolbar,
opens a plain-text form of the game you can copy, paste, mail or check into git:

```
ORBIT/1
# Gold wins — 41 moves  (Gold 3 : 1 Cyan)
# accuracy  Gold 84.3%  Cyan 71.9%  (engine depth 2)
# you: Gold
   1. E4.0            E4.4
   2. M4.0-3.0        R2+/2.4-1.2?
   3. R3-             M4.4-4.5??
```

Rings are 1-based (as drawn), cell indices 0-based: `E4.0` enters at ring-4 cell
0, `M3.5-3.6` moves a piece, `R2+` / `R2-` rotates ring 2 clockwise /
counter-clockwise, and `/2.4-1.2` appends a follow-through step to a rotation.
`?!` `?` `??` are annotations from the review and are ignored on import, as are
`#` comments and move numbers — so a game quoted into an email still loads. Every
move is validated against the rules as it is read; an illegal or garbled move is
reported by number rather than silently accepted. Importing opens the game in the
review only; it never disturbs the game on the board.

## Play online

No accounts, no database — rooms live in the server's memory and disappear
when everyone leaves. One person runs the server; players share a 4-letter
room code.

```sh
npm install      # one-time: pulls in `ws`
npm start        # starts the server on http://localhost:8080
```

Then open the printed address. Pick any username, **Create a room**, and send
the code to a friend so they can **Join**. Two players get the seats (Gold /
Cyan).

## Spectating

Type the room code and press **👁 Watch** — no name, no seat, nothing to set up.
Watching never takes a seat, so an open seat stays open for a player who wants
it, and watchers can't move, resign, offer a draw or start a new game. The room
card lists everyone watching, and a watcher who reloads the page drops straight
back into the same room.

Beside the board, a watcher gets a live **evaluation bar**: the position graded
by the same alpha–beta search the game review uses, re-run after every move and
always stated from Gold's point of view. The **Engine** panel adds the
evaluation in captured-moon units (`Ana +0.40`), the turn the engine would play,
and a graph of how the advantage has moved over the game. Search depth is
selectable — 1 (fast) to 3 (deep), default 2 — and is remembered on this device.

The search runs entirely in the watcher's browser on a position the server has
already sent; nothing is broadcast and the players see none of it. It is
*deliberately* not offered to the two players — which also means anyone who
watches their own game from a second tab is reading an engine, so treat that the
way you'd treat it in any other game.

If a room is already full, joining it puts you in as a watcher too.

**Clocks.** Each player has a chess clock (10 minutes by default). It ticks on
your turn once both players are present; running out of time loses the game.
The server keeps the authoritative time, so it can't be gamed by a laggy or
fiddled client.

**Disconnects.** If a player drops, their seat is held and their clock pauses
for a **60-second grace period** — reload the page (or fix your connection) to
drop straight back into the same game. Don't make it back in time and you
**forfeit**. The reconnect uses a one-time token kept in the tab's session
storage; there's still no account and nothing written to disk. A watcher has no
seat to lose, so a dropped watcher just keeps retrying for five minutes. A
drop-and-return no longer restarts the move log, so Review and the spectator's
evaluation graph survive it.

- **Same network:** share `http://<your-LAN-ip>:8080`.
- **Over the internet:** expose the port with a tunnel, e.g.
  `npx localtunnel --port 8080`, and share that URL.
- Change the port with `PORT=3000 npm start`.

The same file still works offline: open `orbit_game.html` directly (or click
*"play locally on this screen"* in the lobby) for hot-seat two-player.
