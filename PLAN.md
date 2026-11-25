# PRIORITIZE v2 implementation plan — sprint board

**Goal:** Replace the single-shot planner with a sprint-by-sprint simulation played on a kanban board, with a read-only Gantt toggle, role-based staffing, and a bug model that rewards good staffing decisions.

**Architecture:** `data/scenario.js` holds roles, people, backlog, sprint config, and event text. `js/engine.js` holds a pure, deterministic sprint simulator (no DOM). `index.html` + `js/app.js` + `style.css` render the board, Gantt, capacity bars, sprint review, playtest, and debrief. Static files only, Webflow-embeddable later. Still an MVP; levels, industries, and Agile/Waterfall modes remain future scope.

## Locked design decisions
- **Sprint model A (fixed timebox).** Sprint length and count come from data (default 5 working days x 3 sprints = 15 days inside a 22-day showcase window). Work beyond a person's sprint capacity carries over as in-progress.
- **Pay only for assigned work.** Project cost = sum of actual person-days worked x daily rate. Idle/unassigned capacity costs nothing; no fixed workforce burn.
- **6 people, 3 roles:** 2 engineers, 2 artists, 2 QA. Each task declares a required role; assignment is filtered to that role.
- **Kanban columns:** Backlog -> Upcoming Sprint -> In Progress -> QA -> Done.
- **QA is assigned up front, per dev task.** During sprint planning each dev task that needs testing is given a QA person alongside its developer. The task auto-flows dev -> QA -> rework -> Done, but it will not clear QA without an assigned tester. Assignments can change between sprints.
- **QA quality varies (detectionRate 0-1).** A thorough QA catches most bugs; a cheap/fast QA misses more. Missed bugs become *unresolved bugs* counted against a project-wide cap at the showcase.
- **Bugs cause rework that extends the timeline.** A finished dev task carries `totalBugs = effort x bugRate` (bugRate x overload multiplier for work spilled past capacity). QA finds `bugsFound = totalBugs x detectionRate` over `baseQA + bugsFound x timePerBug` days; the original developer then spends `bugsFound x fixTimePerBug` fixing them, pushing the task's end date out. That is QA "pushing back." Fixes do not spawn new bugs in this MVP (stated simplification).
- **Unresolved-bug cap.** The scenario sets a max unresolved bugs allowed at the showcase. Over the cap = demo ships "at risk," reported in the debrief separately from schedule and budget.
- **Bug model (deterministic).** Engineers/artists have `bugRate` (bugs per effort-day); QA have `detectionRate`. Same inputs -> same outputs; no hidden randomness. Post-launch bug events are future scope.
- **Gantt is read-only**, rendered from the same simulation history; toggle between Board and Gantt.
- **Playtest event fires after the demo is built** (demo milestone dev + QA all in Done), not at a sprint boundary. Same 3-choice flow and debrief, now informed by sprint history.

## Build order
1. `data/scenario.js`: roles, 6 people with pace/dailyCost/bugRate, backlog with role + effort + needs, sprintDays, sprintCount, showcaseDay, budget, event.
2. `js/engine.js`: `simulate(scenario, plan)` where `plan` is per-sprint `{taskId: staffId}` commitments. Day-by-day within each sprint, respecting capacity, dependencies, carryover, QA gating, bug accrual, per-task cost. Returns sprint-by-sprint history, task timeline (for Gantt), totals, and demo-complete sprint.
3. `js/engine.test.js`: capacity cap + carryover; role enforcement; dependency + QA gating; bug accrual + overload multiplier; cost = actual days only; deterministic repeat; a solvable path exists within budget and showcase day. All pass before UI.
4. `index.html`/`js/app.js`/`style.css`: 5-column board, role-filtered assignment, per-person capacity bars with overload warning, advance-sprint with a sprint review summary, Board/Gantt toggle, playtest, enriched debrief.
5. Verify: `node js/engine.test.js`; Playwright smoke test (desktop + mobile) driving all three sprints, the toggle, the event, and the debrief, asserting no console errors and no horizontal overflow; confirm it runs from `file://`.

**Honesty gates:** visuals remain CSS placeholders, not AI images (third modality still outstanding); not published to Webflow; not player-tested. Do not claim any of those until done.
