# Semester planner

Weekly study planner for university students. Built for the Data Science MSc at Polito, works for any program.

```sh
npm install
npm run dev      # http://localhost:5173 (also on your Wi-Fi address, for your phone)
```

## What's inside

- **Week planner**: your timetable plus study blocks. Drag on empty space to plan a block, drag a block to move it, drag its bottom edge to resize it. Click a class to keep it, skip it this week (adds a catch-up to-do), or skip it every week.
- **Course pages**: to-dos, projects with steps, notes with Markdown and LaTeX formulas (`$…$`, `$$…$$`), timetable and lab group, topics with review reminders, links.
- **Focus timer**: pomodoro with adjustable focus/break lengths. Finished sessions count toward statistics.
- **Weekly review** and **Statistics** pages.
- **Onboarding**: program, then a screenshot of your weekly timetable that's turned into classes.
- **Sync**: a private 8-character code keeps your phone and laptop in step.
- English and Turkish, light and dark.

Data lives in the browser (localStorage). **Backup** in the sidebar downloads a copy.

## Reading timetable screenshots

Needs an Anthropic API key on the server. Create `.env.local`:

```sh
ANTHROPIC_API_KEY=sk-ant-...
```

Restart `npm run dev`. Without a key, onboarding still works with the template or by adding classes by hand.

## Sync

- **At home, no setup:** open Sync on the laptop, create a code, scan the QR code with your phone (same Wi-Fi). The dev server stores synced data in `.data/sync/`.
- **Anywhere:** deploy to Vercel and add Upstash Redis from the Vercel Marketplace. `api/_lib/store.ts` uses it automatically when `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) are set.

```sh
npm i -g vercel && vercel login
vercel link
vercel integration add upstash      # Upstash Redis for sync
vercel env add ANTHROPIC_API_KEY    # screenshot reading
vercel deploy --prod
```

## Code map

- `src/store.ts`: all planner data and actions
- `src/pages/`: Planner, CoursePage, Review, Stats, Welcome (onboarding)
- `src/lib/`: focus timer, sync client, i18n, stats
- `api/`: Vercel Functions (`sync.ts`, `parse-timetable.ts`), also run by the dev server via `vite.config.ts`
- `src/data/seed.ts`: the Polito Data Science 2026/27 template timetable
