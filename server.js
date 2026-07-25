"use strict";
// Orbit — tiny in-memory relay server for online play.
// No accounts, no database: rooms live in memory and vanish when empty.
//
// The server is game-rules-agnostic (it only reads .current / .winner from the
// state clients push) EXCEPT that it owns two things that must be trusted:
//   * a chess clock per player (default 10 min) — running out = a loss.
//   * a 60s disconnect grace — don't come back in time and you forfeit.
// Seats are held during the grace window; a reconnect token reclaims them.
// Clients without a seat are watchers: they receive everything and send nothing
// that changes the game (every mutating handler checks the seat first).

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DEFAULT_CLOCK = 10 * 60 * 1000; // 10 minutes per player
const DC_GRACE = 60 * 1000;           // 1 minute to reconnect before forfeit

const FILES = {
  "/": "orbit_game.html",
  "/orbit_game.html": "orbit_game.html",
  "/orbit_rules.html": "orbit_rules.html",
};
const MIME = { ".html": "text/html; charset=utf-8" };

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const file = FILES[url];
  if (!file) { res.writeHead(404); res.end("Not found"); return; }
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() {
  let c;
  do { c = ""; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; }
  while (rooms.has(c));
  return c;
}
function cleanName(n) { return (String(n || "").replace(/[<>]/g, "").trim().slice(0, 20)) || "Player"; }
function newToken() { return crypto.randomBytes(9).toString("base64url"); }
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj) { for (const ws of room.clients) send(ws, obj); }
function stateField(jsonStr, field) { try { return JSON.parse(jsonStr)[field]; } catch { return undefined; } }
// a game can also end in a draw, so "is it over?" is more than a winner check
function isOver(jsonStr) {
  try { const s = JSON.parse(jsonStr); return !!(s.winner || s.draw); } catch { return false; }
}

function roster(room) {
  return [1, 2].map(s => ({
    seat: s,
    name: room.names[s] || null,
    connected: !!room.seats[s],
    reserved: !!room.dcTimer[s],   // held for a disconnected player mid-grace
  }));
}
// everyone in the room who isn't sitting in a seat — watchers, in join order
function watchers(room) {
  const out = [];
  for (const ws of room.clients) if (ws.seat === 0) out.push(ws.name || "Spectator");
  return out;
}
function broadcastPlayers(room) {
  broadcast(room, { t: "players", players: roster(room), watchers: watchers(room) });
}

// ---------- chess clock ----------
function chargeElapsed(room) {
  if (room.active && room.turnStart) {
    room.clockMs[room.active] = Math.max(0, room.clockMs[room.active] - (Date.now() - room.turnStart));
  }
  room.turnStart = 0;
}
function clearClockTimer(room) { if (room.clockTimer) { clearTimeout(room.clockTimer); room.clockTimer = null; } }
function pauseClock(room) { chargeElapsed(room); room.active = 0; clearClockTimer(room); }
function scheduleFlag(room) {
  clearClockTimer(room);
  if (!room.active) return;
  const used = room.turnStart ? (Date.now() - room.turnStart) : 0;
  const remain = Math.max(0, room.clockMs[room.active] - used);
  room.clockTimer = setTimeout(() => onFlag(room, room.active), remain + 20);
}
function bothPresent(room) { return !!room.seats[1] && !!room.seats[2]; }

// Reconcile the clock with the current state: run the mover's clock only while
// both players are present and the game is live.
function updateClockState(room) {
  const cur = stateField(room.state, "current");
  if (isOver(room.state) || !bothPresent(room)) { pauseClock(room); return; }
  if (room.active !== cur) {      // turn changed — charge whoever was running, hand over the clock
    chargeElapsed(room);
    room.active = cur;
    room.turnStart = Date.now();
  } else if (!room.turnStart) {   // resuming after a pause, same player still on move
    room.turnStart = Date.now();
  }
  scheduleFlag(room);
}
function clockInfo(room) {
  const c = { 1: room.clockMs[1], 2: room.clockMs[2] };
  if (room.active && room.turnStart) c[room.active] = Math.max(0, c[room.active] - (Date.now() - room.turnStart));
  return { clock: c, active: room.active };
}
function syncMsg(room, extra) {
  return Object.assign(
    { t: "sync", state: room.state, players: roster(room), watchers: watchers(room),
      lastMover: room.lastMover },
    clockInfo(room), extra || {}
  );
}
function onFlag(room, seat) {
  clearClockTimer(room);
  chargeElapsed(room);
  room.active = 0;
  let st; try { st = JSON.parse(room.state); } catch { return; }
  if (!st.winner && !st.draw) { st.winner = 3 - seat; st.endReason = "time"; room.state = JSON.stringify(st); }
  broadcast(room, syncMsg(room, { reason: "time", loser: seat }));
}

