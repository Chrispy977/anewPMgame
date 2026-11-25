'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const d1 = n => (Math.round(n * 10) / 10).toFixed(1);

const S = SCENARIO;
const staffById = Object.fromEntries(S.staff.map(p => [p.id, p]));
const taskById = Object.fromEntries(S.backlog.map(t => [t.id, t]));
// plan[sprintIndex] = { taskId: { dev, qa } }. One entry per sprint.
let plan = Array.from({ length: S.sprintCount }, () => ({}));
let currentSprint = 0;      // 0-based; the sprint being planned
let sim = null;             // last simulate() result
let view = 'board';

function show(id) {
  document.querySelectorAll('.screen').forEach(el => { el.hidden = el.id !== id; });
  document.querySelectorAll('[data-step]').forEach(el => el.classList.toggle('active', el.dataset.step === id));
  window.scrollTo(0, 0);
}

// ---- which tasks are assignable this sprint ----
// A task is assignable if not already Done in the sim and its deps are Done or in-flight.
function statusOf(taskId) {
  if (!sim) return currentSprint === 0 ? (taskById[taskId].needs.length ? 'blocked-maybe' : 'ready') : 'ready';
  const t = sim.timeline.find(x => x.taskId === taskId);
  return t ? t.status : 'backlog';
}
function assignmentFor(taskId) {
  // the most recent sprint (<= currentSprint) that committed this task
  for (let s = currentSprint; s >= 0; s--) if (plan[s][taskId]) return plan[s][taskId];
  return null;
}
function setAssignment(taskId, slot, value) {
  const cur = plan[currentSprint][taskId] || { ...(assignmentFor(taskId) || {}) };
  if (value) cur[slot] = value; else delete cur[slot];
  if (!cur.dev && !cur.qa) delete plan[currentSprint][taskId];
  else plan[currentSprint][taskId] = cur;
  refresh();
}

// ---- capacity used per person in the sprint being planned ----
function capacityUsed() {
  const used = Object.fromEntries(S.staff.map(p => [p.id, 0]));
  // Rough planning estimate: dev effort/pace + a QA allowance, for tasks committed THIS sprint.
  for (const [taskId, a] of Object.entries(plan[currentSprint])) {
    const t = taskById[taskId];
    if (a.dev) used[a.dev] += t.effort / staffById[a.dev].pace;
    if (a.qa) used[a.qa] += S.qaBaseEffort / staffById[a.qa].pace; // base allowance; bugs add more at run time
  }
  return used;
}

function renderTeam() {
  const used = capacityUsed();
  $('#team-strip').innerHTML = S.staff.map(p => {
    const roleClass = p.role === 'engineer' ? 'eng' : p.role === 'artist' ? 'art' : 'qa';
    const u = used[p.id], pct = Math.min(100, (u / S.sprintDays) * 100), over = u > S.sprintDays + 1e-9, idle = u <= 1e-9;
    const stat = p.role === 'qa' ? `${Math.round(p.detectionRate * 100)}% catch` : `${p.bugRate}/day bugs`;
    const barClass = over ? 'over' : idle ? 'idle' : '';
    const numClass = over ? 'over' : idle ? 'idle' : '';
    const numText = idle ? `free · ${S.sprintDays} days` : `${d1(u)} / ${S.sprintDays} days${over ? ' · OVER' : ''}`;
    return `<div class="tcard ${roleClass}">
      <img src="${esc(p.portrait)}" alt="${esc(p.name)}, ${esc(S.roles[p.role])}" width="54" height="54">
      <strong>${esc(p.name)}</strong><span class="rolechip">${esc(S.roles[p.role].toUpperCase())}</span>
      <div class="tnote">${esc(p.note)}</div>
      <div class="tstats"><span>${p.pace}× pace</span><span>${money(p.dailyCost)}/d</span></div>
      <div class="tstats"><span>${stat}</span></div>
      <div class="capbar ${barClass}"><i style="width:${pct}%"></i></div>
      <div class="capnum ${numClass}">${numText}</div>
    </div>`;
  }).join('');
}

