'use strict';
const assert = require('node:assert/strict');
const { simulate, resolveEvent } = require('./engine.js');
const scenario = require('../data/scenario.js');
let count = 0, pass = 0;
function test(name, fn) { count++; try { fn(); pass++; console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; } }

// A plan is an array (one entry per sprint) of { taskId: { dev: staffId, qa?: staffId } }.
// store has needsQA:false so it takes no qa.
function fullPlan() {
  return [
    { core: { dev: 'mara', qa: 'sana' } },
    { levels: { dev: 'mara', qa: 'sana' }, art: { dev: 'iris', qa: 'sana' }, tutorial: { dev: 'theo', qa: 'rob' } },
    { ui: { dev: 'iris', qa: 'rob' }, store: { dev: 'dev' } }
  ];
}

test('simulate returns per-sprint history and task timeline', () => {
  const r = simulate(scenario, fullPlan());
  assert.equal(r.sprints.length, 3);
  assert.ok(Array.isArray(r.timeline));
  assert.ok(r.timeline.find(t => t.taskId === 'core'));
});

test('rejects assigning the wrong role to a task', () => {
  assert.throws(() => simulate(scenario, [{ core: { dev: 'iris', qa: 'sana' } }]), /role/i); // iris is an artist
});

test('rejects a non-QA person in the qa slot', () => {
  assert.throws(() => simulate(scenario, [{ core: { dev: 'mara', qa: 'mara' } }]), /qa/i);
});

test('rejects a needsQA task with no qa assignee', () => {
  assert.throws(() => simulate(scenario, [{ core: { dev: 'mara' } }]), /qa/i);
});

test('a task cannot be done before its dependency is done', () => {
  const r = simulate(scenario, [{ levels: { dev: 'mara', qa: 'sana' } }]); // core never built
  const levels = r.timeline.find(t => t.taskId === 'levels');
  assert.ok(!levels || levels.status !== 'done', 'levels cannot be done without core');
});

test('a person cannot exceed sprint capacity in one sprint', () => {
  const r = simulate(scenario, [{ core: { dev: 'mara', qa: 'sana' } }]);
  const s1 = r.sprints[0];
  const mara = s1.personDays.find(p => p.staffId === 'mara');
  assert.ok(mara.days <= scenario.sprintDays + 1e-9, 'mara worked more than one sprint of days: ' + mara.days);
});

test('cost counts only actual days worked, not idle capacity', () => {
  const r = simulate(scenario, [{ store: { dev: 'dev' } }]); // one cheap task, rest idle
  assert.ok(r.totalSpend < 3000, 'idle people were charged: ' + r.totalSpend);
});

test('a sloppy developer generates more bugs than a careful one', () => {
  const careful = simulate(scenario, [{ core: { dev: 'mara', qa: 'sana' } }, {}, {}]);
  const sloppy = simulate(scenario, [{ core: { dev: 'theo', qa: 'sana' } }, {}, {}]);
  const cb = careful.timeline.find(t => t.taskId === 'core').totalBugs;
  const sb = sloppy.timeline.find(t => t.taskId === 'core').totalBugs;
  assert.ok(sb > cb, `expected theo(${sb}) > mara(${cb})`);
});

test('a weaker QA leaves more unresolved bugs than a thorough QA', () => {
  const thorough = simulate(scenario, [{ core: { dev: 'theo', qa: 'sana' } }, {}, {}]);
  const weak = simulate(scenario, [{ core: { dev: 'theo', qa: 'rob' } }, {}, {}]);
  const tu = thorough.timeline.find(t => t.taskId === 'core').unresolvedBugs;
  const wu = weak.timeline.find(t => t.taskId === 'core').unresolvedBugs;
  assert.ok(wu > tu, `expected rob(${wu}) > sana(${tu}) unresolved`);
});

test('bugs found create rework that pushes the task end past dev-complete', () => {
  const r = simulate(scenario, [{ core: { dev: 'theo', qa: 'sana' } }, {}, {}]);
  const core = r.timeline.find(t => t.taskId === 'core');
  assert.ok(core.reworkDays > 0, 'expected rework days from found bugs');
  assert.ok(core.end > core.devEnd, 'task end should be after dev-complete due to QA+rework');
});

test('deterministic: identical plans yield identical results', () => {
  assert.equal(JSON.stringify(simulate(scenario, fullPlan())), JSON.stringify(simulate(scenario, fullPlan())));
});

test('a well-staffed plan finishes the demo by showcase, within budget and bug cap', () => {
  const r = simulate(scenario, fullPlan());
  assert.equal(r.demoComplete, true, 'demo not complete');
  assert.ok(r.demoCompleteDay <= scenario.showcaseDay + 1e-9, 'demo late: day ' + r.demoCompleteDay);
  assert.ok(r.totalSpend <= scenario.budget + 1e-9, 'over budget: ' + r.totalSpend);
  assert.ok(r.unresolvedBugs <= scenario.unresolvedBugCap, 'over bug cap: ' + r.unresolvedBugs);
  assert.equal(r.atRisk, false);
});

test('the sloppiest staffing blows the bug cap or misses the demo', () => {
  const sloppy = [
    { core: { dev: 'theo', qa: 'rob' } },
    { levels: { dev: 'theo', qa: 'rob' }, art: { dev: 'dev', qa: 'rob' }, tutorial: { dev: 'theo', qa: 'rob' } },
    { ui: { dev: 'dev', qa: 'rob' } }
  ];
  const r = simulate(scenario, sloppy);
  assert.ok(r.unresolvedBugs > scenario.unresolvedBugCap || !r.demoComplete || r.atRisk === true);
});

test('resolveEvent offers three distinct, ordered outcomes', () => {
  const r = simulate(scenario, fullPlan());
  const full = resolveEvent(r, scenario, 'full', fullPlan());
  const quick = resolveEvent(r, scenario, 'quick', fullPlan());
  const defer = resolveEvent(r, scenario, 'defer', fullPlan());
  assert.ok(full.extraDays > quick.extraDays && quick.extraDays > defer.extraDays);
  assert.equal(defer.extraDays, 0);
  assert.throws(() => resolveEvent(r, scenario, 'nope', fullPlan()), /choice/i);
});

process.on('exit', () => console.log(`\n${pass}/${count} tests passed`));
