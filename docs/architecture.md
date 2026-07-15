# Public Architecture Overview

The private Aardvarkland WMS product is organized as a split application:

- React and Vite frontend for warehouse users.
- NestJS API backend with `/api` prefix.
- PostgreSQL persistence through Prisma.
- Local Print Agent for ZPL label printing.
- Scanner-first workflows through keyboard wedge and supported handheld paths.

## Runtime Boundaries

The backend owns data authority, permissions, audit trail, label templates,
print jobs, scan validation, inventory movement, and integration contracts.

The frontend owns the warehouse workflow experience, role-filtered navigation,
localized UI, label preview, scanner input surfaces, and operational views.

The Print Agent owns local printer connectivity and reports job results back to
the backend through registered agent credentials.

## Public Demo Boundary

This repository contains only a static showcase UI and public documentation. It
does not contain production source code, server configuration, generated Prisma
output, database dumps, real integrations, private tokens, or pilot deployment
material.
