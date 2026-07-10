# ⚓ JulyContest — Prompted July Games Contest

Contest rosters and games for July 2026.

## 🏴‍☠️ BROADSIDE ROYALE — 3D Pirate Battle Arena

A pirate-age battle royale in full 3D. Pick a community member as your
captain, then sail into an open ocean arena against **every other captain
in the Prompted community** — 24 ships, live cannon fire, a closing storm,
and one crown. Last ship afloat wins.

### Play

Just open `index.html` in a browser (or serve the folder and visit it).
No build step. Three.js loads from CDN, so you need an internet connection.

### How it works

- **Choose yer Captain** — the roster is the real Prompted leaderboard
  (top 24 by Builder Points, pulled 2026-07-10).
- **Hulls by Builder Points** — top 8 sail a Man o' War (5 guns/side, tanky,
  slow), middle 8 a Galleon, the rest a nimble Brigantine. Higher BP also
  means faster reloads and truer aim.
- **Free naval combat** — broadsides fire from your ship's sides, cannonballs
  fly a real ballistic arc, and accuracy falls off hard with distance. Close
  in for a killing volley, or kite at range and dodge.
- **The storm** — after a 20s grace the purple storm ring closes in. Sail
  outside it and your hull burns; once it reaches the maelstrom, all waters
  are cursed. There is always exactly one survivor.
- **Kill feed & spectate** — watch the community sink each other in real
  time; if you go down, spectate the rest of the battle or restart.

### Controls

| Input | Action |
|---|---|
| `W` / `S` | more sail / slow & reverse |
| `A` / `D` | rudder port / starboard |
| `Q` | fire port broadside |
| `E` | fire starboard broadside |
| `SPACE` | fire both sides |
| drag mouse | look around |
| scroll | zoom |

### Files

| File | What |
|---|---|
| `index.html` | Page shell, HUD, and all styling |
| `game.js` | Three.js scene, simulation, AI, and effects |
| `roster.js` | The community roster — **edit this** to add/remove captains |
| `BattleSong.mp3` | Battle music (non-copyrighted) — loops during the arena, 🔊 mutes |

### Editing the roster

Open `roster.js` and add a line:

```js
{ username: "newmember", name: "New Member", emoji: "🦀", bp: 1200 },
```

`bp` (Builder Points) controls their hull class, reload speed, and aim.

### Tuning the battle

All pacing knobs live at the top of `game.js`: hull HP/speed in `HULLS`,
cannonball damage in the ball-hit branch of `step()`, storm timing in
`STORM`, and accuracy falloff in `fireBroadside()`.