function optionsFor(role, selected) {
  return S.staff.filter(p => p.role === role)
    .map(p => `<option value="${p.id}"${selected === p.id ? ' selected' : ''}>${esc(p.name)} · ${money(p.dailyCost)}/d</option>`).join('');
}

function kcard(task, locked) {
  const a = assignmentFor(task.id) || {};
  const st = statusOf(task.id);
  const simT = sim ? sim.timeline.find(x => x.taskId === task.id) : null;
  const needs = task.needs.length ? `After: ${task.needs.map(id => taskById[id].name).join(', ')}` : 'No dependency';
  let bugs = '';
  if (simT && (st === 'qa' || st === 'rework' || st === 'done') && task.needsQA) {
    bugs = `<div class="bugline">
      <span class="bugtag found">${simT.bugsFound} bugs found</span>
      <span class="bugtag ${simT.unresolvedBugs > 0 ? 'unresolved' : 'clean'}">${simT.unresolvedBugs} unresolved</span>
    </div>`;
  }
  const dotClass = { done: 'sdone', qa: 'sqa', rework: 'srework', dev: 'sdev', ready: 'sready', backlog: 'sbacklog' }[st] || 'sbacklog';
  const prog = simT && simT.end !== null ? `<div class="kprogress"><span class="kdot ${dotClass}"></span>Done day ${d1(simT.end)}</div>`
    : simT && simT.status !== 'backlog' ? `<div class="kprogress"><span class="kdot ${dotClass}"></span>${esc(simT.status)}</div>` : '';
  const dis = locked ? ' disabled' : '';
  const qaSlot = task.needsQA ? `<label>QA<select data-task="${task.id}" data-slot="qa"${dis}><option value="">— pick QA —</option>${optionsFor('qa', a.qa)}</select></label>` : '';
  return `<div class="kcard">
    <span class="kcard-role ${task.role}">${esc(S.roles[task.role].toUpperCase())}</span>
    <strong>${esc(task.name)}</strong>
    <div class="kdesc">${esc(task.description)} · ${task.effort}d effort</div>
    <div class="kneeds">${esc(needs)}</div>
    <div class="kassign">
      <label>Owner<select data-task="${task.id}" data-slot="dev"${dis}><option value="">— pick ${esc(S.roles[task.role])} —</option>${optionsFor(task.role, a.dev)}</select></label>
      ${qaSlot}
    </div>
    ${bugs}${prog}</div>`;
}

function renderKanban() {
  // Column membership: prefer sim status; before first run, everything is Backlog/Upcoming.
  const cols = { backlog: [], upcoming: [], progress: [], qa: [], done: [] };
  for (const task of S.backlog) {
    const st = statusOf(task.id);
    const committedNow = !!plan[currentSprint][task.id] || !!assignmentFor(task.id);
    if (st === 'done') cols.done.push(task);
    else if (st === 'qa' || st === 'rework') cols.qa.push(task);
    else if (st === 'dev') cols.progress.push(task);
    else if (committedNow) cols.upcoming.push(task);
    else cols.backlog.push(task);
  }
  const locked = id => statusOf(id) === 'done'; // can't reassign finished work
  const hints = { BACKLOG: 'Nothing waiting', 'UPCOMING SPRINT': 'Assign a task to stage it here', 'IN PROGRESS': 'Work appears once a sprint runs', QA: 'Testing shows up after dev finishes', DONE: 'Completed, tested work lands here' };
  const colDef = [
    ['BACKLOG', cols.backlog], ['UPCOMING SPRINT', cols.upcoming], ['IN PROGRESS', cols.progress], ['QA', cols.qa], ['DONE', cols.done]
  ];
  $('#kanban').innerHTML = colDef.map(([label, items]) =>
    `<div class="kcol"><div class="col-head"><span>${label}</span><span class="cnt">${items.length}</span></div>${items.length ? items.map(t => kcard(t, locked(t.id))).join('') : `<div class="kempty">${esc(hints[label])}</div>`}</div>`
  ).join('');
  $('#kanban').querySelectorAll('select').forEach(sel => sel.addEventListener('change', e => {
    setAssignment(e.target.dataset.task, e.target.dataset.slot, e.target.value);
  }));
}