// ---------- disconnect grace ----------
function clearDcTimer(room, seat) { if (room.dcTimer[seat]) { clearTimeout(room.dcTimer[seat]); room.dcTimer[seat] = null; } }
function startDcTimer(room, seat) {
  clearDcTimer(room, seat);
  room.dcTimer[seat] = setTimeout(() => forfeitDisconnect(room, seat), DC_GRACE);
}
function forfeitDisconnect(room, seat) {
  clearDcTimer(room, seat);
  if (room.seats[seat]) return;                 // they made it back in time
  let st; try { st = JSON.parse(room.state); } catch { return; }
  if (!st.winner && !st.draw) { st.winner = 3 - seat; st.endReason = "disconnect"; room.state = JSON.stringify(st); }
  room.names[seat] = null; room.tokens[seat] = null;  // seat is fully open now
  pauseClock(room);
  broadcast(room, syncMsg(room, { reason: "disconnect", loser: seat }));
  broadcastPlayers(room);
}
function clearRoom(room) {
  clearClockTimer(room);
  clearDcTimer(room, 1); clearDcTimer(room, 2);
}

// ---------- connection handling ----------
wss.on("connection", (ws) => {
  ws.room = null; ws.seat = 0; ws.name = "";
  ws.on("message", (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === "create")   return onCreate(ws, m);
    if (m.t === "join")     return onJoin(ws, m);
    if (m.t === "rejoin")   return onRejoin(ws, m);
    if (m.t === "spectate") return onSpectate(ws, m);
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    if (m.t === "move")  return onMove(ws, room, m);
    if (m.t === "undo")  return onUndo(ws, room);
    if (m.t === "reset") return onReset(ws, room, m);
    if (m.t === "resign") return onResign(ws, room);
    if (m.t === "draw")  return onDraw(ws, room, m);
    if (m.t === "claim") return onClaim(ws, room);
  });
  ws.on("close", () => onClose(ws));
});

function onCreate(ws, m) {
  if (typeof m.state !== "string") return;
  const code = makeCode();
  const budget = Number.isFinite(m.clockMs) && m.clockMs > 0 ? m.clockMs : DEFAULT_CLOCK;
  const token = newToken();
  const room = {
    code, state: m.state, history: [], lastMover: 0,
    seats: { 1: ws, 2: null }, names: { 1: cleanName(m.name), 2: null }, tokens: { 1: token, 2: null },
    clients: new Set([ws]),
    clockMs: { 1: budget, 2: budget }, active: 0, turnStart: 0, clockTimer: null,
    dcTimer: { 1: null, 2: null }, drawOffer: 0,
  };
  rooms.set(code, room);
  ws.room = code; ws.seat = 1; ws.name = room.names[1];
  send(ws, { t: "created", code, seat: 1, token });
  send(ws, syncMsg(room));
}

function onJoin(ws, m) {
  const code = String(m.code || "").toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) { send(ws, { t: "error", msg: "No room with that code." }); return; }
  let seat = 0;
  if (!room.seats[1] && !room.dcTimer[1]) seat = 1;       // free and not being held
  else if (!room.seats[2] && !room.dcTimer[2]) seat = 2;
  let token = null;
  if (seat) {
    room.seats[seat] = ws; room.names[seat] = cleanName(m.name);
    token = room.tokens[seat] = newToken();
  }
  ws.room = code; ws.seat = seat; ws.name = seat ? room.names[seat] : cleanName(m.name);
  room.clients.add(ws);
  updateClockState(room);                                 // starts the clock once both seats are filled
  send(ws, { t: "joined", code, seat, token });
  send(ws, syncMsg(room));
  broadcast(room, syncMsg(room));
  broadcastPlayers(room);
}

// Watching is a first-class way into a room: code only, no name needed, and it never
// takes a seat — an open seat stays open for a player who wants it.
function onSpectate(ws, m) {
  const code = String(m.code || "").toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) { send(ws, { t: "error", msg: "No room with that code." }); return; }
  if (ws.room === code && ws.seat === 0 && room.clients.has(ws)) return;   // already watching
  ws.room = code; ws.seat = 0; ws.name = cleanName(m.name || "Spectator");
  room.clients.add(ws);
  send(ws, { t: "joined", code, seat: 0, token: null, watching: true });
  send(ws, syncMsg(room));
  broadcastPlayers(room);
}

function onRejoin(ws, m) {
  const code = String(m.code || "").toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) { send(ws, { t: "error", msg: "That room has closed." }); return; }
  const seat = m.seat;
  if ((seat === 1 || seat === 2) && room.tokens[seat] && room.tokens[seat] === m.token && !room.seats[seat]) {
    clearDcTimer(room, seat);
    room.seats[seat] = ws;
    ws.room = code; ws.seat = seat; ws.name = room.names[seat];
    room.clients.add(ws);
    updateClockState(room);                               // resume the clock
    send(ws, { t: "joined", code, seat, token: room.tokens[seat] });
    send(ws, syncMsg(room));
    broadcast(room, syncMsg(room));
    broadcastPlayers(room);
    return;
  }
  onJoin(ws, m);   // token stale or seat gone — treat as a fresh join / spectate
}

