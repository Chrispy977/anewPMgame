from pathlib import Path
from playwright.sync_api import sync_playwright

url = 'http://127.0.0.1:8765/'
root = Path(r'C:\Users\chris\Documents\PRIORITIZE')

# Mirror the engine's "fullPlan": a well-staffed path that should finish the demo.
# Sprint 1: core (mara/sana). Sprint 2: levels (mara/sana), art (iris/sana), tutorial (theo/rob).
# Sprint 3: ui (iris/rob), store (dev, no QA).
PLAN = [
    {'core': {'dev': 'mara', 'qa': 'sana'}},
    {'levels': {'dev': 'mara', 'qa': 'sana'}, 'art': {'dev': 'iris', 'qa': 'sana'}, 'tutorial': {'dev': 'theo', 'qa': 'rob'}},
    {'ui': {'dev': 'iris', 'qa': 'rob'}, 'store': {'dev': 'dev'}},
]

def set_sel(page, task, slot, value):
    loc = page.locator(f'select[data-task="{task}"][data-slot="{slot}"]')
    loc.scroll_into_view_if_needed()
    loc.select_option(value)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', headless=True, args=['--disable-gpu'])
    for device in ['desktop', 'mobile']:
        page = browser.new_page(viewport={'width': 1365, 'height': 950} if device == 'desktop' else {'width': 390, 'height': 900}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        page.goto(url, wait_until='domcontentloaded')
        assert page.locator('h1').is_visible()
        assert page.locator('#hero-budget').inner_text() == '$60,000 BUDGET', page.locator('#hero-budget').inner_text()
        # music: quiet by default, mute toggles
        assert page.locator('#volume').input_value() == '18', 'default volume not quiet'
        assert abs(page.evaluate("document.getElementById('bgm').volume") - 0.18) < 0.001, 'bgm volume not 0.18'
        page.locator('#mute').click()
        assert page.evaluate("document.getElementById('bgm').muted") is True, 'mute did not engage'
        page.locator('#mute').click()
        assert page.evaluate("document.getElementById('bgm').muted") is False, 'unmute did not engage'
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'intro overflow'
        page.screenshot(path=str(root / f'v2-{device}-intro.png'), full_page=True)

        page.locator('#start').click()
        # six portraits present
        assert page.locator('.team-strip img').count() == 6, page.locator('.team-strip img').count()
        for s in range(3):
            for task, a in PLAN[s].items():
                set_sel(page, task, 'dev', a['dev'])
                if 'qa' in a:
                    set_sel(page, task, 'qa', a['qa'])
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'board overflow sprint {s+1}'
            if s == 0:
                page.screenshot(path=str(root / f'v2-{device}-board.png'), full_page=True)
            page.locator('#advance').click()
        # after 3 advances we should be on the event screen
        assert page.locator('#event').is_visible(), 'event screen not shown; demo may be incomplete'
        assert page.locator('.choice').count() == 3
        page.screenshot(path=str(root / f'v2-{device}-event.png'), full_page=True)
        page.locator('[data-choice="quick"]').click()
        res = page.locator('#result-content').inner_text()
        for kw in ('SCHEDULE', 'BUDGET', 'QUALITY', 'VERDICT'):
            assert kw in res, f'missing {kw} in result'
        print(device, 'RESULT', ' '.join(res.split())[:200])
        page.screenshot(path=str(root / f'v2-{device}-result.png'), full_page=True)
        assert not errors, errors
        print(device, 'PASS: 3 sprints staffed, demo built, event + debrief, no errors/overflow')
        page.close()

    # Gantt toggle check on desktop, fresh run
    page = browser.new_page(viewport={'width': 1365, 'height': 950})
    page.goto(url, wait_until='domcontentloaded')
    page.locator('#start').click()
    for task, a in PLAN[0].items():
        set_sel(page, task, 'dev', a['dev']); set_sel(page, task, 'qa', a['qa'])
    page.locator('#advance').click()  # run sprint 1 so the timeline has data
    page.locator('#tab-gantt').click()
    assert page.locator('#view-gantt').is_visible() and page.locator('.gantt .grow').count() >= 1, 'gantt empty'
    page.screenshot(path=str(root / 'v2-desktop-gantt.png'), full_page=True)
    print('GANTT PASS: timeline renders bars after a sprint runs')
    page.close()
    browser.close()