function renderGantt() {
  if (!sim) { $('#gantt').innerHTML = '<p class="fineprint">Run a sprint to see the timeline.</p>'; return; }
  const maxDay = Math.max(S.showcaseDay, ...sim.timeline.map(t => t.end || 0));
  const scale = d => (d / maxDay) * 100;
  const rows = sim.timeline.filter(t => t.start !== null).map(t => {
    const devW = scale((t.devEnd || t.end || t.start) - t.start);
    const qaStart = t.devEnd || t.start, qaW = t.end !== null ? scale(t.end - qaStart) : 0;
    const devBar = `<div class="gbar dev" style="left:${scale(t.start)}%;width:${Math.max(devW, 2)}%" title="Dev">${esc(t.name)}</div>`;
    const qaBar = t.needsQA && qaW > 0 ? `<div class="gbar qa" style="left:${scale(qaStart)}%;width:${Math.max(qaW, 1.5)}%" title="QA + rework"></div>` : '';
    return `<div class="grow"><div class="glabel">${esc(t.name)}</div><div class="gtrack">${devBar}${qaBar}</div></div>`;
  }).join('');
  const sprintLines = Array.from({ length: S.sprintCount - 1 }, (_, i) =>
    `<span class="gsprint" style="left:${scale((i + 1) * S.sprintDays)}%"></span>`).join('');
  $('#gantt').innerHTML = rows +
    `<div class="gaxis"><div></div><div style="position:relative"><div class="gtrack" style="background:transparent">${sprintLines}</div><div class="ticks"><span>Day 0</span><span>Showcase · day ${S.showcaseDay}</span><span>Day ${Math.ceil(maxDay)}</span></div></div></div>`;
}

function metricsBar() {
  if (!sim) { $('#board-metrics').innerHTML = `<div class="bmetric"><span>SHOWCASE</span><strong>Day ${S.showcaseDay}</strong></div><div class="bmetric"><span>BUDGET</span><strong>${money(S.budget)}</strong></div><div class="bmetric"><span>BUG CAP</span><strong>${S.unresolvedBugCap}</strong></div>`; return; }
  $('#board-metrics').innerHTML =
    `<div class="bmetric ${sim.onBudget ? 'good' : 'bad'}"><span>SPENT</span><strong>${money(sim.totalSpend)}</strong></div>
     <div class="bmetric ${sim.withinBugCap ? 'good' : 'bad'}"><span>UNRESOLVED BUGS</span><strong>${sim.unresolvedBugs} / ${S.unresolvedBugCap}</strong></div>
     <div class="bmetric ${sim.demoComplete ? 'good' : ''}"><span>DEMO</span><strong>${sim.demoComplete ? 'Built d' + d1(sim.demoCompleteDay) : (sim.timeline.filter(t => t.status === 'done').length) + '/' + S.demoTasks.length}</strong></div>`;
}

function refresh() {
  renderTeam(); renderKanban(); renderGantt(); metricsBar();
  $('#sprint-label').textContent = `SPRINT ${currentSprint + 1} OF ${S.sprintCount}`;
  $('#cap-note').textContent = `${S.sprintDays}`;
  $('#advance').innerHTML = currentSprint + 1 >= S.sprintCount ? 'Finish & review <span>→</span>' : `Run Sprint ${currentSprint + 1} <span>→</span>`;
  // overload warning
  const used = capacityUsed();
  const over = S.staff.filter(p => used[p.id] > S.sprintDays + 1e-9).map(p => p.name);
  $('#board-error').textContent = over.length ? `Over capacity this sprint: ${over.join(', ')}. Extra work carries into later sprints.` : '';
}

