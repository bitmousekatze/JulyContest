# ⚓ JulyContest — Prompted July Games Contest

Contest rosters and games for July 2026.

## 🏴‍☠️ BROADSIDE! — 3D Pirate Battleship

A pirate-age naval war simulator in full 3D. Pick a community member as your
captain, then sail a gauntlet against **every other captain in the Prompted
community** — classic Battleship rules on a rolling 3D ocean, with cannonball
volleys, burning wrecks, and talking trash from the enemy flagship.

### Play

Just open `index.html` in a browser (or serve the folder and visit it).
No build step. Three.js loads from CDN, so you need an internet connection.

### How it works

- **Choose yer Captain** — the roster is the real Prompted leaderboard
  (top 24 by Builder Points, pulled 2026-07-10).
- **Gauntlet** — you face every other community member, weakest to strongest.
  Higher Builder Points = smarter AI (checkerboard hunting, line targeting).
- **Rules** — classic Battleship, 10×10, five ships (Man o' War 5 · Galleon 4
  · Brigantine 3 · Schooner 3 · Sloop 2). Ships auto-place; shuffle until you
  like your spread. A hit earns you another shot; the enemy fires one ball
  per volley. Lose a battle and you can retry it.
- **Controls** — click a cell in the enemy waters to fire. Drag to orbit the
  camera, scroll to zoom, or use the view buttons (Enemy Waters / Overview /
  Yer Fleet). 🔊 button mutes.

### Files

| File | What |
|---|---|
| `index.html` | Page shell, HUD, and all styling |
| `game.js` | Three.js scene + full game logic |
| `roster.js` | The community roster — **edit this** to add/remove captains |

### Editing the roster

Open `roster.js` and add a line:

```js
{ username: "newmember", name: "New Member", emoji: "🦀", bp: 1200 },
```

`bp` (Builder Points) controls how smart their cannon fire is.
