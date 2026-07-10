# ⚓ BROADSIDE ROYALE

**A 3D pirate battle royale starring the Prompted community.**
Built for the [Prompted](https://prmpted.com) July 2026 Games Contest.

▶️ **[PLAY IT IN YER BROWSER](https://bitmousekatze.github.io/JulyContest/)** — no install, no build, just wind and gunpowder.

![Mid-battle brawl](screenshots/battle.png)

Pick a real community member as your captain, then sail into an open ocean
arena against **all 23 other captains from the Prompted leaderboard** —
live cannon fire, a closing storm, one crown. Last ship afloat wins.

## How it works

- **Choose yer Captain** — the roster is the real Prompted leaderboard
  (top 24 by Builder Points, pulled 2026-07-10), real avatars included.
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
- **The Fallen** — the end screen shows a Hunger Games-style memorial of
  all 24 captains with their real Prompted avatars: who survived, who sank,
  their placement, and (on hover) kills, damage, hull, and who sank them.
- **ESC to parley** — pauses the battle over a mini roster board, with a
  link back to [prmpted.com](https://prmpted.com).

| The Fallen | Parley (pause) |
|---|---|
| ![The Fallen memorial](screenshots/the-fallen.png) | ![Parley pause screen](screenshots/parley.png) |

## Controls

| Input | Action |
|---|---|
| `W` / `S` | more sail / slow & reverse |
| `A` / `D` | rudder port / starboard |
| `Q` | fire port broadside |
| `E` | fire starboard broadside |
| `SPACE` | fire both sides |
| `ESC` | pause (parley) |
| drag mouse | look around |
| scroll | zoom |

## Run it locally

Clone and open `index.html` in a browser — that's it. No build step.
Three.js loads from CDN, so you need an internet connection.

## Files

| File | What |
|---|---|
| `index.html` | Page shell, HUD, and all styling |
| `game.js` | Three.js scene, simulation, AI, and effects |
| `roster.js` | The community roster — **edit this** to add/remove captains |
| `BattleSong.mp3` | Battle music (non-copyrighted) — loops during the arena, 🔊 mutes |

## Editing the roster

Open `roster.js` and add a line:

```js
{ username: "newmember", name: "New Member", emoji: "🦀", bp: 1200, avatar: null },
```

`bp` (Builder Points) controls their hull class, reload speed, and aim.
`avatar` is an optional image URL for the memorial board.

## Tuning the battle

All pacing knobs live at the top of `game.js`: hull HP/speed in `HULLS`,
cannonball damage in the ball-hit branch of `step()`, storm timing in
`STORM`, and accuracy falloff in `fireBroadside()`. Match pacing was tuned
by running full headless AI-only battles via the `window.__broadside`
debug hook (start / step / state) — handy if you want to rebalance.

---

*Built with [Claude Code](https://claude.com/claude-code) for the Prompted July Games Contest.* 🏴‍☠️
