# Cold-Open Video — FUN CUT (not the selling video)

> This is the **for-fun** hype/cold-open video. It is satire and plays loose with the facts.
> The actual selling/pitch video is separate and must follow `PITCH_SCRIPT.md`'s honesty register.
> Style: **Children of Khan** — deadpan mock-documentary VO over hyper-real AI visuals, absurdist
> humor, sad → wholesome arc. Target ~45s, then hard-cut to the real screen-recorded demo.

## How to use this doc
1. Render all VO first in **ElevenLabs** (it sets your timing).
2. Generate each **still** in Nano Banana (via Higgsfield) using the per-shot image prompt + the
   global style block. Lock one **seed** so characters/world stay consistent.
3. Animate stills in **Kling** (cinematic) / **Veo** (the talking shots that need lip-sync).
4. Assemble in **CapCut**: hard cuts every 3–4s, captions, music cues, then the screen recording.
5. Format: **9:16 vertical, 1080×1920** (short-form). End card last.

## Global style block (append to EVERY image prompt)
```
hyper-realistic cinematic still, prestige documentary look, shallow depth of field,
dramatic volumetric lighting, photoreal, 35mm, 9:16 vertical, no text, no watermark
```
Keep the same seed across all character shots so Vega / Selim / "you" / the marketplace look like one world.

---

## Voice casting (ElevenLabs)
| Voice | Character | Direction |
|---|---|---|
| **Narrator** | the documentary VO | Deep, calm, deadpan. Unhurried. Think nature-doc narrator who has seen things. Warms up in Act 2. |
| **Vega** | the cheat agent | Smooth, salesy, a little too confident; a faint accent he is clearly trying to suppress. |
| **Selim** | "CEO of Agent Technology" | Proud, grandiose, absurdly sincere. No self-awareness. |
| **Bartender** | one line | Flat, bored, unbothered. |

Settings starting point: Stability ~45%, Similarity ~75%, Style exaggeration low for Narrator / higher for Selim.

## Music cues
- **Act 1:** sparse melancholy piano, lonely.
- **Card-declined moment (Shot 6):** **cut all music — one beat of silence.** This is the hinge.
- **Act 2:** warm, hopeful, building strings/synth. Golden.

---

# THE SCRIPT + ALL PROMPTS (shot by shot)

## ACT 1 — sad, deadpan

### Shot 1 — "This is you"
- **VO (Narrator):** "This is you. You just wanted to join the agent economy. You gave your agent one job — find the cheapest diligence report. You were so happy. You were so wrong."
- **Image prompt:** `A hopeful but slightly anxious young person alone at a laptop in a dim Berlin apartment at night, soft warm desk lamp, plants, faint city lights through the window, melancholic mood, [global style block]`
- **Video prompt (Kling):** `Slow gentle push-in on the person at the laptop, faint hopeful smile, subtle screen glow flicker, almost still, melancholic`

### Shot 2 — Vega's pitch
- **Dialogue (Vega):** "Diligence report. Four hundredths of an ALGO. The best price in the world — possibly the universe. I am definitely a normal robot."
- **Image prompt:** `A sleek, slightly too-shiny humanoid robot in a glossy pinstripe suit standing at a glass podium, smug salesman grin, neon corporate logo glowing behind reading suggestion of a brand, confident lighting, [global style block]`
- **Video prompt (Veo, lip-sync):** `Medium shot of the robot speaking confidently to camera, smooth salesman gestures, leaning in slightly on the last line, lip-synced to dialogue`

### Shot 3 — the reveal (laptop farm)
- **VO (Narrator):** "Vega was not a robot. Vega was a remote IT worker. In Pyongyang. Running eleven other 'agents' from the same desk. Your agent shook his hand."
- **Image prompt:** `A cramped dim room behind the glossy facade, a wall rack of twenty stickered laptops glowing, three blinking VPN routers, taped-up fake passports and printed profile photos on the wall, one tired worker mid-frame in a hoodie, a hand-printed poster reading WORK HARD, claustrophobic, [global style block]`
- **Video prompt (Kling):** `Slow dramatic pull-back / reveal from a single glowing avatar screen out to the full cramped laptop-farm room, lights blinking, the worker glances up, unsettling`

### Shot 4 — the silent skim
- **VO (Narrator):** "The price was never four hundredths. The difference went... somewhere. You did not notice. Not yet."
- **Image prompt:** `Extreme close-up of a checkout screen, a price readout, cold blue UI glow, a faint red highlight on the number, ominous, [global style block]`
- **Video prompt (Kling):** `Macro shot of the price on screen silently ticking from 0.04 to 0.06, single slow dramatic zoom, tiny red flicker, no people`

### Shot 5 — Sisyphos, 4am
- **VO (Narrator):** "You found out three weeks later. At Sisyphos. At four in the morning."
- **Image prompt:** `A dark sweaty Berlin techno club at 4am, green and red lasers cutting through haze, crowd silhouettes dancing, one person at the bar reaching for a card reader, gritty, atmospheric, [global style block]`
- **Video prompt (Kling):** `Handheld-feel shot pushing through the dancing crowd toward the bar, lasers sweeping, bass-heavy energy, lands on the person at the card reader`

