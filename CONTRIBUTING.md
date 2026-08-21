# Contributing

Thank you for helping improve Aardvarkland WMS.

## Development setup

1. Fork and clone the repository.
2. Install Node.js 24.15+, npm 11.12+, Docker, and Docker Compose.
3. Run `npm ci` in `backend/`, `frontend/`, and `print-agent/`.
4. Copy `backend/.env.example` to `backend/.env` and keep that file local.
5. Start the stack with `docker compose up --build` or run the frontend and backend separately.

## Before submitting a pull request

Run `npm run verify` in `backend/`, the typecheck, lint, tests, and build in `frontend/`, and `npm run check` in `print-agent/`. Add tests for behavior changes and update documentation when commands, configuration, APIs, or product boundaries change.

Keep pull requests focused. Do not include generated output, credentials, customer data, local databases, production URLs, signing files, or real warehouse exports. Use fictional examples in tests and screenshots.

## Pull requests

Describe the problem, the solution, the checks you ran, and any remaining hardware or deployment validation. A passing software test does not prove physical scanner, printer, or production acceptance.
