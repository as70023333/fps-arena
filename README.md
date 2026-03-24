# Arena Lockdown (Browser FPS Prototype)

Arena Lockdown is a browser-based 3D first-person arena shooter built with Three.js.
You battle one AI opponent in a stylized arena with round-based progression.

## Features

- First-person movement and shooting
- One AI enemy with adaptive round scaling
- Enemy projectile damage and player projectile damage
- Health HUD for player and opponent
- Round and score tracking (first-to-3 match target)
- Match champion flow and reset controls
- Health pickup spawn/collect system
- Ammo + reload loop with firing bloom
- End-of-round overlay with restart controls

## Controls

- Arrow Up / Arrow Down: Move forward / backward
- Arrow Left / Arrow Right: Turn left / right
- Space: Fire
- R: Reload during a live round
- Esc: End/forfeit current round
- R (when round ended): Start next round
- N: Start a new match (reset score)

## Run Locally

From the project folder:

```bash
python3 -m http.server 8080
```

Open:

- http://localhost:8080

## Tech Stack

- HTML5
- CSS3
- JavaScript (ES Modules)
- Three.js via CDN

## Notes

- This project is currently a lightweight prototype focused on gameplay iteration.
- No build step is required.
