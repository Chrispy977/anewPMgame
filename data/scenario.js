'use strict';
// Content and tuning live here so the engine can be reused for future scenarios.
const SCENARIO = {
  id: 'indie-demo-v2',
  title: 'Ship the Demo',
  studio: 'Lantern Forge Games',
  premise: 'Your studio has an invite to showcase a playable demo. The date is fixed. Plan sprint by sprint, staff the work, and keep bugs under control before launch.',
  budget: 60000,
  sprintDays: 5,          // working days per sprint (one person's capacity per sprint)
  sprintCount: 3,         // planning rounds before the showcase
  showcaseDay: 15,        // sprintDays * sprintCount; demo must be Done by here
  unresolvedBugCap: 6,    // max unresolved bugs tolerated at showcase before "at risk"
  overloadBugMultiplier: 2,  // bugRate multiplier applied to effort spilled past capacity
  qaBaseEffort: 0.5,         // days of QA setup before per-bug testing time
  qaTimePerBug: 0.1,         // extra QA days per bug found
  fixTimePerBug: 0.4,        // developer days to fix each bug QA finds
  roles: { engineer: 'Engineering', artist: 'Art', qa: 'QA' },
  staff: [
    { id: 'mara', name: 'Mara', role: 'engineer', note: 'Senior engineer. Reliable, pricier.', pace: 1.1, dailyCost: 1400, bugRate: 0.4, color: 'violet', portrait: 'assets/portraits/mara.png' },
    { id: 'theo', name: 'Theo', role: 'engineer', note: 'Fast engineer. Cuts corners under load.', pace: 1.35, dailyCost: 1100, bugRate: 0.9, color: 'coral', portrait: 'assets/portraits/theo.png' },
    { id: 'iris', name: 'Iris', role: 'artist', note: 'Lead artist. Polished, steady.', pace: 1.05, dailyCost: 1200, bugRate: 0.3, color: 'blue', portrait: 'assets/portraits/iris.png' },
    { id: 'dev', name: 'Dev', role: 'artist', note: 'Junior artist. Cheaper, less consistent.', pace: 0.9, dailyCost: 700, bugRate: 0.7, color: 'mint', portrait: 'assets/portraits/dev.png' },
    { id: 'sana', name: 'Sana', role: 'qa', note: 'Meticulous QA. Catches most issues.', pace: 1.0, dailyCost: 1000, detectionRate: 0.9, color: 'amber', portrait: 'assets/portraits/sana.png' },
    { id: 'rob', name: 'Rob', role: 'qa', note: 'Quick QA. Misses more, costs less.', pace: 1.3, dailyCost: 650, detectionRate: 0.55, color: 'teal', portrait: 'assets/portraits/rob.png' }
  ],
  // needsQA tasks flow dev -> QA -> rework -> done and require a qa assignee.
  backlog: [
    { id: 'core', name: 'Core gameplay', role: 'engineer', effort: 6, needs: [], needsQA: true, description: 'The main interaction loop. Everything depends on it.' },
    { id: 'levels', name: 'Demo levels', role: 'engineer', effort: 5, needs: ['core'], needsQA: true, description: 'Two short playable areas.' },
    { id: 'art', name: 'Visual assets', role: 'artist', effort: 5, needs: ['core'], needsQA: true, description: 'Characters and environment art for the demo.' },
    { id: 'tutorial', name: 'Tutorial flow', role: 'engineer', effort: 4, needs: ['core'], needsQA: true, description: 'Teach new players the controls.' },
    { id: 'ui', name: 'Menus and UI art', role: 'artist', effort: 3, needs: ['core'], needsQA: true, description: 'Title screen, menus, HUD.' },
    { id: 'store', name: 'Store page', role: 'artist', effort: 2, needs: [], needsQA: false, description: 'Capsule art and copy. Not part of the playable build.' }
  ],
  // The demo "ships" when these tasks are Done. The playtest fires then.
  demoTasks: ['core', 'levels', 'art', 'tutorial', 'ui'],
  event: {
    title: 'The playtest is in',
    text: 'The playable demo is built. An internal playtest shows new players struggling with the tutorial. The showcase date has not moved. What do you do?',
    assigneeTask: 'tutorial',
    choices: [
      { id: 'full', title: 'Redesign the tutorial', effort: 4, issueStatus: 'resolved', description: 'A full revision. More confidence for new players, more work before launch.', lesson: 'You protected the player experience by paying time and cost. You would still re-test the new flow with players.' },
      { id: 'quick', title: 'Targeted fix', effort: 2, issueStatus: 'mitigated', description: 'Address the biggest confusion point. Faster, some risk remains.', lesson: 'A compromise: you reduced the problem while keeping capacity. It is not proof the whole flow works.' },
      { id: 'defer', title: 'Ship, fix later', effort: 0, issueStatus: 'unresolved', description: 'Protect schedule and budget. Players may still struggle at the showcase.', lesson: 'You protected the plan and accepted a known risk. Make sure stakeholders know about it.' }
    ]
  }
};
if (typeof module !== 'undefined') module.exports = SCENARIO;
