# Vehicle Robot Artwork

Local revision: 2026-11-08. Not published or pushed by the agent.

## Product Rules

- The old procedural block robot is removed. These are detailed generated bitmap illustrations, not interactive 3D models.
- Resolve artwork by make, model and supported model year using a matching saved VIN decode, otherwise garage facts. Never choose a random body, paint or another model as a fallback.
- Golf V (2004-2008), pre-facelift Citigo (2012-2016), and Qashqai J11 (2017) have separate artwork.
- These three cars' saved data did not include exterior color. Blue, green and pearl white are artistic concepts based on the owner's references, not decoded VIN facts. The UI explicitly identifies concept paint. A saved real paint value is not silently overwritten or falsely reproduced.
- Different models have different heads, shoulders, wheel placement, limb armor and poses. The common camera/platform preserves a compact Citigo, medium athletic Golf and large broad Qashqai. Robot sizes are fictional design proportions, not measurements decoded from VIN.
- Hero, garage car thumbnail, vehicle picker, assistant portrait, dialog and banner all use one source image per model. Thumbnail crops improve legibility; full hero scenes preserve relative size without per-model CSS enlargement.
- Garage thumbnails only read saved profile and VIN records, never issue paid decode/provider requests. Late results are scoped to their car. Unsupported models show an unavailable state rather than unrelated artwork.
- Automatic creation for arbitrary new models and exact paint variants is NOT connected. Adding cars from supported generations selects their saved artwork automatically; adding an unsupported generation does not create new art. Runtime image generation needs a separately approved provider and cost/cache policy.

## Assets

All final assets live in `frontend/public/vehicle-artwork/`, are 1536 x 1024 WebP, and are served separately from API `/vehicles/`. The original `hero.webp` remains unchanged as a style reference.

| File | Design | Approximate Transfer Size |
| --- | --- | --- |
| volkswagen-golf-5-v2.webp | Cobalt, athletic guardian, medium build | 249 KB |
| skoda-citigo-2012-v2.webp | Emerald compact scout, slim shoulders, hip wheels | 209 KB |
| nissan-qashqai-j11-v2.webp | Pearl crossover guardian, broad shoulders, heavy armor | 289 KB |

Created with the built-in image generation tool, not the paid CLI/API fallback. User-provided portraits supplied style/color direction. Generated PNG originals remain under Codex generated_images; the app only references the final workspace assets. WebP encoding optimized storage without changing artwork composition. CSS crops derive portraits and car thumbnails without extra image-editing operations.

## Prompt Set

Verification: clean frontend install and production build passed. API and frontend
audits report zero known vulnerabilities. The full automated suite passes 139 tests.
The local browser fixture verifies different/stable per-model sources, matching hero
and avatars, three garage thumbnails, widths 320/390/650/768/1024/1250/1440, decoded
image pixels, reduced motion, operation without WebGL, failed-image handling and
unsupported-model fallback. Browser page errors: none. Desktop and mobile screenshots
are saved in ignored `scratch/`. No live VIN request or Telegram write was made.

The full-frame side-by-side review is `scratch/vehicle-artwork-preview.html`.

### Citigo

Use case: stylized-concept. Premium photoreal automotive AI character dashboard, landscape 1536x1024.
References: image1 is the user's emerald robot example for material quality and green concept paint ONLY; image2 is the garage layout reference. REDESIGN its anatomy so it is distinctly a SMALL lightweight city-car scout, NOT the same bulky robot body with another grille. This is a Skoda Citigo 2016 pre-facelift. Match actual Citigo short rounded bonnet, large rounded-rectangular headlights and small vertical-bar grille (NOT the more angular Fabia-like front in the example).
Critical scale: same camera distance, lens, floor plane and robot platform as garage reference. Robot feet at y=91%, but head TOP at y=27% and shoulder width only23% of canvas, from x=58% to81%. Robot height about64% of frame, visibly shorter and narrower than a Golf robot (78%) or Qashqai robot (88%). DO NOT zoom in or enlarge the Citigo to fill the scene.
Design: emerald metallic Citigo panels, small city-car wheels at hips and slim calves rather than big shoulder tires, compact shoulders made from short curved fenders, small aerodynamic helmet WITHOUT long horns, friendly bright green/cyan eyes, agile articulated forearms, slim waist, clever folded hatch/window panel behind back, compact nimble stance with one foot a little forward, detailed piston joints and exposed black-metal precision skeleton. Real Citigo headlamp and bonnet parts form integrated segmented chest, not a huge whole-car-front pasted on generic torso. Different helmet, shoulder layout, arm/leg construction and silhouette from reference robots. Physically rich high-budget VFX surfaces, elegant not childish, no weapon, no toy blocks.
A matching emerald 2016 Citigo five-door hatchback is parked front-three-quarter at lower LEFT x=8–37%, y=65–90%. It must visibly be a small city car in this common camera view, not enlarged to crossover size.
Environment: dark futuristic inspection workshop with cyan strip lights, subtle emerald robot optics and precision joints, glossy dark floor and a circular cool-cyan illuminated floor platform same size as image2. Robot neutral calm personality. Upper LEFT half is quiet dark wall reserved for app overlay. No text, labels, watermarks or UI. Color is an artistic concept choice, not a VIN claim.

