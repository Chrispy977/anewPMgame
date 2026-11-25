# PRIORITIZE: Ship the Demo

A first playable, solo-project MVP for a product/project management learning game. Plan one indie game release, respond to playtest feedback, and compare the consequences for schedule, budget, and player experience.

## Play locally

Open `index.html` in a current browser. Select **Start the scenario**, assign all six tasks, then run the playtest. You can return to compare choices or change assignments. No login, server, or API key is required. Internet access is only used for optional Google fonts; the game falls back to local fonts if unavailable.

## How the simulation works

- One working person is assigned to each task. Each person can only work on one task at a time.
- Task effort represents baseline person-days. Duration = baseline effort / assigned person's pace. Labor cost = duration × daily rate. Fractional workdays are allowed.
- Dependencies must finish before the next task starts. The engine schedules ready tasks by earliest feasible start, with scenario order breaking ties. This is a simplified heuristic, not an optimal schedule or a real estimate.
- The playtest happens after the initial plan finishes. Any follow-up is assigned to the person who handled the tutorial. The three options have different effort, expense, and assumed impacts on the player experience. A redesigned tutorial is not proof that a real-world issue is resolved; it would need testing.
- The release has a fixed day-22 showcase and a $32,000 labor budget. The simulation can report late or over-budget outcomes; a low-risk outcome is not automatically a successful real-world launch.

## Files

- `index.html` and `style.css`: user interface and styling.
- `data/scenario.js`: scenario, staff, dependencies, and choice text.
- `js/engine.js`: scheduling and decision calculations.
- `js/app.js`: screen transitions and display.
- `js/engine.test.js`: logic tests; run `node js/engine.test.js`.
- `js/browser_test.py`: optional browser smoke test using Playwright, Edge, and a local server on port 8765. Run the server first (`python -m http.server 8765`) then `uv run --with playwright python js/browser_test.py`.

## AI and limitations

Hermes assisted with code, scenario text, and this documentation. The visuals in this build are CSS shapes and letter avatars, **not AI-generated images**; image generation remains to be completed for the assignment's third modality. This is a local prototype, not yet published to Webflow, and it has not been tested by external players. The program/portfolio levels, industry variants, and distinct Agile and Waterfall modes are future possibilities, not features in this build.

## Publishing later

Host the static files together on a service such as GitHub Pages, then embed the hosted URL in a Webflow Embed element using an iframe. Confirm the Webflow site's plan supports the desired custom-code and publishing features, test the iframe on desktop and mobile, and include a standalone link as a fallback. Do not assume deployment or plan eligibility until verified.
