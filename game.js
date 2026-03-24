// ============================================================
//  ChorPolice Game — GAME LOGIC
//  Uses Firebase Realtime Database for cross-device sync.
//  ► Replace firebaseConfig below with your own Firebase config.
// ============================================================

// ---------- FIREBASE CONFIG ----------
// 1. Go to https://console.firebase.google.com
// 2. Create a project → Add Web App → copy the config object here
// 3. Enable Realtime Database (test mode is fine for private use)
const firebaseConfig = {
  apiKey: "AIzaSyDEMO_REPLACE_WITH_YOUR_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://chorpolice-online-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:abc123"
};
// -------------------------------------

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── ROLE DEFINITIONS ──────────────────────────────────────────
const ROLE_DATA = {
  Daroga:    { icon: "🚔", value: 1000, color: "var(--daroga)"    },
  Police:    { icon: "👮", value: 800,  color: "var(--police)"    },
  Habildar:  { icon: "🪖", value: 700,  color: "var(--habildar)"  },
  Dakat:     { icon: "🔫", value: 600,  color: "var(--dakat)"     },
  Pocketmar: { icon: "🕵️", value: 500,  color: "var(--pocketmar)" },
  Chor:      { icon: "🏃", value: 400,  color: "var(--chor)"      },
};

function getRolesForCount(n) {
  if (n === 4) return ["Daroga", "Police", "Dakat", "Chor"];
  if (n === 5) return ["Daroga", "Police", "Dakat", "Pocketmar", "Chor"];
  return ["Daroga", "Police", "Habildar", "Dakat", "Pocketmar", "Chor"];
}

// ── ROOM CODE GENERATOR ───────────────────────────────────────
const WORDS  = ["WOLF","CHOR","RAJA","HAWK","IRON","DUSK","BOLT","ZERO","PAWN","ROOK","KING","DART","ECHO","FURY","GHOST"];
const DIGITS = () => String(Math.floor(10 + Math.random() * 90));
function generateRoomCode() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return w + DIGITS();
}

// ── STATE ──────────────────────────────────────────────────────
let myName      = "";
let roomId      = "";
let playerCount = 5;
let gameRef     = null;
let gameState   = null;

// ── SCREEN HELPERS ────────────────────────────────────────────
const screens = {
  landing: document.getElementById("landing-screen"),
  create:  document.getElementById("create-screen"),
  join:    document.getElementById("join-screen"),
  game:    document.getElementById("game-screen"),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ── LANDING SCREEN ─────────────────────────────────────────────
document.getElementById("go-create").addEventListener("click", () => {
  generateAndShowCode();
  showScreen("create");
});
document.getElementById("go-join").addEventListener("click", () => showScreen("join"));

// ── CREATE SCREEN ──────────────────────────────────────────────
document.getElementById("back-from-create").addEventListener("click", () => showScreen("landing"));

// Player count selector
document.querySelectorAll(".count-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".count-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    playerCount = parseInt(btn.dataset.count);
  });
});

// Auto-generate room code on load
function generateAndShowCode() {
  const code = generateRoomCode();
  document.getElementById("room-preview-code").textContent = code;
}

document.getElementById("refresh-code").addEventListener("click", generateAndShowCode);

document.getElementById("create-btn").addEventListener("click", () => {
  const name = document.getElementById("create-name-input").value.trim();
  const code = document.getElementById("room-preview-code").textContent.trim();

  if (!name)        { alert("Please enter your name!"); return; }
  if (!code || code === "——") { generateAndShowCode(); return; }

  myName  = name;
  roomId  = code;
  createRoom();
});

function createRoom() {
  gameRef = db.ref("rooms/" + roomId);
  const roles = getRolesForCount(playerCount);
  const initState = {
    playerCount: playerCount,
    roles: roles,
    assignment: null,
    shuffled: false,
    createdAt: Date.now(),
    players: {
      [myName]: { joined: true, selection: null, shuffleVote: false, reshuffleVote: false, isHost: true }
    }
  };
  gameRef.set(initState).then(() => {
    startListening();
    showGameScreen();
  });
}

