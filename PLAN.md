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
   - `npx create-next-app@latest frontend` with TypeScript, App Router, no src/ dir (flat), Tailwind CSS
   - Basic layout, config

3. **Backend scaffolding**
   - Express server with TypeScript (or plain JS for simplicity)
   - File upload route (multer or native)
   - File listing route
   - Health check endpoint

4. **Docker setup**
   - Multi-stage Dockerfile for frontend
   - Dockerfile for backend
   - `docker-compose.yml` with frontend, backend, and network
   - `deployment/start.sh` and `deployment/stop.sh`

5. **Dev scripts**
   - `npm run dev:frontend`, `npm run dev:backend` from root, or just document `cd frontend && npm run dev`

### Success Criteria

- [ ] `ls` shows `frontend/`, `backend/`, `storage/`, `deployment/` directories
- [ ] `frontend/` is a working Next.js app (`npm run dev` starts on port 3000)
- [ ] `backend/` is a working server (`npm run dev` starts on port 4000)
- [ ] `docker-compose up` builds and runs both services
- [ ] `deployment/start.sh` and `deployment/stop.sh` work
- [ ] `storage/` directory exists and is writable
- [ ] Git repo initialized with initial commit
- [ ] `.gitignore` excludes node_modules, .next, .env, etc.

---

## Phase 2: Photo Upload and Storage

**Goal**: Users on phones can capture a photo and have it saved to the server.

### Tasks

1. **Backend photo upload**
   - POST `/api/photo` — accept multipart form upload, save to `storage/` with timestamp-based filename
   - GET `/api/photos` — list all uploaded photos
   - GET `/api/photos/:id` — serve a specific photo
   - Auto-generate a small thumbnail

2. **Backend WebSocket or SSE**
   - Server-sent events on `/api/updates` or WebSocket on `/ws` to notify clients of new photos
   - Keep it simple — SSE preferred (no extra deps)

3. **Frontend: Mobile capture page**
   - Single page with a camera button using `<input type="file" capture="environment">` (simplest reliable path)
   - After capture, auto-upload to backend
   - Show upload progress / success / error
   - Responsive, works on iOS Safari and Android Chrome

4. **Frontend: Photo gallery page**
   - Displays all uploaded photos in a grid
   - Auto-refreshes when new photos arrive (via SSE/WebSocket)

### Success Criteria

- [ ] POST `/api/photo` saves file to `storage/` and returns success with metadata
- [ ] GET `/api/photos` returns list of all photos with URLs
- [ ] GET `/api/photos/:id` serves the actual image file
- [ ] Frontend camera capture works on iOS Safari
- [ ] Frontend camera capture works on Android Chrome
- [ ] Uploaded photos appear in gallery immediately after upload
- [ ] New photos auto-appear in gallery without page refresh (SSE/WebSocket)
- [ ] Unit tests for upload handler and photo listing

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

4. **Kiosk print mode**
   - Frontend page at `/kiosk` — shows new photos as they arrive, one at a time
   - Each photo displayed with its frame
   - Print button (triggers `window.print()` with print-specific CSS)
   - Auto-advance or manual advance
   - Full-screen friendly, no distractions

### Success Criteria

- [ ] `/api/event` returns configured event name and details
- [ ] `/qr` page displays a large, scannable QR code that links to the capture page
- [ ] `/api/frame/:id` returns a photo with an event frame overlaid
- [ ] `/kiosk` shows incoming photos one at a time with framing
- [ ] Print from kiosk mode produces a framed photo on paper
- [ ] QR code is scannable from a reasonable distance (>1 meter)
- [ ] Unit tests for framing logic and event config

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
