# Photo Event Web App

## Business Requirements

- An MVP of a photo event web application
- The web app should have two modes
  - Users on phones shoudl be able to take pictures and have those uploaded automatically to the system
  - The server should print new photos as they come in with a custom frame signifying the event (bar mitzvah 2026, wedding, etc.), this mode will use --kiosk-printing mode
- The priority is a slick, professional, gorgeous UI/UX with very simple features
- The server should expose a QR code for the user URL to be printed and have users add to it

## Technical Details

- Implemented as a modern NextJS app, client rendered
- The NextJS app should be created in a subdirectory `frontend`
- Files should be stored in the storage directory
- Backend should be created in the `backend` directory
- A docker setup should be built under `deployment` including a docker compose yml and a script to start and stop the system.
- No user management for the MVP
- Use popular libraries
- As simple as possible but with an elegant UI

## Strategy

1. Write plan with success criteria for each phase to be checked off. Include project scaffolding, including .gitignore, and rigorous unit testing.
2. Execute the plan ensuring all critiera are met
3. Carry out extensive integration testing with Playwright or similar, fixing defects
4. Only complete when the MVP is finished and tested, with the server running and ready for the user

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
