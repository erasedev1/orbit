# Orbit — Complete Design & Audit

*Design finalized 2026-07-22. Rules validated by self-play simulation (`orbit_sim.py`).*

---

## 1. Overview

Orbit is a two-player abstract strategy game on four concentric rings. The defining
mechanic is **ring rotation**: a single move that slides every piece on a ring —
yours and your opponent's — one position around the board. You cannot improve your
position on a ring without simultaneously changing theirs, so every rotation is a
trade. Captures happen by trapping an enemy piece radially, along a "spoke" of
aligned cells.

## 2. Components & board geometry

- Four concentric rings: Ring 1 (innermost) has **6** cells, Ring 2 has **12**,
  Ring 3 has **18**, Ring 4 (outermost) has **24**. 60 cells total.
- Each player has **8 pieces** ("moons"), starting off-board in reserve.
- Cell counts are all multiples of 6, so the board has **6 major spokes** — the six
  angles (multiples of 60°) where all four rings share an exactly aligned cell.
  These spokes are marked on the board and are **fixed board features**: rotating a
  ring slides pieces past them; the spokes themselves never move.
- Rings 2 and 4 additionally align with each other at the six "half-spoke" angles
  (odd multiples of 30°). Half-spokes have no rules significance in the final
  design (only 2 cells align there, and captures need 3 aligned cells) — they are
  a visual aid only.
- **Gates**: four Ring-4 cells at major-spoke angles are marked as entry gates.
  Player 1's gates are at 0° and 180°; Player 2's at 60° and 240°. Gates, like
  spokes, are fixed board features and do not move when Ring 4 rotates.

## 3. Rules (final)

### 3.1 Turn structure

Players alternate. On your turn you take exactly **one** of:

1. **Enter** — place a piece from your reserve onto one of your two gates, if that
   cell is empty. (An enemy piece sitting on your gate blockades it; rotate Ring 4
   to clear it.)
2. **Step** — move one of your pieces:
   - one cell clockwise or counterclockwise along its ring, into an empty cell; or
   - one ring inward or outward, **only if the piece is standing on a major
     spoke**, into the aligned empty cell on the adjacent ring. The six spokes are
     the only radial channels — rotating a ring to carry a piece onto a spoke is
     how you open a lane inward.
3. **Rotate** — turn any one ring one position in either direction. Every piece on
   it moves. Rotation is never blocked by pieces. After rotating, you may
   optionally make one **follow-through step** with one of *your* pieces that is
   on the ring you just rotated (normal step rules). This is the "momentum" rule —
   see §4.3 for why it exists.

**Anti-reversal**: you may not rotate the same ring your opponent rotated on the
immediately preceding turn in the opposite direction (no instant undo).

### 3.2 Capture

Captures are checked on the six major spokes only, and are resolved **after each
action of the moving player** (after the rotation and again after the
follow-through step, if any). A trap fires as soon as it is closed, no matter who
closed it. Number the rings 1–4 from the core:

- **Sandwich**: an enemy piece on Ring 2 or Ring 3 is captured if your pieces
  occupy both radially adjacent rings on the same spoke (yours on 1 and 3 traps a
  piece on 2; yours on 2 and 4 traps a piece on 3).
- **Pin**: an enemy piece on Ring 1 or Ring 4 is captured if your pieces occupy
  Rings 2 **and** 3 on the same spoke — pinned against the core or against the
  rim. This closes the "safe haven" loophole (§5.2).

All captures created by an action resolve simultaneously; multiple pieces can fall
to one rotation. Moving or rotating your *own* piece into a trapped position
captures it immediately (credited to the player whose pieces form the flanks) —
there is no safe walk-in.

Captured pieces are removed from the game permanently (they do not return to
reserve).

### 3.3 Winning

- **Win**: capture **3** enemy pieces.
- **Round limit**: if neither player has won after **80 rounds** (80 turns each),
  the player with more captures wins; if tied, the player with more pieces on
  Rings 1 and 2 wins; if still tied, draw.
- **Repetition**: threefold repetition of the full position with the same player
  to move is a draw claimable by either player.

## 4. Design decisions & rationale

### 4.1 Exact alignment, not "nearest angle"

The original sketch defined radial alignment as "nearest angle on other rings."
That is ambiguous: a Ring-4 piece at 30° is equidistant from Ring-3 cells at 20°
and 40°. The final rules use **exact angle equality only**, which yields exactly 6
major spokes. Everything radial — alignment, capture, ring-to-ring movement —
happens on those 6 spokes. This is both unambiguous and strategically rich:
rotation becomes the tool for moving pieces on and off spokes.

### 4.2 Capture: from 3-piece crush to sandwich + pin

