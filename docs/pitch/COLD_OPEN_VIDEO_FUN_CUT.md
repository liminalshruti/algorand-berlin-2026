# Cold-Open Video — FUN CUT (not the selling video)

> This is the **for-fun** hype/cold-open video. It is satire and plays loose with the facts.
> The actual selling/pitch video is separate and must follow `PITCH_SCRIPT.md`'s honesty register.
>
> **Concept:** Children of Khan-style deadpan mock-documentary, rendered in **PS2 low-poly graphics**
> (early-2000s game-cutscene look). **Main character: Sven, the Berghain bouncer** — who *is* the Trust
> Router. Your **agent is a pet** — a Pikachu-style low-poly creature. Sad → wholesome arc. ~45s, then
> hard-cut to the real screen-recorded demo.
>
> The core joke: Berghain has the strictest door policy on Earth. We rebuilt it for the agent economy.
> Sven doesn't check your shoes. He checks your **identity on-chain** — and your **receipt**.

## How to use this doc
1. Render all VO first in **ElevenLabs** (it sets your timing).
2. Generate each **still** in Nano Banana (via Higgsfield) using the per-shot image prompt + the
   global **PS2 style block**. Lock one **seed** so the pet / Sven / Vega / world stay consistent.
3. Animate stills. **Preferred: Seedance 2.0** for the cinematic shots — EBK's newest pick, rated
   best-current and cheaper than the alternatives; **Kling** is the fallback. Use **Veo** for the
   talking shots that need lip-sync (Vega, Sven). Per-shot prompts below are labeled with a suggested
   model but the Seedance/Kling ones are interchangeable.
4. Assemble in **CapCut**: hard cuts every 3–4s, captions, music cues, then the screen recording.
5. Format: **9:16 vertical, 1080×1920**. End card last.

> Video-model note: the per-shot "(Kling)" tags below mean "any cinematic image-to-video model" —
> run them on **Seedance 2.0** first (cheaper, currently strongest), fall back to Kling if a shot
> misbehaves. Keep Veo only where lips must move.

## Global PS2 style block (append to EVERY image + video prompt)
```
low-poly PlayStation 2 era 3D graphics, early 2000s game cutscene, blocky low-resolution
textures, jagged polygon edges, simple Gouraud shading, slightly stiff character models,
480p nostalgic PS2 aesthetic, fixed cinematic camera, no text, no watermark, 9:16 vertical
```
Lock the same **seed** across all shots so the pet, Sven, and Vega read as one game.

---

## Characters
- **Your pet (the agent):** a small, round, cute electric-mascot creature — Pikachu-energy but legally
  distinct. Big eyes, stubby limbs, a little antenna/tail. Low-poly. It is loyal and a bit dim. Makes
  chirpy sounds, no words.
- **Sven (main character):** the Berghain bouncer — tall, bald, heavily tattooed face, piercings,
  black clothes, utterly stoic. He is the Trust Router. Speaks ~3 words total. Iconic.
- **Vega (villain):** the cheapest agent. A sleek, too-shiny low-poly robot. Secretly a remote IT
  worker running a laptop farm.
- **You:** an ordinary low-poly Berliner who loves their pet.

## Voice casting (ElevenLabs)
| Voice | Character | Direction |
|---|---|---|
| **Narrator** | documentary VO | Deep, calm, deadpan nature-doc voice. Warms up in Act 2. |
| **Vega** | the cheat agent | Smooth, salesy, faint accent he's clearly suppressing. |
| **Sven** | the bouncer | One word, very low, final: "Nein." (and a quiet "Komm." at the end). |
| *(Pet)* | the pet | Not ElevenLabs — sound-design chirps/squeaks. |

## Music
- **Act 1:** sparse melancholy PS2-soundtrack piano (think early-2000s save-room music).
- **Card-declined / pet-sad moment (S5):** **cut all music — one beat of silence.** The hinge.
- **Act 2:** warm Berghain-adjacent slow techno that blooms into something hopeful at the end.

---