// ── JOIN SCREEN ────────────────────────────────────────────────
document.getElementById("back-from-join").addEventListener("click", () => showScreen("landing"));

// Auto-uppercase room code input
document.getElementById("join-room-input").addEventListener("input", function() {
  this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

document.getElementById("join-btn").addEventListener("click", () => {
  const code = document.getElementById("join-room-input").value.trim().toUpperCase();
  const name = document.getElementById("join-name-input").value.trim();
  const errEl = document.getElementById("join-error");
  errEl.textContent = "";

  if (!code) { errEl.textContent = "Enter a room code!"; return; }
  if (!name) { errEl.textContent = "Enter your name!"; return; }

  myName = name;
  roomId = code;
  joinExistingRoom(errEl);
});

function joinExistingRoom(errEl) {
  const ref = db.ref("rooms/" + roomId);
  ref.once("value", snap => {
    const existing = snap.val();
    if (!existing) {
      errEl.textContent = "Room not found. Check the code and try again.";
      return;
    }
    gameRef = ref;
    const players = existing.players || {};
    if (!players[myName]) {
      gameRef.child("players/" + myName).set({
        joined: true, selection: null, shuffleVote: false, reshuffleVote: false, isHost: false
      });
    }
    // Sync player count from room
    if (existing.playerCount) playerCount = existing.playerCount;
    startListening();
    showGameScreen();
  });
}

// ── GAME SCREEN INIT ──────────────────────────────────────────
function showGameScreen() {
  document.getElementById("room-display").textContent   = roomId;
  document.getElementById("player-display").textContent = myName;
  showScreen("game");
}

// ── REALTIME LISTENER ─────────────────────────────────────────
function startListening() {
  gameRef.on("value", snap => {
    gameState = snap.val();
    if (!gameState) return;
    renderGame();
  });
}

// ── RENDER ────────────────────────────────────────────────────
function renderGame() {
  renderPlayers();
  renderBoxes();
  renderActions();
  renderStatus();
}

function renderPlayers() {
  const list    = document.getElementById("players-list");
  const countEl = document.getElementById("player-count-display");
  list.innerHTML = "";
  const players  = gameState.players || {};
  const names    = Object.keys(players);
  countEl.textContent = `(${names.length})`;

  names.forEach(name => {
    const p    = players[name];
    const chip = document.createElement("div");
    chip.className = "player-chip";
    if (name === myName) chip.classList.add("you");
    if (p.selection !== null && p.selection !== undefined) chip.classList.add("selected");
    else if (p.shuffleVote) chip.classList.add("ready-shuffle");
    chip.textContent = name + (name === myName ? " ★" : "") + (p.isHost && name !== myName ? " 👑" : "");
    list.appendChild(chip);
  });
}

function renderBoxes() {
  const container  = document.getElementById("boxes-container");
  container.innerHTML = "";

  const players    = gameState.players || {};
  const myData     = players[myName] || {};
  const assignment = gameState.assignment;
  const roles      = gameState.roles || getRolesForCount(playerCount);
  const count      = roles.length;

  // Who took which box
  const takenBy = {};
  Object.keys(players).forEach(name => {
    const sel = players[name].selection;
    if (sel !== null && sel !== undefined) takenBy[sel] = name;
  });

  for (let i = 0; i < count; i++) {
    const box = document.createElement("div");
    box.className = "role-box";
    box.style.animationDelay = (i * 0.07) + "s";

    const isMySelection  = myData.selection === i;
    const takenByOther   = takenBy[i] && takenBy[i] !== myName;
    const iHaveOther     = myData.selection !== null && myData.selection !== undefined && !isMySelection;

    if (assignment) {
      const roleName = assignment[i];
      const rd       = ROLE_DATA[roleName];

      if (isMySelection) {
        // MY box — show full role, icon, value
        box.dataset.role = roleName;
        box.innerHTML = `
          <div class="box-number">BOX ${i + 1}</div>
          <div class="box-icon">${rd.icon}</div>
          <div class="box-role">${roleName}</div>
          <div class="box-value">৳${rd.value}</div>
          <div class="box-taken-by">[ YOU ]</div>
          <div class="box-corner"></div>
        `;
        box.classList.add("selected-by-me");

      } else if (takenByOther) {
        // Taken by someone else — blank, just show their name
        box.innerHTML = `
          <div class="box-number">BOX ${i + 1}</div>
          <div class="box-icon" style="opacity:0.2">🔒</div>
          <div class="box-role" style="color:var(--muted)">TAKEN</div>
          <div class="box-taken-by">[ ${takenBy[i]} ]</div>
          <div class="box-corner"></div>
        `;
        box.classList.add("taken");

      } else if (iHaveOther) {
        // I already picked a different box — lock these blank
        box.innerHTML = `
          <div class="box-number">BOX ${i + 1}</div>
          <div class="box-corner"></div>
        `;
        box.classList.add("disabled");

      } else {
        // Available to pick — blank, no role shown
        box.innerHTML = `
          <div class="box-number">BOX ${i + 1}</div>
          <div class="box-corner"></div>
        `;
        box.addEventListener("click", () => selectBox(i, roleName));
      }

    } else {
      // Not shuffled yet — blank locked boxes
      box.innerHTML = `
        <div class="box-number">BOX ${i + 1}</div>
        <div class="box-corner"></div>
      `;
      box.classList.add("disabled");
    }

    container.appendChild(box);
  }
}

function renderActions() {
  const shuffleBtn   = document.getElementById("shuffle-btn");
  const reshuffleBtn = document.getElementById("reshuffle-btn");
  const voteTracker  = document.getElementById("shuffle-votes");
  const players      = gameState.players || {};
  const myData       = players[myName] || {};

  if (!gameState.shuffled) {
    shuffleBtn.disabled = false;
    const voted      = !!myData.shuffleVote;
    const totalVotes = Object.values(players).filter(p => p.shuffleVote).length;
    const total      = Object.keys(players).length;
    shuffleBtn.innerHTML = voted
      ? `<span class="btn-icon">✓</span> READY!`
      : `<span class="btn-icon">⟳</span> READY TO SHUFFLE`;
    shuffleBtn.classList.toggle("voted", voted);
    voteTracker.textContent = `SHUFFLE VOTES: ${totalVotes} / ${total}`;
  } else {
    shuffleBtn.disabled = true;
    shuffleBtn.innerHTML = `<span class="btn-icon">✓</span> SHUFFLED`;
    shuffleBtn.classList.remove("voted");
  }

  if (gameState.shuffled) {
    reshuffleBtn.disabled = false;
    const voted      = !!myData.reshuffleVote;
    const totalVotes = Object.values(players).filter(p => p.reshuffleVote).length;
    const total      = Object.keys(players).length;
    reshuffleBtn.innerHTML = voted
      ? `<span class="btn-icon">✓</span> RESHUFFLE REQUESTED`
      : `<span class="btn-icon">↺</span> REQUEST RESHUFFLE`;
    reshuffleBtn.classList.toggle("voted", voted);
    voteTracker.textContent = `RESHUFFLE VOTES: ${totalVotes} / ${total}`;
  } else {
    reshuffleBtn.disabled = true;
    reshuffleBtn.classList.remove("voted");
    if (!gameState.shuffled) voteTracker.textContent = "";
  }
}

function renderStatus() {
  const players = gameState.players || {};
  const total   = Object.keys(players).length;
  const msgEl   = document.getElementById("status-msg");

  if (!gameState.shuffled) {
    const votes = Object.values(players).filter(p => p.shuffleVote).length;
    msgEl.textContent = votes === 0
      ? `Tap READY TO SHUFFLE when everyone's in`
      : `Waiting for shuffle… ${votes}/${total} ready`;
  } else {
    const selected = Object.values(players).filter(p => p.selection !== null && p.selection !== undefined).length;
    msgEl.textContent = selected < total
      ? `Pick your box! ${selected}/${total} selected`
      : `All players have chosen! 🎉`;
  }
}

// ── SHUFFLE ───────────────────────────────────────────────────
document.getElementById("shuffle-btn").addEventListener("click", () => {
  const players = gameState.players || {};
  const myData  = players[myName] || {};
  if (myData.shuffleVote) return;
  gameRef.update({ [`players/${myName}/shuffleVote`]: true }).then(checkAndShuffle);
});

function checkAndShuffle() {
  gameRef.once("value", snap => {
    const state = snap.val();
    if (!state || state.shuffled) return;
    const players = state.players || {};
    const total   = Object.keys(players).length;
    const votes   = Object.values(players).filter(p => p.shuffleVote).length;
    if (votes >= total) doShuffle(state);
  });
}

function doShuffle(state) {
  const roles    = state.roles || getRolesForCount(playerCount);
  const shuffled = [...roles].sort(() => Math.random() - 0.5);
  const assignment = {};
  shuffled.forEach((role, i) => { assignment[i] = role; });

  const updates = { assignment, shuffled: true };
  Object.keys(state.players || {}).forEach(name => {
    updates[`players/${name}/shuffleVote`]    = false;
    updates[`players/${name}/reshuffleVote`]  = false;
  });
  gameRef.update(updates);
}

// ── RESHUFFLE ─────────────────────────────────────────────────
document.getElementById("reshuffle-btn").addEventListener("click", () => {
  const players = gameState.players || {};
  const myData  = players[myName] || {};
  if (myData.reshuffleVote) return;
  gameRef.update({ [`players/${myName}/reshuffleVote`]: true }).then(checkAndReshuffle);
});

function checkAndReshuffle() {
  gameRef.once("value", snap => {
    const state = snap.val();
    if (!state || !state.shuffled) return;
    const players = state.players || {};
    const total   = Object.keys(players).length;
    const votes   = Object.values(players).filter(p => p.reshuffleVote).length;
    if (votes >= total) doReshuffle(state);
  });
}

function doReshuffle(state) {
  const updates = { assignment: null, shuffled: false };
  Object.keys(state.players || {}).forEach(name => {
    updates[`players/${name}/selection`]      = null;
    updates[`players/${name}/shuffleVote`]    = false;
    updates[`players/${name}/reshuffleVote`]  = false;
  });
  gameRef.update(updates);
}

// ── SELECT BOX ────────────────────────────────────────────────
function selectBox(boxIndex, roleName) {
  const players = gameState.players || {};
  const myData  = players[myName] || {};
  if (myData.selection !== null && myData.selection !== undefined) return;

  const takenBy = {};
  Object.keys(players).forEach(name => {
    const sel = players[name].selection;
    if (sel !== null && sel !== undefined) takenBy[sel] = name;
  });
  if (takenBy[boxIndex]) return;

  gameRef.child(`players/${myName}/selection`).set(boxIndex).then(() => {
    showReveal(boxIndex, roleName);
  });
}

// ── REVEAL MODAL ──────────────────────────────────────────────
function showReveal(boxIndex, roleName) {
  const rd      = ROLE_DATA[roleName];
  const overlay = document.createElement("div");
  overlay.className = "reveal-overlay";
  overlay.innerHTML = `
    <div class="reveal-card">
      <div class="reveal-title">YOUR ROLE IS</div>
      <div class="reveal-icon">${rd.icon}</div>
      <div class="reveal-role" style="color:${rd.color}">${roleName}</div>
      <div class="reveal-value" style="color:${rd.color}">৳${rd.value}</div>
      <button class="reveal-close">GOT IT</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector(".reveal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}
