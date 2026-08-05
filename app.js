/* Sixty — one habit, N days.
   Vanilla implementation of the Sixty.dc.html design.
   State lives in localStorage; nothing leaves the device. */
(function () {
  'use strict';

  // Plan config — mirrors the design's editable props.
  var CONFIG = {
    goalDays: 66,      // 14–120
    showPhases: true,
    milestonesOn: true
  };

  var KEY = 'sixty:v2';
  var N = Math.max(14, Math.min(120, isNaN(parseInt(CONFIG.goalDays, 10)) ? 66 : parseInt(CONFIG.goalDays, 10)));

  var PHASE_LABELS = ['Starting', 'Repeating', 'Sticking', 'Automatic'];
  var MILESTONE_TEXTS = [
    'A week in. It’s starting to stick.',
    'The hard middle. Keep the chain going.',
    'Halfway. Automatic from here.'
  ];

  var state = {
    habit: '',
    logged: [],
    justN: 0,
    milestone: 0,
    editing: false,
    stuck: false
  };

  var timers = { just: 0, toast: 0, milestone: 0, pane: 0 };
  var firstRender = true;
  var lastEyebrow = null;
  var cellEls = [];   // index 0 == day 1
  var cellKeys = [];
  var phaseHeadEls = [];
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    navBg: $('navBg'), navLine: $('navLine'), navStat: $('navStat'),
    milestone: $('milestone'), eyebrow: $('eyebrow'),
    committed: $('committed'), habitText: $('habitText'), subCommitted: $('subCommitted'),
    btnMark: $('btnMark'), btnPlan: $('btnPlan'), btnEdit: $('btnEdit'),
    onboard: $('onboard'), subOnboard: $('subOnboard'),
    composerLabel: $('composerLabel'), composerHint: $('composerHint'),
    habitInput: $('habitInput'), btnBegin: $('btnBegin'),
    statDone: $('statDone'), statStreak: $('statStreak'), statBest: $('statBest'), statLeft: $('statLeft'),
    statGoal: $('statGoal'),
    progFill: $('progFill'), progDot: $('progDot'), progA: $('progA'), progB: $('progB'),
    railLit: $('railLit'), sixtyLabel: $('sixtyLabel'), phases: $('phases'),
    pathsLayer: $('pathsLayer'), bandTag: $('bandTag'),
    finish: $('finish'), finishA: $('finishA'), finishLine: $('finishLine'),
    footerNote: $('footerNote'), toast: $('toast')
  };

  /* ---------- persistence ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      state.habit = s.habit || '';
      state.logged = Array.isArray(s.logged) ? s.logged : [];
    } catch (e) { /* first run, or storage blocked */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ habit: state.habit, logged: state.logged }));
    } catch (e) { /* storage blocked — keep running in memory */ }
  }

  /* ---------- derived ---------- */

  function milestoneDays() {
    return [Math.round(N * 0.12), Math.round(N * 0.35), Math.round(N * 0.5)];
  }

  function cuts() {
    return CONFIG.showPhases
      ? [0, Math.round(N * 0.23), Math.round(N * 0.47), Math.round(N * 0.70), N]
      : [0, N];
  }

  function phaseNameFor(n) {
    var c = cuts();
    for (var i = 0; i < c.length - 1; i++) {
      if (n > c[i] && n <= c[i + 1]) return PHASE_LABELS[i] || 'Automatic';
    }
    return 'Automatic';
  }

  /* ---------- actions ---------- */

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.style.transform = 'translate(-50%,0)';
    clearTimeout(timers.toast);
    timers.toast = setTimeout(function () {
      el.toast.style.transform = 'translate(-50%,calc(100% + 3rem))';
    }, 1700);
  }

  function begin() {
    var v = (el.habitInput.value || '').trim();
    if (!v) {
      if (state.editing) { state.editing = false; render(); }
      return;
    }
    var wasEditing = state.editing;
    state.habit = v;
    state.editing = false;
    save();
    render();
    toast(wasEditing ? 'Saved.' : 'Sixty begins.');
  }

  function edit() {
    state.editing = true;
    pendingFocus = true;
    render();
  }

  function toggle(n) {
    var set = new Set(state.logged);
    var wasDone = set.has(n);
    if (wasDone) set.delete(n); else set.add(n);

    var logged = Array.from(set).filter(function (x) { return x >= 1 && x <= N; })
      .sort(function (a, b) { return a - b; });

    var milestone = 0;
    if (!wasDone && CONFIG.milestonesOn !== false && milestoneDays().indexOf(logged.length) !== -1) {
      milestone = logged.length;
    }

    state.logged = logged;
    state.justN = wasDone ? 0 : n;
    state.milestone = milestone;
    save();
    render();

    toast(wasDone ? 'Removed.' : (logged.length >= N ? N + ' for ' + N + '.' : 'Marked.'));

    clearTimeout(timers.just);
    timers.just = setTimeout(function () { state.justN = 0; render(); }, 720);

    if (milestone) {
      clearTimeout(timers.milestone);
      timers.milestone = setTimeout(function () { state.milestone = 0; render(); }, 2600);
    }
  }

  function markToday() {
    var set = new Set(state.logged);
    for (var i = 1; i <= N; i++) {
      if (!set.has(i)) { toggle(i); return; }
    }
  }

  function seePlan() {
    var target = $('sixty');
    if (target) {
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' });
    }
  }

  function reset() {
    state.habit = '';
    state.logged = [];
    state.editing = false;
    state.justN = 0;
    state.milestone = 0;
    save();
    render();
    toast('Cleared.');
  }

  /* ---------- hero panes ----------
     Committing is a handoff, not a swap: the composer leaves before the
     commitment arrives, so one reads as becoming the other. */

  var pendingFocus = false;

  function revealPane(node) {
    if (!node.hidden) return;
    node.hidden = false;
    node.classList.remove('is-entering');
    void node.offsetWidth;              // restart, don't inherit
    node.classList.add('is-entering');
    node.addEventListener('animationend', function drop() {
      node.classList.remove('is-entering');   // don't leave fill-mode holding the pane
      node.removeEventListener('animationend', drop);
    });
    if (pendingFocus && node === el.onboard) {
      pendingFocus = false;
      el.habitInput.focus();
      el.habitInput.setSelectionRange(el.habitInput.value.length, el.habitInput.value.length);
    }
  }

  function syncPanes(showCommitted, initial) {
    var incoming = showCommitted ? el.committed : el.onboard;
    var outgoing = showCommitted ? el.onboard : el.committed;

    if (initial) {
      outgoing.hidden = true;
      incoming.hidden = false;
      return;
    }
    if (!incoming.hidden && outgoing.hidden) return;   // already settled

    clearTimeout(timers.pane);
    if (outgoing.hidden) { revealPane(incoming); return; }

    outgoing.classList.add('is-leaving');
    timers.pane = setTimeout(function () {
      outgoing.hidden = true;
      outgoing.classList.remove('is-leaving');
      revealPane(incoming);
    }, 190);
  }

  /* ---------- cell painting ---------- */

  function cellStyle(done, today, just) {
    var s = 'aspect-ratio:1;min-height:46px;border:0;cursor:pointer;border-radius:10px;' +
      'display:flex;align-items:center;justify-content:center;' +
      "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.8125rem;" +
      'font-variant-numeric:tabular-nums;letter-spacing:.02em;padding:0;' +
      'transition:background 300ms cubic-bezier(.32,.72,0,1),box-shadow 300ms cubic-bezier(.32,.72,0,1),' +
      'color 300ms cubic-bezier(.32,.72,0,1),transform 200ms cubic-bezier(.32,.72,0,1);';

    if (done) {
      s += 'background:rgba(232,224,206,.16);color:#F3F1ED;' +
        'box-shadow:inset 0 0 0 1px rgba(232,224,206,.32),0 0 14px rgba(232,224,206,.16);';
      if (just) s += 'animation:bloom 640ms cubic-bezier(.32,.72,0,1);';
    } else if (today) {
      s += 'background:rgba(232,224,206,.08);color:#E8E0CE;' +
        'box-shadow:inset 0 0 0 1px #E8E0CE,0 0 8px rgba(232,224,206,.14);' +
        'animation:todayGlow 2.8s ease-in-out infinite;';
    } else {
      s += 'background:rgba(243,241,237,.03);color:rgba(243,241,237,.24);' +
        'box-shadow:inset 0 0 0 1px rgba(243,241,237,.07);';
    }
    return s;
  }

  /* ---------- one-time build: the day grid ---------- */

  function buildGrid() {
    var c = cuts();
    var frag = document.createDocumentFragment();

    for (var i = 0; i < c.length - 1; i++) {
      var from = c[i] + 1, to = c[i + 1];

      var block = document.createElement('div');
      block.style.marginBottom = '2.5rem';

      if (CONFIG.showPhases) {
        var head = document.createElement('div');
        head.setAttribute('style', 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:1rem;gap:1rem');

        var label = document.createElement('span');
        label.setAttribute('style', 'font-size:1.0625rem;color:#F3F1ED;letter-spacing:-.01em');
        label.textContent = PHASE_LABELS[i] || '';

        var tag = document.createElement('span');
        tag.setAttribute('style', "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.6875rem;letter-spacing:.1em;text-transform:uppercase;color:#8B8880;white-space:nowrap");

        head.appendChild(label);
        head.appendChild(tag);
        block.appendChild(head);
        phaseHeadEls.push({ tag: tag, from: from, to: to });
      }

      var grid = document.createElement('div');
      grid.setAttribute('style', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:.5rem');

      for (var n = from; n <= to; n++) {
        var btn = document.createElement('button');
        btn.className = 'cell';
        btn.type = 'button';
        btn.textContent = String(n).padStart(2, '0');
        btn.dataset.day = String(n);
        btn.addEventListener('click', onCellClick);
        grid.appendChild(btn);
        cellEls[n] = btn;
        cellKeys[n] = null;
      }

      block.appendChild(grid);
      frag.appendChild(block);
    }

    el.phases.appendChild(frag);
  }

  function onCellClick(e) {
    toggle(parseInt(e.currentTarget.dataset.day, 10));
  }

  /* ---------- one-time build: the drifting path field ---------- */

  function buildPaths() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-380 -190 1064 1065');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('style', 'width:100%;height:100%;display:block');

    [1, -1].forEach(function (position) {
      for (var i = 0; i < 28; i++) {
        var d = 'M-' + (380 - i * 5 * position) + ' -' + (189 + i * 6) +
          'C-' + (380 - i * 5 * position) + ' -' + (189 + i * 6) +
          ' -' + (312 - i * 5 * position) + ' ' + (216 - i * 6) +
          ' ' + (152 - i * 5 * position) + ' ' + (343 - i * 6) +
          'C' + (616 - i * 5 * position) + ' ' + (470 - i * 6) +
          ' ' + (684 - i * 5 * position) + ' ' + (875 - i * 6) +
          ' ' + (684 - i * 5 * position) + ' ' + (875 - i * 6);

        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', String(0.5 + i * 0.04));
        path.setAttribute('style',
          'stroke-opacity:' + (0.05 + i * 0.009) + ';stroke-dasharray:620 380;' +
          'animation:pathDrift ' + (20 + i * 0.8) + 's linear infinite, pathFade ' + (11 + i * 0.5) + 's ease-in-out infinite;' +
          'animation-delay:-' + (i * 0.7) + 's');
        svg.appendChild(path);
      }
    });

    el.pathsLayer.appendChild(svg);
  }

  /* ---------- render ---------- */

  function render() {
    var set = new Set(state.logged);
    var done = state.logged.filter(function (x) { return x >= 1 && x <= N; }).length;

    var current = N;
    for (var i = 1; i <= N; i++) { if (!set.has(i)) { current = i; break; } }

    var finished = done >= N;
    var pct = Math.round(done / N * 1000) / 10;

    var maxL = 0;
    set.forEach(function (x) { if (x <= N && x > maxL) maxL = x; });
    var streak = 0;
    for (var s = maxL; s >= 1; s--) { if (set.has(s)) streak++; else break; }

    var best = 0, run = 0;
    for (var b = 1; b <= N; b++) { if (set.has(b)) { run++; if (run > best) best = run; } else run = 0; }

    var hasHabit = !!state.habit;
    var editing = state.editing;

    // nav
    el.navStat.textContent = done + ' / ' + N;
    el.navBg.style.opacity = state.stuck ? '1' : '0';
    el.navLine.style.opacity = state.stuck ? '1' : '0';

    // milestone halo
    var msDays = milestoneDays();
    var msIndex = msDays.indexOf(state.milestone);
    if (state.milestone > 0 && msIndex !== -1) {
      el.milestone.textContent = MILESTONE_TEXTS[msIndex];
      if (el.milestone.hidden) {
        el.milestone.hidden = false;
        el.milestone.style.animation = 'none';
        void el.milestone.offsetWidth;          // restart the halo
        el.milestone.style.animation = '';
      }
    } else {
      el.milestone.hidden = true;
    }

    // hero
    var eyebrowText = hasHabit
      ? 'Day ' + (finished ? N : current) + ' of ' + N + ' · ' + phaseNameFor(finished ? N : current)
      : N + ' days · one habit';
    if (eyebrowText !== lastEyebrow) {
      el.eyebrow.textContent = eyebrowText;
      if (lastEyebrow !== null) {                 // acknowledge, don't announce
        el.eyebrow.classList.remove('is-ticking');
        void el.eyebrow.offsetWidth;
        el.eyebrow.classList.add('is-ticking');
      }
      lastEyebrow = eyebrowText;
    }

    syncPanes(hasHabit && !editing, firstRender);

    el.habitText.textContent = '“' + state.habit + '”';
    el.subCommitted.textContent = N + ' days to make it automatic. Mark each one — the path lights up behind you.';
    el.subOnboard.textContent = 'Pick one thing worth doing every day. Commit to all ' + N + '. Watch the path light up behind you.';

    el.btnMark.textContent = finished ? ('All ' + N + ' done') : ('Mark day ' + current + ' done');
    el.btnMark.disabled = finished;
    el.btnMark.style.cursor = finished ? 'default' : 'pointer';
    el.btnMark.style.opacity = finished ? '.34' : '';
    el.btnPlan.textContent = 'See all ' + N;

    el.composerLabel.textContent = editing ? 'Change your habit' : 'What will you do every day?';
    el.composerHint.textContent = editing ? 'Enter to save' : 'Enter to begin';
    el.btnBegin.textContent = editing ? 'Save' : 'Begin';

    // stats — padded to two digits, echoing the day-cell numerals
    el.statDone.textContent = String(done).padStart(2, '0');
    el.statGoal.textContent = '/ ' + N;
    el.statStreak.textContent = String(streak).padStart(2, '0');
    el.statBest.textContent = String(best).padStart(2, '0');
    el.statLeft.textContent = String(N - done).padStart(2, '0');

    // progress
    el.progFill.style.width = pct + '%';
    el.progDot.style.left = pct + '%';
    el.progA.textContent = done + ' logged';
    el.progB.textContent = (N - done) + ' to go';
    el.railLit.style.height = pct + '%';
    el.sixtyLabel.textContent = 'The ' + N + ' days';

    // phase headers
    phaseHeadEls.forEach(function (h) {
      var dc = 0;
      for (var n = h.from; n <= h.to; n++) if (set.has(n)) dc++;
      h.tag.textContent = 'Days ' + h.from + '–' + h.to + ' · ' + dc + ' / ' + (h.to - h.from + 1);
    });

    // cells — only repaint the ones whose state actually changed,
    // so the today-glow and bloom animations aren't restarted on every render.
    for (var n = 1; n <= N; n++) {
      var isDone = set.has(n);
      var isToday = (n === current) && !isDone && !finished;
      var isJust = n === state.justN;
      var key = (isDone ? 'd' : '') + (isToday ? 't' : '') + (isJust ? 'j' : '') || '-';
      if (cellKeys[n] !== key) {
        cellKeys[n] = key;
        cellEls[n].setAttribute('style', cellStyle(isDone, isToday, isJust));
        cellEls[n].setAttribute('aria-label', 'Day ' + n + (isDone ? ', done' : ''));
        cellEls[n].setAttribute('aria-pressed', isDone ? 'true' : 'false');
      }
    }

    // band + finish
    el.bandTag.textContent = finished
      ? (N + ' for ' + N)
      : (streak > 1 ? streak + '-day streak · keep going' : 'Keep going');

    el.finish.hidden = !finished;
    el.finishA.textContent = N + ' days.';
    el.finishLine.textContent = '“' + state.habit + '” — ' + N + ' for ' + N + '.';

    el.footerNote.textContent = 'Sixty · one habit, ' + N + ' days';

    // Seed the composer only while it is offstage, so a render triggered by
    // scroll can never wipe what someone is halfway through typing.
    if (el.onboard.hidden) el.habitInput.value = editing ? state.habit : '';

    firstRender = false;
  }

  /* ---------- wiring ---------- */

  el.btnBegin.addEventListener('click', begin);
  el.btnEdit.addEventListener('click', edit);
  el.btnMark.addEventListener('click', markToday);
  el.btnPlan.addEventListener('click', seePlan);
  Array.prototype.forEach.call(document.querySelectorAll('.btn-reset-action'), function (b) {
    b.addEventListener('click', reset);
  });
  el.habitInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); begin(); }
  });
  window.addEventListener('scroll', function () {
    var stuck = window.scrollY > 24;
    if (stuck !== state.stuck) { state.stuck = stuck; render(); }
  }, { passive: true });

  /* ---------- intro ----------
     The full sequence is for the moment you commit — first visit of the
     session, or no habit yet. Coming back to mark a day gets the short arrival. */

  function startIntro() {
    var seen = false;
    try { seen = !!sessionStorage.getItem('sixty:intro'); sessionStorage.setItem('sixty:intro', '1'); } catch (e) {}

    var full = !state.habit || !seen;
    document.body.classList.add('intro');
    if (!full) document.body.classList.add('intro-brief');

    // Retire the intro once it has played, so a later pane swap can't replay it.
    setTimeout(function () {
      document.body.classList.remove('intro', 'intro-brief');
    }, full ? 2000 : 1150);
  }

  load();
  buildPaths();
  buildGrid();
  render();
  startIntro();
})();