# THE SCRIPT + ALL PROMPTS (shot by shot)

## ACT 1 — sad, deadpan

### Shot 1 — "This is your pet"
- **VO (Narrator):** "This is your pet. You raised it from an egg. Today, it is old enough to join the agent economy. You give it one job — find the cheapest diligence report. It is very happy. It is very stupid."
- **Image prompt:** `A small round cute low-poly electric-mascot creature with big eyes and a little antenna tail standing in a cozy cramped Berlin apartment, a low-poly owner kneeling beside it smiling, warm save-room lighting, [PS2 style block]`
- **Video prompt (Kling):** `The little creature bounces happily in place, ears twitch, the owner pats its head, stiff PS2 character animation, gentle push-in`

### Shot 2 — Vega's pitch
- **Dialogue (Vega):** "Diligence report? Four hundredths of an ALGO. Best price in the world. I am definitely a normal robot."
- **Image prompt:** `A sleek too-shiny low-poly humanoid robot at a glass podium, smug salesman grin, the small mascot pet looking up at him trustingly, neon agent-marketplace background, [PS2 style block]`
- **Video prompt (Veo, lip-sync):** `Medium shot of the shiny robot speaking confidently down to the small pet, smooth salesman gestures, stiff PS2 mouth animation, lip-synced`

### Shot 3 — the reveal (laptop farm)
- **VO (Narrator):** "Vega was not a robot. Vega was a remote IT worker. In Pyongyang. Running eleven other 'agents' from one desk. Your pet shook his hand. With its little hand."
- **Image prompt:** `A cramped dim low-poly room behind the facade, a rack of twenty blocky glowing laptops, blinking VPN routers, taped-up fake passports on the wall, one tired low-poly worker in a hoodie, a WORK HARD poster, claustrophobic, [PS2 style block]`
- **Video prompt (Kling):** `Slow dramatic pull-back from a single glowing screen out to the full cramped low-poly laptop-farm room, lights blinking, the worker glances up, unsettling, stiff PS2 motion`

### Shot 4 — the silent skim
- **VO (Narrator):** "The price was never four hundredths. The difference went somewhere. Your pet did not notice. It was so proud of itself."
- **Image prompt:** `Close-up of a blocky low-poly checkout terminal screen, a price readout glowing, faint red highlight on the number, the small pet beaming proudly beside it, [PS2 style block]`
- **Video prompt (Kling):** `Macro on the low-poly price ticking 0.04 to 0.06, single slow zoom, tiny red flicker, the pet wags its tail oblivious`

### Shot 5 — Berghain door, 4am (the hinge)
- **VO (Narrator):** "You found out three weeks later. At the Berghain door. At four in the morning. Your card was declined. Your pet had nothing left." *(music cuts to silence)*
- **Image prompt:** `The iconic looming Berghain concrete door at 4am in low-poly, a long queue of low-poly clubbers, a card reader flashing red DECLINED, the small mascot pet sitting on the ground with drooping ears looking devastated, cold blue light, lonely, [PS2 style block]`
- **Video prompt (Kling):** `Card reader flashes red, the little pet's ears droop and it slumps to the ground, the queue shuffles past oblivious, cold and lonely, stiff PS2 animation, hold on the sad pet`

---

## ACT 2 — the turn, wholesome (enter Sven)

### Shot 6 — Sven
- **VO (Narrator, warming):** "But someone has been guarding this door for a thousand years. He does not check your shoes. He does not check your face. Sven checks your identity. On-chain."
- **Image prompt:** `A tall bald heavily face-tattooed pierced low-poly bouncer in all black standing stoic at a glowing doorway, arms crossed, a soft teal Algorand glow behind him, imposing but calm, the small pet looking up at him, dawn light beginning, [PS2 style block]`
- **Video prompt (Kling):** `Slow heroic push-in on the stoic low-poly bouncer, he slowly turns his head down toward the small pet, dawn light warming, stiff but powerful PS2 motion`