function advance() {
  // Validate: committed tasks need required assignees.
  try {
    simulate(S, plan.slice(0, currentSprint + 1)); // throws on role/QA errors
  } catch (e) { $('#board-error').textContent = e.message; return; }
  if (currentSprint + 1 < S.sprintCount) {
    currentSprint++;
    sim = simulate(S, plan.slice(0, currentSprint)); // results through sprints already run
    refresh();
  } else {
    sim = simulate(S, plan);
    if (sim.demoComplete) { renderEvent(); show('event'); }
    else { renderResult(null); show('result'); }
  }
}

function renderEvent() {
  const ev = S.event;
  $('#event-title').textContent = ev.title;
  $('#event-text').textContent = ev.text;
  $('#event-sub').textContent = `Built on day ${d1(sim.demoCompleteDay)} for ${money(sim.totalSpend)}, with ${sim.unresolvedBugs} unresolved bug${sim.unresolvedBugs === 1 ? '' : 's'}. The showcase is day ${S.showcaseDay}. Any follow-up falls to the tutorial's owner.`;
  $('#event-stand').innerHTML =
    `<div class="metric"><span>Demo built</span><strong class="good">Day ${d1(sim.demoCompleteDay)}</strong></div>
     <div class="metric"><span>Spent</span><strong class="${sim.onBudget ? 'good' : 'bad'}">${money(sim.totalSpend)}</strong></div>
     <div class="metric"><span>Unresolved bugs</span><strong class="${sim.withinBugCap ? 'good' : 'bad'}">${sim.unresolvedBugs} / ${S.unresolvedBugCap}</strong></div>`;
  $('#choices').innerHTML = ev.choices.map(c => {
    const r = resolveEvent(sim, S, c.id, plan);
    return `<button class="choice" data-choice="${c.id}"><strong>${esc(c.title)} <span aria-hidden="true">↗</span></strong><p>${esc(c.description)}</p><div class="choice-meta"><span>+${d1(r.extraDays)} days</span><span>+${money(r.extraCost)}</span><span>Finish day ${d1(r.finishDay)} · ${money(r.spend)}</span></div></button>`;
  }).join('');
  $('#choices').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { renderResult(b.dataset.choice); show('result'); }));
}

function renderResult(choiceId) {
  let r = null, lesson = '', person = null;
  if (choiceId) { r = resolveEvent(sim, S, choiceId, plan); lesson = r.choice.lesson; person = r.person; }
  const finishDay = r ? r.finishDay : (sim.demoCompleteDay || S.showcaseDay);
  const spend = r ? r.spend : sim.totalSpend;
  const onTime = finishDay <= S.showcaseDay + 1e-9;
  const onBudget = spend <= S.budget + 1e-9;
  const bugsOk = sim.withinBugCap;
  const schedText = sim.demoComplete ? (onTime ? 'Shipped within the fixed showcase window.' : 'The demo was not ready by the showcase date.') : 'The demo was never fully built in three sprints.';
  $('#result-content').innerHTML = `
    <div class="result-grid">
      <div class="result-card"><small>01 / SCHEDULE</small><strong class="${onTime && sim.demoComplete ? 'good' : 'bad'}">Day ${d1(finishDay)}</strong><span class="pill">${onTime && sim.demoComplete ? 'ON TIME' : 'MISSED'} · target ${S.showcaseDay}</span><p>${schedText}</p></div>
      <div class="result-card"><small>02 / BUDGET</small><strong class="${onBudget ? 'good' : 'bad'}">${money(spend)}</strong><span class="pill">${onBudget ? 'WITHIN' : 'OVER'} · ${money(S.budget)}</span><p>You paid only for work actually done.</p></div>
      <div class="result-card"><small>03 / QUALITY</small><strong class="${bugsOk ? 'good' : 'bad'}">${sim.unresolvedBugs} bugs</strong><span class="pill">CAP ${S.unresolvedBugCap}</span><p>${bugsOk ? 'Unresolved bugs stayed under the cap.' : 'Over the bug cap: the demo ships at risk.'}</p></div>
      <div class="result-card"><small>04 / VERDICT</small><strong class="${!sim.atRisk && onTime && onBudget ? 'good' : 'bad'}">${!sim.atRisk && onTime && onBudget ? 'Solid' : 'At risk'}</strong><span class="pill">OVERALL</span><p>${!sim.atRisk && onTime && onBudget ? 'A credible showcase build.' : 'One or more targets slipped.'}</p></div>
    </div>
    <div class="lesson">
      <span class="eyebrow">${choiceId ? 'YOUR DECISION · ' + esc(r.choice.title.toUpperCase()) : 'DEMO INCOMPLETE'}</span>
      <h3>The tradeoffs behind the result</h3>
      ${lesson ? `<p>${esc(lesson)}</p>` : ''}
      <p>Cheaper or overloaded developers wrote more bugs; weaker QA let more slip through to the showcase. Every unresolved bug here traces back to a staffing choice you made on the board.</p>
      ${person ? `<p>The follow-up fell to ${esc(person.name)}, adding ${d1(r.extraDays)} days and ${money(r.extraCost)}.</p>` : ''}
      <p><strong>Takeaway:</strong> schedule, budget, and quality trade against each other. Fast-and-cheap staffing wins early days and loses them back in QA and rework.</p>
    </div>`;
}