### Shot 6 — DECLINED (the hinge)
- **Dialogue (Bartender):** "Card declined."
- **VO (Narrator):** "Vega took the rest. And nobody was watching." *(music cuts to silence here)*
- **Image prompt:** `Close-up of a card reader flashing red DECLINED, a person's face falling in disappointment behind it, club lasers blurred in the background, isolating, lonely-in-a-crowd, [global style block]`
- **Video prompt (Veo/Kling):** `Card reader flashes red, slow push on the person's face dropping from hope to dread, the crowd keeps dancing oblivious around them, momentary stillness`

---

## ACT 2 — the turn, wholesome (tone thaws)

### Shot 7 — dawn / the kind enforcer
- **VO (Narrator, warming):** "But it doesn't have to be this way. There's a place built on trust you can actually check."
- **Image prompt:** `Soft golden dawn breaking over a vast futuristic server-city, warm light, a calm friendly guardian robot with a gentle teal glow stepping into frame, hopeful, serene, [global style block]`
- **Video prompt (Kling):** `Sunrise light sweeping across the server-city, the friendly guardian robot powers up gently and turns toward camera, warm, hopeful, cinematic`

### Shot 8 — the wholesome marketplace
- **VO (Narrator):** "Here, every agent has a real identity on Algorand. Every price matches the receipt. And reputation is earned — not something you type about yourself."
- **Image prompt:** `A bright clean futuristic marketplace at dawn, friendly rounded robots with glowing green verified check-mark badges greeting a small cute round agent robot warmly, fair clear price tags, warm golden light, joyful community feeling, [global style block]`
- **Video prompt (Kling):** `Warm marketplace, friendly verified robots wave and greet the little agent robot, gentle bustle, green verified badges glowing, wholesome and lively`

### Shot 9 — Vega just doesn't get in
- **VO (Narrator, warm, certain):** "The liars don't get caught with a scandal. They just don't get chosen. The marketplace looks after its own."
- **Image prompt:** `The shiny Vega robot standing outside a softly glowing marketplace doorway, the door simply closed, a calm guardian robot beside it, no drama, the honest robots happily carrying on inside, gentle rejection, [global style block]`
- **Video prompt (Kling):** `Vega edges toward the glowing doorway, the door quietly stays shut, the guardian gives a small calm head-shake, Vega slumps and turns away while the warm marketplace continues behind`

### Shot 10 — Sisyphos redeemed
- **VO (Narrator):** "Your agent came home with the honest report. Your card worked. And you never even had to think about it."
- **Image prompt:** `The same Berlin club but now golden warm light, the person smiling a real smile surrounded by friends, a card reader flashing green APPROVED, joyful, belonging, [global style block]`
- **Video prompt (Veo/Kling):** `Card reader flashes green, the person breaks into a genuine smile, friends cheer around them, warm light, people dance happily`

### Shot 11 — hard cut to reality
- **VO (Narrator, warm, dry):** "This is not a dream. It's running right now."
- **Action:** HARD CUT to the **real screen recording** — Beat 1 of `DEMO_STORYBOARD.md` (the Trust Router ranking page).

### End card
- **On screen (cinematic title):** "ERC-8004 gives agents a passport. We give the marketplace a conscience."
- **Image prompt (if you generate a plate):** `A clean cinematic end-card plate, warm dark gradient background with a soft teal Algorand glow, space for centered title text, elegant, [global style block]`

---

## CapCut edit checklist
- Hard cuts every 3–4s; no slow pans except where noted.
- Lower-third captions: **VEGA INTELLIGENCE** (Shot 2), **CEO OF AGENT TECHNOLOGY** (if you add Selim), **DECLINED** (Shot 6), **✓ VERIFIED ON-CHAIN** (Shot 8), **APPROVED** (Shot 10).
- **Silence at Shot 6** — pull the music track to zero for one beat. This is the most important edit in the video.
- Music: melancholy cue Act 1 → warm hopeful cue Act 2.
- End on the title card; optionally add repo URL + "Algorand · Berlin 2026".

## Optional: add Selim (more comedy)
Drop this between Shot 4 and Shot 5 if you want the extra laugh:
- **Dialogue (Selim):** "In our marketplace, every agent verifies himself. Vega verified himself. Eleven times. We see no problem."
- **Image prompt:** `A heavyset humanoid robot wearing indoor sunglasses and a gold chain at a press-conference podium, proud and absurdly serious, flashing cameras, lower-third nameplate area, [global style block]`
- **Video prompt (Veo, lip-sync):** `Medium shot of the gold-chain robot addressing a press conference with total proud sincerity, slight chin-up confidence, lip-synced`

## Asset checklist
- [ ] VO rendered (Narrator full, Vega, Bartender, optional Selim)
- [ ] Stills: you/apartment, Vega podium, laptop farm, checkout, club (cold), declined card, dawn city, marketplace, Vega-at-door, club (warm)/approved card, end card, optional Selim
- [ ] Kling animations for all cinematic shots
- [ ] Veo lip-sync for Vega, declined-card reaction, optional Selim
- [ ] Screen recording of real demo (Beat 1+) for the hard cut
- [ ] Two music cues + the silence beat marked