### Golf

Use case: stylized-concept. Premium photoreal full-body AI automotive character, landscape1536x1024. Image1=user's blue Golf robot style/material/identity reference. Image2=our compact Citigo scene for EXACT camera distance, floor/platform size, lighting and composition.
Create a DISTINCT cobalt-blue Volkswagen Golf V / Mk5 2007 five-door transforming robot, full body. Keep real Golf Mk5 broad paired circular lamp lenses, rounded hood and slim horizontal grille recognizable in segmented chest armor. Design an athletic medium-sized technical guardian, not the same thin scout from image2 and not a huge SUV tank: wider rounded Golf fender shoulders with medium-sized wheel assemblies mounted BACKWARDS behind shoulders; short substantial articulated forearms; layered curved steel shin guards; solid split-bumper feet; compact low swept-back helmet with a single central cobalt crest and cyan eyes, NO tall pointy ears/horns from image1. Subtly asymmetric shoulder armor from folded doors. A confident slightly side-on relaxed athletic stance, one articulated hand resting near hip, no weapons. Real machinery, fine hydraulic and mechanical detail, gorgeous cobalt metallic body panels and polished silver skeleton like image1. Do not just paste an entire bumper onto a generic shared robot body.
SCALE CRITICAL: same lens and camera framing as image2, do not zoom. Keep circular platform at same y=86%, same size. Golf robot is clearly taller/broader than Citigo: head top y=11%, feet y=91%, about80% frame height, shoulder span x=51–87%. Citigo robot in reference was only67% tall and23% shoulder span. Golf stays smaller and more athletic than a bulky Qashqai SUV robot. Entire body and hands in frame.
Matching cobalt-blue 2007 Golf V five-door hatchback at lower LEFT, front three-quarter, complete wheels, x=6–46%, y=52–89%. Clearly bigger than the Citigo in image2 without making all cars equal. Upper left45% remains a dark uncluttered workshop wall, reserved for text.
Dark precision automotive workshop with cyan strip lighting, circular illuminated floor platform, glossy reflective floor, tasteful restrained blue light. High-budget cinematic VFX realism, sharp visible car-specific surfaces, no text, logos as labels, watermarks, UI, toy blocks or cartoon. Blue is concept paint, not a decoded VIN fact.

### Qashqai

Use case: stylized-concept. Production photoreal automotive robot dashboard artwork, landscape1536x1024.
References: image1=user's pearl-white Nissan robot for premium finish and Qashqai design cues. Image2=the medium cobalt Golf robot on the COMMON workshop set for exact same camera distance, floor geometry and platform. Completely redesign the character into a much BROADER, heavier, taller crossover guardian, not Golf anatomy recolored white.
Subject: Nissan Qashqai J11 2017 crossover transformed into a pearl-white robot. Recognizable Qashqai angular headlamps and signature chrome V-motion grille segmented into a wide chest. A visibly thick barrel torso, broad front-fender shoulder shells with large SUV tires facing outward on shoulders, deep layered pearl-white side armor, black wheel-arch cladding reused on elbows, powerful thick short upper arms with heavy hydraulic braces, larger hands, wide pelvis, massive angular shin/calf armor with tire treads and folded rear-quarter panels, broad stable mechanical feet. A distinct angular helmet with wide brow and V-shaped crown, purple optics, no humanoid toy face, no delicate thin-limbed scout proportions. Calm protector stance, feet spread, arms naturally a little away from torso, hands relaxed, head facing front. Rich fine mechanical PBR details, chrome joints, graphite skeleton, subtle purple lighting only as accent, no weapons. Same quality as supplied refs but make anatomy distinctly Qashqai, not just badge/front swap.
SCALE CRITICAL: camera NOT closer than image2; same floor platform dimensions and position. Full robot head top y=3%, feet y=92%, shoulder width x=47–90% (43% canvas), vs medium Golf shoulders about34% and small Citigo23%. Qashqai is visibly tallest and much more muscular, entire head/hands/feet in frame. Preserve upper-left clear dark wall for UI.
Matching pearl-white 2017 Nissan Qashqai J11 crossover, complete actual car with correct higher roofline/ride height and wheel arches, front-three-quarter parked lower left x=4–48%, y=49–90%. Larger/taller than the Golf car and much bigger than tiny Citigo, with same perspective and distance. This is the actual donor car, not a different SUV.
Environment: EXACT same premium dark inspection workshop and cool cyan floor platform as image2, dark glossy floor, cyan strip lights. High-budget cinematic VFX finish, crisp visible details, restrained purple highlights, no text/UI/watermark. Pearl-white is concept color, not a claimed VIN paint result.

