# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A personal productivity dashboard — a vanilla JS single-page app (no framework, no build step) backed by Supabase (PostgreSQL). It is designed to run as a PWA installable on iPhone via Safari. Hosted on Vercel; credentials stored in `localStorage`.

## Running locally

No install step needed. Open `index.html` with VS Code's **Live Server** extension (`http://localhost:5500`). On first load, enter a Supabase project URL and anon key to connect.

## Architecture

Everything lives in three files:

- [index.html](index.html) — full HTML shell with all sections, tabs, and modals pre-declared. Sections are shown/hidden via CSS `hidden` class; no server-side rendering.
- [js/app.js](js/app.js) — single JS file (~2900 lines), organised into clearly-marked sections (see below).
- [style.css](style.css) — all styling including responsive layout (sidebar on desktop, bottom nav on mobile).

External dependencies loaded from CDN (no npm):
- `@supabase/supabase-js@2` — database client
- `chart.js@4` — weight history chart

### State model

All application state lives in a single `state` object (defined near the top of [js/app.js](js/app.js)). On launch, `loadAllData()` fetches everything from Supabase in parallel and populates `state`. Most render functions read directly from `state`; mutations write to Supabase then update `state` in place and re-render.

### app.js section map

| Section | What it does |
|---|---|
| CONFIG & STATE | Global constants (`PHASE_DATE`, `KCAL_PER_KG`), `DEFAULT_COURSES`, `DEFAULT_HABITS`, full `SETUP_SQL` string |
| MICRO NUTRIENT DATA | `FOODS` array (per-100g micronutrient values), `SUPPLEMENTS`, `MICRONUTRIENTS` RDA definitions |
| UTILS | Date helpers (`todayStr`, `addDays`, `getWeekDates`), `showToast`, `getSetting` |
| SUPABASE INIT & SETUP | `launchApp`, `initializeApp`, `seedDataIfEmpty`, `resetSetup` |
| DATABASE OPERATIONS | `loadAllData` (parallel fetch), `saveSetting` |
| NAVIGATION | `navigate(section)` — shows/hides sections, updates active nav buttons |
| TDEE ALGORITHM | Estimates TDEE from weight-change vs. calorie-intake pairs; confidence badge logic |
| AI SECTION | Course grid rendering, study log rendering, streak/stats calculation |
| FITNESS SECTION | Cut tracker: entry form, weekly log table, cut planner projection, progress bar |
| SAUNA TRACKER | Day-type schedule (training/rest), sauna protocol cards, benefits progress, session history |
| MICRO NUTRIENTS | Micronutrient tracking UI — food log, RDA progress bars, sauna deductions |
| WEIGHT CHART | Chart.js rendering with range selector |
| HABITS SECTION | Week grid, monthly overview, manage list, auto-habit detection (`weight`, `calories`, `study`) |
| MODALS | Generic open/close helpers; specific save handlers for each modal |
| COURSE URL MAP | Maps course names to external URLs |
| STUDY TIMER | Countdown/up timer that logs to `study_logs` on stop |
| WATER TRACKER | Home tab water card with ml targets |
| HABIT STREAKS | Streak calculation for the home digest |
| TIMED HABITS | Per-habit minute goals (min/max), log-time modal |
| INIT | IIFE that reads `localStorage` and calls `launchApp` if credentials exist |

### What requires Supabase changes vs. what doesn't

Adding or editing entries in `FOODS`, `SUPPLEMENTS`, `MICRONUTRIENTS`, `DEFAULT_COURSES`, or `DEFAULT_HABITS` in `app.js` is purely client-side — no Supabase migration needed. Only structural changes (new tables, new columns) require running SQL in the Supabase editor.

### Supabase tables

Core tables (created by `SETUP_SQL`): `settings`, `courses`, `study_logs`, `weight_logs`, `nutrition_logs`, `habits`, `habit_logs`, `sauna_logs`, `day_logs`, `notes`, `water_logs`, `micro_logs`.

All tables have Row Level Security disabled (single-user app, credentials are the access control).

Optional migration tables are documented in [SETUP.md](SETUP.md) with runnable SQL snippets.

### Key patterns

- **Auto-habits**: habits with `auto_type` of `weight`, `calories`, or `study` are marked complete automatically based on whether a matching log entry exists for that day.
- **Settings persistence**: arbitrary key/value pairs are stored in the `settings` table and cached in `state.settings`. Use `getSetting(key, fallback)` to read and `saveSetting(key, value)` to write.
- **Sauna deductions**: on the Micros tab, nutrients marked `sauna: true` in `MICRONUTRIENTS` have their RDA increased when a sauna session is logged for the day.
- **Phase banner**: the `PHASE_DATE` constant in CONFIG controls when the AI section switches between "Grind" and "Reflection" phases.
- **Date strings**: all dates are `YYYY-MM-DD` strings throughout. Never use `Date` objects in state — use `todayStr()` and the helper functions.