The sketch's 3-aligned-pieces capture was play-tested in simulation and is **far
too rare** (§6): even greedy bots managed ~0.6 captures per 400-move game, and
100% of equal-strength games were draws. The final rule needs only **2 trapping
pieces**, which the sketch guessed would be "too easy" — the data says otherwise:
at 2 pieces, equal bots average ~3.4 captures per game and 83% of games are
decisive. The requirement that trapping pieces sit on *radially adjacent rings of
one spoke* keeps setups nontrivial: you still need two pieces at the same angle on
specific rings, usually engineered by rotation.

### 4.3 Rotation stalemate → the momentum rule

The stalemate worry in the sketch is real and was reproduced empirically: under
plain one-action turns, winning greedy bots rotated **0%** of the time in
equal-strength play — the mechanic was decorative, exactly the failure mode
predicted. The fix adopted is **momentum**: a rotation grants an optional free
step of one of your pieces on the rotated ring. This makes rotation
tempo-positive (you get positional churn *plus* a step), and it's thematically
coherent — the piece rides the ring's momentum. After the change, winners rotate
on **~67%** of their turns. The anti-reversal rule prevents degenerate
rotate/counter-rotate wars.

Rejected alternatives: "must rotate every N turns" (feels bureaucratic, and
forced-bad-moves rules are miserable in play); "rotations free, steps cost tempo"
(equivalent to momentum but harder to state).

### 4.4 Ring-1 dominance: a non-problem

The sketch flagged Ring 1 (6 cells, biggest angular sweep per rotation) as a
possible dominant focus. Simulation says otherwise: in strong play only **15%**
of rotations are of Ring 1 — **Ring 2 is the most-rotated ring (42%)**, because
Ring 2 is where sandwich victims sit and where the 1–3 trap closes. The capture
geometry naturally spreads the action across rings, so no special anti-Ring-1
rule was added. (The sketch's proposed fix — require captures to span an outer
ring — is moot under sandwich/pin, which always involves Rings 2–3.)

### 4.5 Entry, gates, and win threshold

Pieces enter over time rather than starting placed: this makes the opening a
real phase (development + gate blockade tactics) and keeps the board readable.
Gates are fixed at major-spoke angles so a freshly entered piece is immediately
on a radial channel. Four gates at 0°/180° vs 60°/240° are equivalent under a 60°
board rotation, so neither player gets a better geometry.

Win at 3 captures (of 8 pieces): 5 was tested and produces mostly draws even
with the easier capture rule's precursor; 3 gives an 83% decisive rate between
equal bots while still requiring a sustained material edge.

## 5. Audit findings

### 5.1 Confirmed from the sketch
- **Rotation stalemate is real**, not hypothetical — reproduced in simulation
  (V0 winners: 0% rotations). Fixed by momentum (§4.3).
- **Branching factor** is roughly as estimated: ~30–45 actions per turn, more
  under momentum (rotation × follow-through combinations).

### 5.2 New problems found and fixed
- **Safe havens**: any capture rule requiring a piece *between* two others makes
  Rings 1 and 4 uncapturable (nothing exists radially inside/outside them). Under
  such rules the dominant strategy is to park pieces on the end rings forever.
  Fixed with the **pin** rule.
- **Capture rarity**: the 3-piece alignment requirement makes captures ~10× too
  rare (§6). Fixed by moving to 2-piece sandwich/pin.
- **Nearest-angle ambiguity**: ties in "nearest aligned cell" between rings with
  15°/20° spacing. Fixed by exact-alignment spokes (§4.1).
- **Rotation ping-pong**: without a restriction, the cheapest reply to any
  rotation is to undo it, especially under momentum where rotation is
  tempo-positive. Fixed with the anti-reversal rule; threefold repetition
  backstops longer cycles.

### 5.3 Remaining risks (tuning knobs, in priority order)
1. **Game length**: equal greedy bots average ~110 rounds, above the 40–80
   target. Weak bots shuffle a lot (greedy-vs-random games resolve in ~65
   rounds), so real players will likely land shorter — but if playtests drag,
   the knobs are the 80-round limit's tiebreak (already guarantees an ending)
   and dropping the round limit to 60.

   **Caveat on every number in §6:** `orbit_sim.py` stops at a 400-ply cap and
   does *not* implement the §3.3 round limit, so the simulated games ran without
   it. `orbit_game.html` now enforces it. At 160 plies the limit sits well below
   the 228-ply greedy–greedy average, so it would cut a majority of those games
   short and resolve them on the tiebreak instead — the draw rates and decisive
   rates below are for a game with no round limit. Re-running the sim with the
   limit in place is the obvious next validation step.
