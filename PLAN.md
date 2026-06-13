# PhotoEvent - Phase Plan

## Project Overview

A photo event web app for events (bar mitzvah, wedding, etc.) where:
- Phone users capture/upload photos via a browser
- Server kiosk mode prints incoming photos with a custom event frame
- QR code displayed on server for easy user access

**Tech stack**: Next.js (frontend), Node.js backend, local file storage, Docker

---

## Phase 1: Scaffolding and Setup

**Goal**: Project structure with working dev environments for frontend, backend, and Docker.

### Tasks

1. **Project root setup**
   - `.gitignore`, `package.json` (workspace root)
   - `frontend/` — Next.js app (client-rendered, latest App Router)
   - `backend/` — Express/Node.js API server
   - `storage/` — empty directory for uploaded photos
   - `deployment/` — Dockerfile, docker-compose.yml, start/stop script

2. **Frontend scaffolding**
   - Next.js 15 with TypeScript, App Router, Tailwind CSS, @tailwindcss/forms
   - Layout with Inter font, print CSS
   - Home page with navigation to capture and gallery

3. **Backend scaffolding**
   - Express server with TypeScript
   - Multer for file uploads (20MB limit, image-only filter)
   - Photo upload route with Sharp thumbnail generation
   - Photo listing route (newest first)
   - Photo serving route
   - Health check endpoint
   - Event config endpoint

4. **Docker setup**
   - Multi-stage Dockerfile for frontend (standalone output)
   - Dockerfile for backend
   - `docker-compose.yml` with frontend, backend, and named volume for photos
   - `deployment/start.sh` and `deployment/stop.sh`

5. **Dev scripts**
   - Root: `npm run dev:frontend`, `npm run dev:backend`
   - Frontend: `npm run dev` (port 3000), `npm run build`
   - Backend: `npm run dev` (tsx watch, port 4000), `npm run build`, `npm test`

### Success Criteria

- [x] `ls` shows `frontend/`, `backend/`, `storage/`, `deployment/` directories
- [x] `frontend/` is a working Next.js app (`npm run build` compiles)
- [x] `backend/` is a working server (`npm run build` compiles)
- [x] `docker-compose up` configured with both services
- [x] `deployment/start.sh` and `deployment/stop.sh` exist and are executable
- [x] `storage/` directory exists and is writable
- [x] Git repo initialized with initial commit
- [x] `.gitignore` excludes node_modules, .next, .env, etc.

---

## Phase 2: Photo Upload and Storage

**Goal**: Users on phones can capture a photo and have it saved to the server.

### Tasks

1. **Backend photo upload**
   - POST `/api/photos` — accept multipart form upload, save to `storage/` with timestamp-based filename
   - GET `/api/photos` — list all uploaded photos
   - GET `/api/photos/:id` — serve a specific photo
   - Auto-generate a small thumbnail via Sharp (400x400 cover)

2. **Backend WebSocket or SSE**
   - Server-sent events on `/api/updates` to notify clients of new photos
   - SSE with no extra dependencies
   - Subscribers stored in memory, cleaned up on client disconnect

3. **Frontend: Mobile capture page**
   - Single page at `/capture` with a camera button using `<input type="file" capture="environment">`
   - After capture, auto-upload to backend
   - Show upload progress / success / error states
   - Responsive, works on iOS Safari and Android Chrome

4. **Frontend: Photo gallery page**
   - Displays all uploaded photos in a responsive grid (2-4 columns)
   - Auto-refreshes when new photos arrive via SSE
   - Shows event name from `/api/event` config
   - Loading skeleton, empty state, and photo timestamps

### Success Criteria

- [x] POST `/api/photos` saves file to `storage/` and returns success with metadata
- [x] GET `/api/photos` returns list of all photos with URLs
- [x] GET `/api/photos/:id` serves the actual image file
- [x] Frontend camera capture page at `/capture` with upload flow
- [x] Frontend gallery page at `/gallery` with grid and SSE auto-refresh
- [x] Uploaded photos appear in gallery immediately after upload
- [x] New photos auto-appear in gallery without page refresh (SSE)
- [x] Unit tests for upload handler and photo listing (6 tests, all passing)