function onMove(ws, room, m) {
  if (ws.seat !== 1 && ws.seat !== 2) return;
  if (typeof m.state !== "string") return;
  if (isOver(room.state)) return;
  if (stateField(room.state, "current") !== ws.seat) { send(ws, syncMsg(room)); return; }
  room.history.push({ state: room.state, prevMover: room.lastMover, clockMs: { ...room.clockMs }, active: room.active, turnStart: room.turnStart });
  if (room.history.length > 120) room.history.shift();
  room.state = m.state;
  room.lastMover = ws.seat;
  room.drawOffer = 0;            // an offer lapses as soon as the position changes
  updateClockState(room);
  broadcast(room, Object.assign(
    { t: "move", anim: m.anim || null, state: room.state, by: ws.seat, lastMover: room.lastMover },
    clockInfo(room)
  ));
}

// ---------- ending the game by agreement, resignation or claim ----------
// These have to pass through the server so both clients (and the clock) learn about
// them; a client can't just stop broadcasting and call it a win.
function finishGame(room, mutate, reason) {
  let st; try { st = JSON.parse(room.state); } catch { return; }
  if (st.winner || st.draw) return;
  mutate(st);
  room.state = JSON.stringify(st);
  room.drawOffer = 0;
  pauseClock(room);
  broadcast(room, syncMsg(room, { reason }));
}
function onResign(ws, room) {
  if (ws.seat !== 1 && ws.seat !== 2) return;
  finishGame(room, st => { st.winner = 3 - ws.seat; st.endReason = "resign"; }, "resign");
}
function onDraw(ws, room, m) {
  if (ws.seat !== 1 && ws.seat !== 2) return;
  if (isOver(room.state)) return;
  if (m.act === "offer") {
    if (room.drawOffer) return;
    room.drawOffer = ws.seat;
    broadcast(room, { t: "draw", act: "offer", from: ws.seat });
  } else if (m.act === "accept") {
    if (!room.drawOffer || room.drawOffer === ws.seat) return;   // can't accept your own
    finishGame(room, st => { st.draw = true; st.endReason = "agreed"; }, "agreed");
  } else if (m.act === "decline") {
    if (!room.drawOffer || room.drawOffer === ws.seat) return;
    room.drawOffer = 0;
    broadcast(room, { t: "draw", act: "decline", by: ws.seat });
  }
}
// Threefold repetition is claimable by either player, on or off turn. The server
// stays rules-agnostic and takes the claim on trust — the same trust it already
// extends to the positions clients push in `move`.
function onClaim(ws, room) {
  if (ws.seat !== 1 && ws.seat !== 2) return;
  finishGame(room, st => { st.draw = true; st.endReason = "repetition"; }, "repetition");
}

function onUndo(ws, room) {
  if (ws.seat !== room.lastMover || room.lastMover === 0 || !room.history.length) return;
  const e = room.history.pop();
  room.state = e.state; room.lastMover = e.prevMover; room.drawOffer = 0;
  room.clockMs = { ...e.clockMs }; room.active = 0; room.turnStart = 0;
  clearClockTimer(room);
  updateClockState(room);
  broadcast(room, syncMsg(room));
}

function onReset(ws, room, m) {
  if (ws.seat !== 1 && ws.seat !== 2) return;
  if (typeof m.state !== "string") return;
  const budget = Number.isFinite(m.clockMs) && m.clockMs > 0 ? m.clockMs : DEFAULT_CLOCK;
  room.state = m.state; room.history = []; room.lastMover = 0; room.drawOffer = 0;
  room.clockMs = { 1: budget, 2: budget }; room.active = 0; room.turnStart = 0;
  clearClockTimer(room);
  updateClockState(room);
  broadcast(room, syncMsg(room));
}

function onClose(ws) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;
  room.clients.delete(ws);
  if ((ws.seat === 1 || ws.seat === 2) && room.seats[ws.seat] === ws) {
    room.seats[ws.seat] = null;
    updateClockState(room);                               // pauses the clock (not both present)
    const won = isOver(room.state);
    if (!won && room.seats[3 - ws.seat]) {
      startDcTimer(room, ws.seat);                        // opponent's still here — start the grace countdown
    } else {
      room.names[ws.seat] = null; room.tokens[ws.seat] = null; // nothing to forfeit — just open the seat
    }
    broadcast(room, syncMsg(room));
    broadcastPlayers(room);
  } else if (ws.seat === 0) {
    broadcastPlayers(room);                               // a watcher left — refresh the count
  }
  if (room.clients.size === 0) { clearRoom(room); rooms.delete(room.code); }
}

server.listen(PORT, () => {
  console.log(`\n  Orbit is live.  Open  http://localhost:${PORT}\n`);
  console.log(`  Same network? Share  http://<your-LAN-ip>:${PORT}`);
  console.log(`  Over the internet? Tunnel it, e.g.  npx localtunnel --port ${PORT}\n`);
});
