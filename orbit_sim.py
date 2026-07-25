"""Orbit — self-play harness for rule validation.

Board: 4 concentric rings of 6/12/18/24 cells. Cells hold 0 (empty), 1, 2.
Spokes: the 6 angles (multiples of 60 deg) where all four rings share a cell.
Capture (sandwich + pin), resolved after every action by the mover P:
  - enemy on ring 2 or 3 with P's pieces on both radially adjacent rings
    of the same spoke (sandwich), or
  - enemy on ring 1 or 4 with P's pieces on rings 2 and 3 of the same
    spoke (pin against the core / rim).

Variants:
  V0 "plain":    a turn is one action (enter / step / rotate).
  V1 "momentum": a rotate turn may be followed by one free step of one of
                 the rotating player's pieces on the rotated ring.

Anti-reversal: you may not rotate the same ring the opponent just rotated,
in the opposite direction.
"""

import random
from collections import defaultdict

N = [6, 12, 18, 24]
GATES = {1: (0, 12), 2: (4, 16)}   # ring-4 indices, all on major spokes
WIN_CAPTURES = 3
MAX_PLIES = 400


def spoke_cell(r, s):
    return s * (N[r] // 6)


class State:
    __slots__ = ("rings", "reserve", "taken", "last_rot")

    def __init__(self):
        self.rings = [[0] * n for n in N]
        self.reserve = [8, 8]          # index p-1
        self.taken = [0, 0]            # captures made by p
        self.last_rot = None           # (ring, dir) of previous turn's rotation

    def clone(self):
        st = State.__new__(State)
        st.rings = [r[:] for r in self.rings]
        st.reserve = self.reserve[:]
        st.taken = self.taken[:]
        st.last_rot = self.last_rot
        return st


def rotate(rings, r, d):
    if d == 1:
        rings[r] = [rings[r][-1]] + rings[r][:-1]
    else:
        rings[r] = rings[r][1:] + [rings[r][0]]


def resolve_captures(st, p):
    """Remove enemy pieces sandwiched or pinned by p. Returns number captured."""
    o = 3 - p
    n = 0
    for s in range(6):
        idx = [spoke_cell(r, s) for r in range(4)]
        c = [st.rings[r][idx[r]] for r in range(4)]

        def kill(r):
            nonlocal n
            st.rings[r][idx[r]] = 0
            st.taken[p - 1] += 1
            c[r] = 0
            n += 1

        if c[1] == o and c[0] == p and c[2] == p:
            kill(1)                            # sandwich on ring 2
        if c[2] == o and c[1] == p and c[3] == p:
            kill(2)                            # sandwich on ring 3
        if c[0] == o and c[1] == p and c[2] == p:
            kill(0)                            # pin against the core
        if c[3] == o and c[2] == p and c[1] == p:
            kill(3)                            # pin against the rim
    return n


def piece_steps(st, p, r, i):
    """Legal step destinations for piece at (r, i)."""
    out = []
    n = N[r]
    for j in ((i + 1) % n, (i - 1) % n):
        if st.rings[r][j] == 0:
            out.append((r, j))
    if i % (n // 6) == 0:                      # on a major spoke: radial moves
        s = i // (n // 6)
        for r2 in (r - 1, r + 1):
            if 0 <= r2 <= 3 and st.rings[r2][spoke_cell(r2, s)] == 0:
                out.append((r2, spoke_cell(r2, s)))
    return out


def legal_moves(st, p, variant):
    moves = []
    if st.reserve[p - 1] > 0:
        for g in GATES[p]:
            if st.rings[3][g] == 0:
                moves.append(("enter", g))
    for r in range(4):
        for i in range(N[r]):
            if st.rings[r][i] == p:
                for dest in piece_steps(st, p, r, i):
                    moves.append(("step", (r, i), dest))
    for r in range(4):
        for d in (1, -1):
            if st.last_rot == (r, -d):
                continue                       # anti-reversal
            if variant == 0:
                moves.append(("rot", r, d, None))
            else:
                # enumerate optional follow-through steps on the rotated ring
                tmp = st.clone()
                rotate(tmp.rings, r, d)
                resolve_captures(tmp, p)
                moves.append(("rot", r, d, None))
                for i in range(N[r]):
                    if tmp.rings[r][i] == p:
                        for dest in piece_steps(tmp, p, r, i):
                            moves.append(("rot", r, d, ((r, i), dest)))
    return moves


def apply_move(st, p, move):
    kind = move[0]
    if kind == "enter":
        st.rings[3][move[1]] = p
        st.reserve[p - 1] -= 1
        st.last_rot = None
    elif kind == "step":
        (r, i), (r2, j) = move[1], move[2]
        st.rings[r][i] = 0
        st.rings[r2][j] = p
        st.last_rot = None
    else:
        _, r, d, follow = move
        rotate(st.rings, r, d)
        resolve_captures(st, p)
        if follow is not None:
            (fr, fi), (r2, j) = follow
            st.rings[fr][fi] = 0
            st.rings[r2][j] = p
        st.last_rot = (r, d)
    resolve_captures(st, p)


def alive(st, p):
    return st.reserve[p - 1] + sum(row.count(p) for row in st.rings)


# (victim ring, two flanker rings) for each capture pattern on a spoke.
CAPTURE_PATTERNS = ((1, 0, 2), (2, 1, 3), (0, 1, 2), (3, 2, 1))


def threat_terms(st, s, atk, vic):
    """Score, from atk's view, the capture potential on spoke s against vic.
    +full if atk already traps a vic piece, +partial if one flanker + victim
    present (one move from a capture)."""
    idx = [spoke_cell(r, s) for r in range(4)]
    val = [st.rings[r][idx[r]] for r in range(4)]
    sc = 0.0
    for v, f1, f2 in CAPTURE_PATTERNS:
        if val[v] != vic:
            continue
        flank = (val[f1] == atk) + (val[f2] == atk)
        if flank == 2:
            sc += 40          # victim is in a live trap
        elif flank == 1:
            sc += 6           # half-built trap, one move from closing
    return sc


def evaluate(st, p):
    o = 3 - p
    score = 100.0 * (alive(st, p) - alive(st, o))
    for s in range(6):
        score += threat_terms(st, s, p, o)     # my traps on their pieces
        score -= threat_terms(st, s, o, p)     # their traps on mine
    for r in range(4):
        w = (2, 1, 0.5, 0)[r]    # mild centralization bonus
        score += w * st.rings[r].count(p)
        score -= w * st.rings[r].count(o)
    return score


def random_bot(st, p, variant):
    return random.choice(legal_moves(st, p, variant))


def greedy_bot(st, p, variant, eps=0.05):
    moves = legal_moves(st, p, variant)
    if random.random() < eps:
        return random.choice(moves)
    best, best_score = None, None
    for m in moves:
        tmp = st.clone()
        apply_move(tmp, p, m)
        s = evaluate(tmp, p) + random.random() * 0.1
        if best_score is None or s > best_score:
            best, best_score = m, s
    return best


WIN_SCORE = 1e6


def _negamax(st, p, depth, alpha, beta, variant):
    o = 3 - p
    if st.taken[p - 1] >= WIN_CAPTURES:
        return WIN_SCORE
    if st.taken[o - 1] >= WIN_CAPTURES:
        return -WIN_SCORE
    if depth == 0:
        return evaluate(st, p)
    moves = legal_moves(st, p, variant)
    # move ordering: try each move's static value first, keeps a-b tight
    scored = []
    for m in moves:
        tmp = st.clone()
        apply_move(tmp, p, m)
        scored.append((evaluate(tmp, p), m, tmp))
    scored.sort(key=lambda x: -x[0])
    best = -WIN_SCORE * 2
    for _, m, tmp in scored[:MINIMAX_WIDTH]:
        val = -_negamax(tmp, o, depth - 1, -beta, -alpha, variant)
        if val > best:
            best = val
        if best > alpha:
            alpha = best
        if alpha >= beta:
            break
    return best


MINIMAX_DEPTH = 3
MINIMAX_WIDTH = 12      # beam over top-N static moves to keep depth-3 tractable


def minimax_bot(st, p, variant):
    moves = legal_moves(st, p, variant)
    scored = []
    for m in moves:
        tmp = st.clone()
        apply_move(tmp, p, m)
        scored.append((evaluate(tmp, p), m, tmp))
    scored.sort(key=lambda x: -x[0])
    best_m, best_v = None, None
    alpha = -WIN_SCORE * 2
    o = 3 - p
    for _, m, tmp in scored[:MINIMAX_WIDTH]:
        v = -_negamax(tmp, o, MINIMAX_DEPTH - 1, -WIN_SCORE * 2, -alpha, variant)
        v += random.random() * 0.01
        if best_v is None or v > best_v:
            best_m, best_v = m, v
        if v > alpha:
            alpha = v
    return best_m


def play(bot1, bot2, variant):
    st = State()
    stats = {"plies": 0, "rot": [0, 0], "moves": [0, 0], "caps": 0}
    p = 1
    for _ in range(MAX_PLIES):
        bot = bot1 if p == 1 else bot2
        m = bot(st, p, variant)
        before = st.taken[p - 1]
        apply_move(st, p, m)
        stats["caps"] += st.taken[p - 1] - before
        stats["moves"][p - 1] += 1
        if m[0] == "rot":
            stats["rot"][p - 1] += 1
        stats["plies"] += 1
        if st.taken[p - 1] >= WIN_CAPTURES:
            stats["winner"] = p
            return stats
        p = 3 - p
    stats["winner"] = 0
    return stats


def run(label, bot1, bot2, variant, games):
    agg = defaultdict(float)
    wins = [0, 0, 0]
    rot_share_winner = []
    for _ in range(games):
        s = play(bot1, bot2, variant)
        wins[s["winner"]] += 1
        agg["plies"] += s["plies"]
        agg["caps"] += s["caps"]
        w = s["winner"]
        if w:
            rot_share_winner.append(s["rot"][w - 1] / max(1, s["moves"][w - 1]))
    g = games
    decisive = g - wins[0]
    print(f"{label:34s} plies={agg['plies']/g:5.1f}  caps/game={agg['caps']/g:4.2f}  "
          f"P1win={wins[1]/max(1,decisive)*100:4.1f}% (of decisive)  draws={wins[0]/g*100:4.1f}%  "
          f"winner-rot%={100*sum(rot_share_winner)/max(1,len(rot_share_winner)):4.1f}")


if __name__ == "__main__":
    random.seed(9)
    for variant, vname in ((0, "V0 plain"), (1, "V1 momentum")):
        print(f"--- {vname} ---")
        run(f"random  vs random  ({vname})", random_bot, random_bot, variant, 1000)
        run(f"greedy  vs greedy  ({vname})", greedy_bot, greedy_bot, variant, 200)
        run(f"greedy  vs random  ({vname})", greedy_bot, random_bot, variant, 200)