---

## Phase 3: QR Code and Event Frame

**Goal**: Server displays a QR code for users; photos get a custom event frame when printed.

### Tasks

1. **Event configuration**
   - Simple config: `backend/event.json` or CLI args for event name, year, frame style
   - Backend exposes GET `/api/event` with config

2. **QR code page (server display)**
   - Frontend page at `/qr` that shows a large QR code linking to the capture URL
   - Use a QR code library (e.g., `qrcode`)
   - Clean, large, easy to photograph

3. **Photo framing**
   - Backend route: GET `/api/frame/:id` — overlays a custom frame on the photo
   - Frame includes event name/year, clean professional design
   - Serve framed image

4. **Kiosk unattended print mode**
    - Frontend page at `/kiosk` — runs unattended, prints every new photo automatically
    - When a new photo arrives, display it framed on screen with a visible countdown timer (30 seconds)
    - A "Discard" button lets an operator cancel the pending print during the 30-second window
    - If not discarded, the photo auto-sends to the printer via `window.print()` with print-specific CSS after the countdown elapses
    - If discarded, the kiosk immediately waits for the next incoming photo
    - Full-screen friendly, no distractions — one large framed image, the timer, and the discard button
    - Uses SSE (`/api/updates`) to receive new photo notifications in real time

### Success Criteria

- [x] `/api/event` returns configured event name and details
- [x] `/qr` page displays a large, scannable QR code that links to the capture page
- [x] `/api/frame/:id` returns a photo with an event frame overlaid
- [x] `/kiosk` auto-displays each new incoming photo with a 30-second countdown timer
- [x] Photo prints automatically after 30 seconds without user interaction
- [x] "Discard" button cancels the pending print and clears the image so the next photo loads on arrival
- [x] QR code is scannable from a reasonable distance (>1 meter)
- [x] Unit tests for framing logic and event config

---

## Phase 4: Polish and Integration Testing

**Goal**: Professional UI/UX, end-to-end flows, deployment-ready.

### Tasks

1. **UI polish**
   - Review all pages for visual consistency (typography, spacing, colors)
   - Smooth transitions between photos in kiosk mode
   - Loading states, empty states
   - Print CSS for framed output
   - Ensure no AI slop — clean, professional, intentional design

2. **End-to-end integration tests (Playwright)**
   - Test: User opens capture page on mobile, takes photo, uploads succeeds
   - Test: New photo appears in gallery automatically
   - Test: QR code page loads and displays valid QR code
   - Test: Kiosk mode displays photo with frame and prints
   - Test: Docker compose brings up full system and flows work

3. **Error handling**
   - Graceful handling of upload failures, disk full, etc.
   - User-facing error messages (not stack traces)

4. **Final Docker build**
   - Multi-stage builds optimized for size
   - Health checks in docker-compose
   - `deployment/start.sh` with clear output

### Success Criteria

- [ ] All Playwright E2E tests pass
- [ ] UI is polished, professional, consistent across all pages
- [ ] Print output looks good on paper
- [ ] Full system runs via `docker-compose up` with no manual steps
- [ ] `deployment/start.sh` prints startup info (URLs, QR address)
- [ ] No console errors or warnings
- [ ] System runs for 10+ uploads without issues

---

## Phase Summary

| Phase | Scope | Key Deliverable |
|-------|-------|-----------------|
| 1 | Scaffolding | Project structure, Docker, running services |
| 2 | Photo Upload | Capture → upload → gallery with live updates |
| 3 | QR & Kiosk | QR code page, framed photos, kiosk print mode |
| 4 | Polish & Test | E2E tests, UI polish, deployment-ready |
