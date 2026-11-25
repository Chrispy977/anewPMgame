'use strict';
// PRIORITIZE sprint simulator. Pure + deterministic: no DOM, no randomness.
// plan: array (one per sprint) of { taskId: { dev: staffId, qa?: staffId } }.
// A task flows: ready -> dev -> qa -> rework -> done. QA finds a fraction of bugs
// (detectionRate); found bugs cost dev rework time (pushing the end out); missed
// bugs become unresolved and count against the showcase bug cap. Fixes do not spawn
// new bugs in this MVP (stated simplification).

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function simulate(scenario, plan) {
  const S = scenario;
  const people = new Map(S.staff.map(p => [p.id, p]));
  const backlog = new Map(S.backlog.map(t => [t.id, t]));
  const sprintDays = S.sprintDays;

  // Validate every commitment up front (role + QA rules).
  for (let s = 0; s < plan.length; s++) {
    for (const [taskId, a] of Object.entries(plan[s] || {})) {
      const task = backlog.get(taskId);
      if (!task) throw new Error(`Unknown task: ${taskId}`);
      const dev = people.get(a && a.dev);
      if (!dev) throw new Error(`Assign a developer to ${task.name}.`);
      if (dev.role !== task.role) throw new Error(`${dev.name} has the wrong role for ${task.name} (needs ${task.role}).`);
      if (task.needsQA) {
        const qa = people.get(a.qa);
        if (!qa) throw new Error(`Assign a QA tester to ${task.name}.`);
        if (qa.role !== 'qa') throw new Error(`${qa.name} is not QA and cannot test ${task.name}.`);
      } else if (a.qa) {
        throw new Error(`${task.name} does not need QA.`);
      }
    }
  }

  // Per-task working state.
  const state = new Map();
  for (const t of S.backlog) {
    state.set(t.id, {
      taskId: t.id, name: t.name, role: t.role, needs: t.needs || [], needsQA: !!t.needsQA,
      devStaff: null, qaStaff: null, status: 'backlog',
      devRemaining: t.effort, devDays: 0, start: null, devEnd: null,
      qaInit: false, qaRemaining: 0, qaDays: 0,
      reworkRemaining: 0, reworkDays: 0, end: null,
      totalBugs: 0, bugsFound: 0, unresolvedBugs: 0, cost: 0
    });
  }

  const done = id => state.get(id) && state.get(id).status === 'done';
  const sprints = [];
  let demoCompleteDay = null;

  for (let s = 0; s < S.sprintCount; s++) {
    const commit = plan[s] || {};
    for (const [taskId, a] of Object.entries(commit)) {
      const rec = state.get(taskId);
      rec.devStaff = a.dev;
      rec.qaStaff = a.qa || null;
      if (rec.status === 'backlog') rec.status = 'ready';
    }

    const cap = new Map(S.staff.map(p => [p.id, sprintDays])); // remaining person-days this sprint
    const sprintStart = s * sprintDays;
    const personDays = new Map();

    const charge = (staffId, days, rec) => {
      const p = people.get(staffId);
      cap.set(staffId, cap.get(staffId) - days);
      personDays.set(staffId, (personDays.get(staffId) || 0) + days);
      rec.cost += days * p.dailyCost;
    };
    const dayNow = staffId => sprintStart + (sprintDays - cap.get(staffId));

    let progressing = true;
    while (progressing) {
      progressing = false;
      for (const t of S.backlog) {
        const rec = state.get(t.id);
        if (!rec.devStaff || rec.status === 'done' || rec.status === 'backlog') continue;

        if (rec.status === 'ready' || rec.status === 'dev') {
          if (!rec.needs.every(done)) continue;
          const dev = people.get(rec.devStaff);
          const avail = cap.get(dev.id);
          if (avail <= 1e-9) continue;
          if (rec.start === null) rec.start = Math.max(dayNow(dev.id), ...rec.needs.map(d => state.get(d).end || 0));
          rec.status = 'dev';
          const daysNeeded = rec.devRemaining / dev.pace;
          const daysSpent = Math.min(avail, daysNeeded);
          const effortDone = daysSpent * dev.pace;
          rec.totalBugs += effortDone * dev.bugRate;
          rec.devRemaining -= effortDone;
          rec.devDays += daysSpent;
          charge(dev.id, daysSpent, rec);
          if (rec.devRemaining <= 1e-9) {
            rec.devEnd = dayNow(dev.id);
            if (rec.needsQA) { rec.status = 'qa'; rec.qaRemaining = S.qaBaseEffort; }
            else { rec.status = 'done'; rec.end = rec.devEnd; }
          }
          if (daysSpent > 1e-9) progressing = true;
          continue;
        }

        if (rec.status === 'qa') {
          const qa = people.get(rec.qaStaff);
          const avail = cap.get(qa.id);
          if (avail <= 1e-9) continue;
          if (!rec.qaInit) { // size QA work once, from bugs present
            rec.bugsFound = rec.totalBugs * qa.detectionRate;
            rec.qaRemaining = S.qaBaseEffort + rec.bugsFound * S.qaTimePerBug;
            rec.qaInit = true;
          }
          const daysNeeded = rec.qaRemaining / qa.pace;
          const daysSpent = Math.min(avail, daysNeeded);
          rec.qaRemaining -= daysSpent * qa.pace;
          rec.qaDays += daysSpent;
          charge(qa.id, daysSpent, rec);
          if (rec.qaRemaining <= 1e-9) {
            rec.unresolvedBugs = rec.totalBugs - rec.bugsFound;
            rec.reworkRemaining = rec.bugsFound * S.fixTimePerBug;
            if (rec.reworkRemaining > 1e-9) rec.status = 'rework';
            else { rec.status = 'done'; rec.end = dayNow(qa.id); }
          }
          if (daysSpent > 1e-9) progressing = true;
          continue;
        }

        if (rec.status === 'rework') { // original dev fixes found bugs
          const dev = people.get(rec.devStaff);
          const avail = cap.get(dev.id);
          if (avail <= 1e-9) continue;
          const daysNeeded = rec.reworkRemaining / dev.pace;
          const daysSpent = Math.min(avail, daysNeeded);
          rec.reworkRemaining -= daysSpent * dev.pace;
          rec.reworkDays += daysSpent;
          charge(dev.id, daysSpent, rec);
          if (rec.reworkRemaining <= 1e-9) { rec.status = 'done'; rec.end = dayNow(dev.id); }
          if (daysSpent > 1e-9) progressing = true;
          continue;
        }
      }
    }

    const columns = { backlog: [], ready: [], dev: [], qa: [], rework: [], done: [] };
    for (const t of S.backlog) (columns[state.get(t.id).status] || columns.backlog).push(t.id);
    sprints.push({
      index: s + 1,
      personDays: [...personDays.entries()].map(([staffId, days]) => ({ staffId, days: round(days) })),
      spend: Math.round(S.backlog.reduce((sum, t) => sum + state.get(t.id).cost, 0)),
      columns
    });

    if (demoCompleteDay === null && S.demoTasks.every(done)) {
      demoCompleteDay = Math.max(...S.demoTasks.map(id => state.get(id).end));
    }
  }

  const timeline = S.backlog.map(t => {
    const r = state.get(t.id);
    return {
      taskId: t.id, name: t.name, role: t.role, staffId: r.devStaff, qaStaffId: r.qaStaff,
      status: r.status, start: r.start === null ? null : round(r.start),
      devEnd: r.devEnd === null ? null : round(r.devEnd), end: r.end === null ? null : round(r.end),
      totalBugs: round(r.totalBugs), bugsFound: round(r.bugsFound), unresolvedBugs: round(r.unresolvedBugs),
      reworkDays: round(r.reworkDays), cost: Math.round(r.cost)
    };
  });
  const totalSpend = Math.round(S.backlog.reduce((sum, t) => sum + state.get(t.id).cost, 0));
  const demoComplete = S.demoTasks.every(id => state.get(id).status === 'done');
  const unresolvedBugs = round(S.demoTasks.reduce((sum, id) => sum + state.get(id).unresolvedBugs, 0));
  const onTime = demoComplete && demoCompleteDay !== null && demoCompleteDay <= S.showcaseDay + 1e-9;

  return {
    sprints, timeline, totalSpend, demoComplete,
    demoCompleteDay: demoCompleteDay === null ? null : round(demoCompleteDay),
    unresolvedBugs, onTime,
    onBudget: totalSpend <= S.budget + 1e-9,
    withinBugCap: unresolvedBugs <= S.unresolvedBugCap,
    atRisk: !demoComplete || !onTime || unresolvedBugs > S.unresolvedBugCap
  };
}

function resolveEvent(sim, scenario, choiceId, plan) {
  const choice = scenario.event.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error('Unknown event choice.');
  let devId = null;
  for (const sprint of plan) if (sprint && sprint[scenario.event.assigneeTask]) devId = sprint[scenario.event.assigneeTask].dev;
  const person = scenario.staff.find(p => p.id === devId) || scenario.staff.find(p => p.role === 'engineer');
  const extraDays = choice.effort / person.pace;
  const extraCost = extraDays * person.dailyCost;
  const finishDay = (sim.demoCompleteDay || scenario.showcaseDay) + extraDays;
  const spend = sim.totalSpend + extraCost;
  return { choice, person, extraDays: round(extraDays), extraCost: Math.round(extraCost),
    finishDay: round(finishDay), spend: Math.round(spend),
    onTime: finishDay <= scenario.showcaseDay + 1e-9, onBudget: spend <= scenario.budget + 1e-9,
    issueStatus: choice.issueStatus };
}

if (typeof module !== 'undefined') module.exports = { simulate, resolveEvent };