2. **Momentum strength**: ~~rotation may now be *too* good — winners rotate 2 of
   every 3 turns~~ **— resolved by depth-3 testing (§6).** Under 1-ply greedy
   play winners rotate 67% of turns, but under 3-ply alpha-beta search that
   falls to **54%** — deeper players pick rotations more selectively, so
   momentum is a balanced option, not a forced line. Fallback nerf if human
   playtests disagree: restrict follow-through to pieces that ended the
   rotation on a major spoke.
3. **Gate blockade**: camping an enemy gate with a Ring-4 piece costs the
   blockader a piece too, and Ring-4 rotation breaks it, but watch for
   double-blockade openings in playtests.
4. **First-player advantage**: measured at 49.6% — no evidence of one, but bot
   play is weak; re-check with humans and adopt a pie rule if needed.

## 6. Simulation methodology & results

`orbit_sim.py` implements full legal-move generation, three bots (uniform
random; 1-ply greedy over a material + spoke-threat + centralization eval, 5%
noise; depth-3 alpha-beta — see §6.1), and a 400-ply cap. Key runs (~1000 games random/random, 200–300 greedy):

| Ruleset | Matchup | Plies | Caps/game | Draws | P1 win (decisive) | Winner rot-% |
|---|---|---|---|---|---|---|
| Plain turns, 3-piece crush, win@5 | greedy–greedy | 400 | 0.58 | 100% | — | **0%** |
| Momentum, 3-piece crush, win@5 | greedy–greedy | 391 | 2.70 | 92% | 56% | 76% |
| Momentum, 3-piece crush, win@3 | greedy–greedy | 342 | 2.23 | 63% | 47% | 74% |
| Momentum, sandwich, win@3 | greedy–greedy | 271 | 3.20 | 29% | 52% | 73% |
| **FINAL: momentum, sandwich+pin, win@3** | greedy–greedy | 228 | 3.41 | **17%** | **49.6%** | **67%** |
| FINAL | greedy–random | 132 | 2.98 | 7% | 99% | 44% |
| FINAL | random–random | 361 | 2.81 | 53% | 48% | 69% |

Reading of the final row set: the game is decisive between equal players,
balanced between first and second player, won overwhelmingly by the stronger
bot, and the rotation mechanic is load-bearing (winners rotate two-thirds of
their turns; ring rotation share in strong play: R1 15%, R2 42%, R3 22%, R4 21%).

### 6.1 Depth-3 search validation

A depth-3 alpha-beta bot (`minimax_bot`, negamax with a top-12 static-move beam
and a threat-accurate eval, §note below) was added to confirm the rules survive
deeper tactics than 1-ply greedy. FINAL ruleset:

| Matchup | Plies | Caps/game | Draws | P1 win (decisive) | Winner rot-% | Ring rot-share 1–4 |
|---|---|---|---|---|---|---|
| minimax3 vs greedy1 | 159 | 2.97 | 10% | 100% | 55% | 36 / 18 / 34 / 13 |
| greedy1 vs minimax3 | 170 | 3.02 | 12% | 0% (i.e. minimax 100%) | 58% | 36 / 17 / 35 / 12 |
| **minimax3 vs minimax3** | 211 | 3.67 | 15% | **55.9%** | **54%** | 25 / 43 / 25 / 7 |

Three things the depth-3 data establishes:

1. **The game rewards lookahead.** Depth-3 beats 1-ply greedy in **100%** of
   decisive games from either seat — captures are engineered several moves
   ahead by rotation, not stumbled into. A game where the deeper searcher didn't
   reliably win would signal the outcome is mostly noise; this isn't that.
2. **Momentum is balanced, not degenerate.** The §5.3 worry that momentum makes
   rotation compulsory is disproved: stronger (depth-3) players rotate *less*
   than greedy (54% vs 67%), choosing rotations selectively. No nerf needed for
   now.
3. **Balance holds under stronger play.** Equal depth-3 bots: first-player win
   rate **55.9%** (under the 58% target), **85% decisive**. Ring 2 remains the
   focus of rotation (43%); Ring 1 usage rises with search depth (15%→25%) but
   never dominates — confirming §4.4.

*Eval note:* adding the depth-3 bot surfaced a stale-eval bug — the original
`evaluate` still scored the *old* 3-piece "crush" threat (`opp==3 and mine==1`),
which no longer corresponds to a capture under sandwich/pin rules. It was
replaced with `threat_terms`, which scores actual sandwich/pin traps and
half-built traps. This improved greedy play too (fewer walk-into-capture
blunders) and is reflected in all FINAL numbers above.

Next validation step: human playtests for game length (§5.3 #1) and momentum
strength (§5.3 #2) — the two remaining knobs bots can't settle.