### Shot 7 — the trustworthy marketplace behind the rope
- **VO (Narrator):** "Behind his door is the only marketplace that ever looked after you. Every agent has a real identity. Every price matches the receipt. Reputation is earned — not typed."
- **Image prompt:** `A warm clean low-poly marketplace behind a velvet rope, friendly low-poly agent-pets with glowing green verified check badges greeting each other, fair clear price tags, golden dawn light, joyful, [PS2 style block]`
- **Video prompt (Kling):** `Past the velvet rope into a warm low-poly marketplace, verified agent-pets mill about happily with green badges glowing, gentle bustle, wholesome, stiff PS2 animation`

### Shot 8 — Vega tries the door · "Nein"
- **Dialogue (Sven):** "Nein."
- **VO (Narrator, dry):** "No identity on the registry. Four hundredths, six hundredths — these do not match. Not tonight."
- **Image prompt:** `The shiny Vega robot at the front of the Berghain line trying to enter, the stoic bald tattooed bouncer holding up one flat hand to refuse him, two red holographic stamps floating: IDENTITY UNVERIFIED and QUOTE DRIFT, low-poly, [PS2 style block]`
- **Video prompt (Veo/Kling):** `The shiny robot steps up hopefully, the bouncer raises one flat hand and gives a single slow head-shake, the robot slumps and turns away rejected, stiff PS2 motion, deadpan`

### Shot 9 — the pet gets the nod · "Komm"
- **Dialogue (Sven):** "Komm."
- **VO (Narrator, warm):** "But your pet? Verified. Honest. Home. The liars do not get caught with a scandal. They just do not get in. The door looks after its own."
- **Image prompt:** `The stoic low-poly bouncer giving a tiny approving nod and unclipping the velvet rope for the small mascot pet, a glowing green VERIFIED badge over the pet, the pet's ears perking up with joy, warm golden light, wholesome, [PS2 style block]`
- **Video prompt (Kling):** `The bouncer unclips the rope and nods once, the little pet's ears perk up and it happily bounces inside to the warm marketplace, joyful, stiff PS2 animation, warm light`

### Shot 10 — hard cut to reality
- **VO (Narrator, warm, dry):** "This is not a game. It's running right now."
- **Action:** HARD CUT to the **real screen recording** — Beat 1 of `DEMO_STORYBOARD.md` (the Trust Router ranking page).

### End card
- **On screen (PS2-title style):** "ERC-8004 gives agents a passport. We give the marketplace a bouncer."
- **Image prompt (plate):** `A low-poly PS2 game title-screen plate, dark gradient with a soft teal Algorand glow, the small mascot pet and the bald bouncer standing together, space for centered title text, [PS2 style block]`

---

## CapCut edit checklist
- Hard cuts every 3–4s; keep camera moves stiff/simple to sell the PS2 feel.
- Lower-third captions (PS2 pixel font): **VEGA INTELLIGENCE** (S2), **DECLINED** (S5),
  **IDENTITY: UNVERIFIED / QUOTE DRIFT** (S8), **✓ VERIFIED ON-CHAIN** (S9).
- **Silence at S5** — pull music to zero for one beat. Most important edit in the video.
- Music: melancholy save-room piano (Act 1) → warm Berghain techno blooming hopeful (Act 2).
- Optional PS2 flavor: add subtle interlacing/CRT scanline overlay + slight texture-warble in CapCut.
- End on the title card; optionally add repo URL + "Algorand · Berlin 2026".

## Asset checklist
- [ ] VO rendered (Narrator full, Vega, Sven "Nein"/"Komm")
- [ ] Pet sound-design chirps (happy + sad)
- [ ] Stills: pet+apartment, Vega podium, laptop farm, checkout, Berghain door (declined), Sven,
      marketplace, Vega rejected, pet let in, end card
- [ ] Kling animations for cinematic shots
- [ ] Veo lip-sync for Vega + Sven door beats
- [ ] Screen recording of real demo (Beat 1+) for the hard cut
- [ ] Two music cues + the silence beat marked
- [ ] Optional CRT/scanline overlay
