## Daily Visual Journal (MVP) — Quick PRD

### Overview
A simple daily journal that captures things a user consumed or did via pictures (e.g., food, basketball, cycling). User uploads a photo; background is removed (similar to remove.bg); the cut-out object is placed randomly on a per-day canvas. Additional objects added the same day appear on the same canvas in random positions. Focus is image-only entries for the MVP.

### Goals
- Provide a delightful, low-friction way to visually log the day using pictures.
- Auto-remove backgrounds for clean object stickers.
- Arrange objects randomly on a day’s canvas; allow light rearranging.
- Persist each day’s canvas for later viewing.

### Non-Goals (MVP)
- Text journaling, long-form notes, mood tracking.
- Multi-device sync or accounts beyond a single user (optional later).
- Social sharing, comments, or collaboration.
- Computer vision classification/tags beyond background removal.

## Scope

### In Scope (MVP)
- Image upload (file picker and mobile camera where supported).
- Background removal pipeline (SaaS API or local model).
- Per-day canvas creation (one canvas per calendar day).
- Random placement of cut-out image objects on the canvas.
- Manual repositioning (drag) and scaling (pinch/scroll + modifier).
- Persist day state (cut-outs, positions, scales, z-order).
- View previous/next day and today shortcut.
- Lightweight onboarding/help for first-time users.

### Out of Scope (MVP)
- Text annotations, stickers library, or drawing tools.
- Accounts/auth, multi-user sync, cloud backup.
- Advanced layout (smart packing, collision avoidance).
- Editing of the cut-out mask.

## Users and Use Cases
- As a user, I want to quickly add a photo of something I ate/did so it appears on today’s canvas.
- As a user, I want the object to have no background so it looks clean.
- As a user, I want objects to appear automatically without manual positioning.
- As a user, I want to drag and resize objects to tidy my canvas.
- As a user, I want to flip between days and see past canvases.
- As a user, I want my data to persist without me signing up.

## User Flows
1) Add Item
- Tap “Add photo” → select or capture image → background removed → cut-out appears randomly on today’s canvas → user optionally drags/resizes → auto-save.

2) View Day
- Open app → default to today’s canvas → see all items added today → navigate days via arrows or date picker.

3) Error/Offline
- If background removal fails: show original image with subtle shadow and tag as “no-bg”. Allow retry.
- If offline: allow adding images and queue background removal for later.

## Functional Requirements
- Image Upload
  - Accept common formats: JPG, PNG, HEIC (if browser-supported)/fallback to PNG conversion.
  - Max file size (configurable, e.g., 12 MB) with client-side downscaling if necessary.
- Background Removal
  - Option A: SaaS API (e.g., remove.bg-like) via server proxy; return transparent PNG.
  - Option B: Local/edge model (e.g., U2Net/rembg) for cost/privacy; basic performance target: <5s for 1–2 MP.
  - Store both original and cut-out; associate with day and placement.
- Canvas
  - Virtual canvas per date; viewport pan/zoom; default viewport centers items.
  - On add: random x/y within viewport bounds, randomized small rotation (e.g., ±5°), initial scale fit-to-width target.
  - Drag to move; pinch/scroll+modifier to scale; double-tap to reset scale.
  - Z-order: newest on top; simple “bring to front” on tap.
- Persistence
  - MVP: Local-first persistence (IndexedDB). Data schema below.
  - Auto-save on every change.
- Navigation
  - Buttons: Previous day, Today, Next day; calendar date picker.
- Performance
  - Target TTI < 2s on modern mobile; background removal call not blocking UI.
- Privacy/Safety
  - Local-first; if using SaaS, route via server and do not persist images server-side beyond processing.

## Data Model (MVP)
- Day
  - id: ISO date (YYYY-MM-DD)
  - items: [ItemId]
- Item
  - id: UUID
  - dayId: ISO date
  - originalImage: blob ref
  - cutoutImage: blob ref (transparent PNG/WebP)
  - position: { x: number, y: number }
  - scale: number
  - rotation: number (degrees)
  - zIndex: number
  - backgroundRemoved: boolean
  - createdAt: timestamp

## Technical Approach
- Client: Web app (React or Next.js App Router). Canvas via HTML Canvas or CSS transforms on absolutely-positioned images within a large container.
- State: Local state + IndexedDB (use idb library) for persistence.
- Image Processing: 
  - Prefer serverless function to call background removal API to protect keys.
  - Optional local model mode if acceptable bundle size/perf.
- Random Placement Algorithm: place within current viewport bounds with margins; simple retry to reduce overlap (N tries, then accept).
- Responsiveness: Mobile-first UI; gesture support (Pan/Pinch) via a small library.

## Integrations
- Background removal: 
  - SaaS: remove.bg-like API (requires API key and server proxy).
  - Local alternative: rembg/U2Net in a worker (stretch goal).

## Success Metrics (MVP)
- Time to first usable canvas: < 30s.
- Background-removal success rate: ≥ 90% of uploads.
- Median removal latency (SaaS): < 3s for 1080p image.
- Daily return rate (week 2): ≥ 25%.

## Milestones
- M0 (1–2 days): Skeleton app, per-day routing, IndexedDB scaffolding, basic canvas.
- M1 (2–3 days): Image upload, random placement, drag/resize, persistence.
- M2 (2–3 days): Background removal via SaaS, error states, retries, offline queue.
- M3 (1–2 days): Polishing (gestures, z-order, basic onboarding), minimal analytics.

## Risks & Mitigations
- API costs/latency: add local downscaling before upload; batch retries; consider local model later.
- Mobile performance: cap image resolution; use Web Workers for heavy tasks.
- Privacy: default local-first; if cloud used, document and offer opt-out.

## Open Questions
- Do we need accounts/multi-device sync in v1? If yes, use lightweight email link or device sync.
- Should we support manual cut-out refinement later?
- Do we need export/share of a day’s collage (PNG)?

## Future Enhancements
- Tags/auto-labels, search, streaks, reminders.
- Quick actions: “Ate”, “Played”, “Biked” with icon prompts.
- Share/export day as image; social templates.
- iOS/Android wrappers (Capacitor) with camera intents.