function resetGame() {
  plan = Array.from({ length: S.sprintCount }, () => ({}));
  currentSprint = 0; sim = null;
  refresh(); show('board');
}

function setupAudio() {
  const bgm = $('#bgm'), muteBtn = $('#mute'), vol = $('#volume');
  if (!bgm) return;
  let lastVol = 0.18;            // quiet by default
  bgm.volume = lastVol;
  vol.value = Math.round(lastVol * 100);
  let started = false;
  // Browsers block autoplay until a user gesture; start on the first interaction.
  const startOnGesture = () => {
    if (started || bgm.muted) return;
    bgm.play().then(() => { started = true; }).catch(() => {});
  };
  document.addEventListener('pointerdown', startOnGesture, { once: false });
  document.addEventListener('keydown', startOnGesture, { once: false });
  vol.addEventListener('input', () => {
    const v = Number(vol.value) / 100;
    bgm.volume = v;
    if (v > 0) { lastVol = v; if (bgm.muted) { bgm.muted = false; muteBtn.textContent = '🔊'; muteBtn.classList.remove('muted'); muteBtn.setAttribute('aria-pressed', 'false'); } }
    startOnGesture();
  });
  muteBtn.addEventListener('click', () => {
    bgm.muted = !bgm.muted;
    muteBtn.textContent = bgm.muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('muted', bgm.muted);
    muteBtn.setAttribute('aria-pressed', String(bgm.muted));
    if (!bgm.muted) { if (bgm.volume === 0) { bgm.volume = lastVol || 0.18; vol.value = Math.round(bgm.volume * 100); } startOnGesture(); }
  });
}

function init() {
  $('#hero-deadline').textContent = `${S.showcaseDay} DAYS`;
  $('#hero-budget').textContent = `${money(S.budget)} BUDGET`;
  $('#brand').addEventListener('click', e => { e.preventDefault(); show('intro'); });
  $('#start').addEventListener('click', () => { refresh(); show('board'); });
  $('#advance').addEventListener('click', advance);
  $('#restart').addEventListener('click', resetGame);
  $('#tab-board').addEventListener('click', () => switchView('board'));
  $('#tab-gantt').addEventListener('click', () => switchView('gantt'));
  setupAudio();
}
function switchView(v) {
  view = v;
  $('#view-board').hidden = v !== 'board';
  $('#view-gantt').hidden = v !== 'gantt';
  $('#tab-board').classList.toggle('active', v === 'board');
  $('#tab-gantt').classList.toggle('active', v === 'gantt');
  $('#tab-board').setAttribute('aria-selected', v === 'board');
  $('#tab-gantt').setAttribute('aria-selected', v === 'gantt');
  if (v === 'gantt') renderGantt();
}
init();
