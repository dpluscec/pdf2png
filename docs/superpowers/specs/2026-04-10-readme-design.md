---
name: README design
description: Design spec for the PDF Manager project README
type: project
---

# README Design Spec

## Context

PDF Manager is a local-use React + Express TypeScript web app with five PDF tools.
The README serves two audiences: end users (what the app does) and developers (how to run it).
Approach: feature-first (Option A) — hero screenshot leads, features before setup.

## Structure

### 1. Header & Hero

- Title: `PDF Manager`
- Tagline: one-sentence value statement
- Screenshot: `docs/screenshot.png` (placeholder — user adds real screenshot)
- Badges: TypeScript, React, license (no LICENSE file exists yet — badge will show "license: TBD" until one is added)

### 2. Features

One bullet per tab with name, description, and key options:

- **PDF → PNG** — DPI 72–600, browser or server mode, ZIP download per file or all
- **Merge PDFs** — drag-and-drop ordering, single merged output
- **PNG → PDF** — pack images into a PDF
- **Split PDF** — by range, page list, or file size
- **Compress PDF** — selectable levels via Ghostscript

### 3. Prerequisites & Getting Started

- Node.js 18+
- Ghostscript (required for Compress PDF), with install instructions for macOS / Windows / Linux
- Clone → install → `npm run dev`
- URLs: frontend at `localhost:5173`, API at `localhost:3001`

### 4. Architecture

Two-row table: Frontend (React 18, TypeScript, Vite → `src/main.tsx`) and Backend (Express, TypeScript, tsx → `server/index.ts`).

Brief note: PDF→PNG runs entirely in-browser via `pdfjs-dist`; all other operations hit `/api/*`.

### 5. Scripts

Table of four commands: `npm run dev`, `npm run build`, `npm test`, `npm run type-check`.

## Out of Scope

- Contributing guide
- Deployment instructions (local-only tool)
- Per-feature API documentation
- Changelog
