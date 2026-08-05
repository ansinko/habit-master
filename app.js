/* Sixty — one habit, N calendar days.
   Vanilla implementation of the Sixty.dc.html design.

   The challenge is anchored to real days: day 1 is the day you commit,
   day N ends the run no matter what. A missed day stays missed — the
   point is to stand back up, not to rewrite the past. Marking a day
   reveals that day's quote; tapping an already-lit day replays it.
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
  var QUOTES = window.SIXTY_QUOTES || [];

  var state = {
    habit: '',
    logged: [],
    startDay: null,     // 'YYYY-MM-DD' of day 1
    justN: 0,
    milestone: 0,
    editing: false,
    stuck: false
  };

  var timers = { just: 0, toast: 0, milestone: 0, pane: 0, veil: 0 };
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
    habitPathFill: $('habitPathFill'),
    finish: $('finish'), finishA: $('finishA'), finishLine: $('finishLine'),
    footerNote: $('footerNote'), toast: $('toast'),
    quoteVeil: $('quoteVeil'), qDay: $('qDay'), qText: $('qText'), qAttr: $('qAttr'), qNote: $('qNote'),
    qUnmark: $('qUnmark')
  };

  /* ---------- calendar ---------- */

  function dayKeyOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayKey() { return dayKeyOf(new Date()); }
  function daysBetween(aKey, bKey) {
    // parse at local noon so DST shifts can't skew the count
    return Math.round((new Date(bKey + 'T12:00:00') - new Date(aKey + 'T12:00:00')) / 86400000);
  }
  function todayIndex() {
    if (!state.startDay) return 1;
    return daysBetween(state.startDay, todayKey()) + 1;
  }

  /* ---------- persistence ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      state.habit = s.habit || '';
      state.logged = Array.isArray(s.logged) ? s.logged : [];
      state.startDay = s.startDay || null;
      // Migration from the slot model: anchor the calendar so the next
      // unlogged slot is today, preserving everything already marked.
      if (state.habit && !state.startDay) {
        var maxL = 0;
        state.logged.forEach(function (x) { if (x > maxL) maxL = x; });
        var d = new Date(); d.setDate(d.getDate() - maxL);
        state.startDay = dayKeyOf(d);
        save();
      }
    } catch (e) { /* first run, or storage blocked */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ habit: state.habit, logged: state.logged, startDay: state.startDay }));
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

  /* ---------- quote overlay ---------- */

  function quoteFor(n) {
    if (!QUOTES.length) return null;
    return QUOTES[(n - 1) % QUOTES.length];
  }

  var quoteDay = 0;   // day currently shown in the overlay

  function showQuote(n, comeback) {
    var q = quoteFor(n);
    if (!q) return;
    quoteDay = n;
    el.qDay.textContent = 'Day ' + String(n).padStart(2, '0') + ' · ' + N;
    el.qText.textContent = '“' + q.t + '”';
    el.qAttr.textContent = q.a || 'Gary Keller · The ONE Thing';
    el.qNote.hidden = !comeback;
    if (comeback) el.qNote.textContent = 'Yesterday slipped. You came back — that’s the whole game.';
    // undoing a day lives here, so a lit cell can always simply show its quote
    el.qUnmark.hidden = !(isEditable(n) && new Set(state.logged).has(n));
    clearTimeout(timers.veil);          // cancel a hide already in flight
    el.quoteVeil.hidden = false;
    void el.quoteVeil.offsetWidth;
    el.quoteVeil.style.opacity = '1';
    el.quoteVeil.focus();
  }

  function hideQuote() {
    if (el.quoteVeil.hidden) return;
    el.quoteVeil.style.opacity = '0';
    clearTimeout(timers.veil);
    timers.veil = setTimeout(function () { el.quoteVeil.hidden = true; }, 340);
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
    if (!state.startDay) state.startDay = todayKey();   // day 1 is today
    save();
    render();
    toast(wasEditing ? 'Saved.' : 'Sixty begins.');
  }

  function edit() {
    state.editing = true;
    pendingFocus = true;
    render();
  }

  // A day can be toggled while it is today or yesterday (one day of grace
  // for forgotten logging). Older days are history; future days aren't here yet.
  function isEditable(n) {
    var t = todayIndex();
    return t <= N && n >= 1 && n <= N && (n === t || n === t - 1);
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

    if (wasDone) {
      toast('Removed.');
    } else {
      toast(logged.length >= N ? N + ' for ' + N + '.' : 'Day ' + n + ' marked.');
      // the beam passes over the habit name
      el.habitText.classList.remove('habit-flare');
      void el.habitText.offsetWidth;
      el.habitText.classList.add('habit-flare');
      var comeback = n > 1 && !set.has(n - 1) && n === todayIndex();
      showQuote(n, comeback);
    }

    clearTimeout(timers.just);
    timers.just = setTimeout(function () { state.justN = 0; render(); }, 720);

    if (milestone) {
      clearTimeout(timers.milestone);
      timers.milestone = setTimeout(function () { state.milestone = 0; render(); }, 2600);
    }
  }

  function markToday() {
    var t = todayIndex();
    if (t > N) return;
    if (new Set(state.logged).has(t)) showQuote(t, false);   // already marked → read it again
    else toggle(t);
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
    state.startDay = null;
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

  // kind: 'done' | 'today' | 'open' (yesterday's grace) | 'missed' | 'future'
  function cellStyle(kind, just) {
    var s = 'aspect-ratio:1;min-height:54px;border:0;cursor:pointer;border-radius:12px;' +
      'display:flex;align-items:center;justify-content:center;' +
      "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.9375rem;" +
      'font-variant-numeric:tabular-nums;letter-spacing:.02em;padding:0;' +
      'transition:background 300ms cubic-bezier(.32,.72,0,1),box-shadow 300ms cubic-bezier(.32,.72,0,1),' +
      'color 300ms cubic-bezier(.32,.72,0,1),transform 200ms cubic-bezier(.32,.72,0,1);';

    if (kind === 'done') {
      s += 'background:rgba(232,224,206,.22);color:#FFFDF6;font-weight:500;' +
        'box-shadow:inset 0 0 0 1px rgba(232,224,206,.50),0 0 18px rgba(232,224,206,.22);';
      if (just) s += 'animation:bloom 640ms cubic-bezier(.32,.72,0,1);';
    } else if (kind === 'today') {
      s += 'background:rgba(232,224,206,.12);color:#E8E0CE;font-weight:500;' +
        'box-shadow:inset 0 0 0 1px #E8E0CE,0 0 8px rgba(232,224,206,.14);' +
        'animation:todayGlow 2.8s ease-in-out infinite;';
    } else if (kind === 'missed') {
      s += 'background:rgba(243,241,237,.02);color:rgba(243,241,237,.26);' +
        'box-shadow:inset 0 0 0 1px rgba(243,241,237,.07);text-decoration:line-through;';
    } else if (kind === 'future') {
      s += 'background:rgba(243,241,237,.04);color:rgba(243,241,237,.30);' +
        'box-shadow:inset 0 0 0 1px rgba(243,241,237,.09);';
    } else { // open — yesterday, still markable
      s += 'background:rgba(243,241,237,.05);color:rgba(243,241,237,.45);' +
        'box-shadow:inset 0 0 0 1px rgba(243,241,237,.16);';
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
      grid.setAttribute('style', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:.5rem');

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
    var n = parseInt(e.currentTarget.dataset.day, 10);
    var done = new Set(state.logged).has(n);
    if (done) { showQuote(n, false); return; }      // a lit day always shows its quote
    if (isEditable(n)) { toggle(n); return; }
    if (n >= todayIndex()) toast('Not yet — one day at a time.');
    else toast('Day ' + n + ' slipped. Today is what counts.');
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
      for (var i = 0; i < 28; i += 2) {
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
        // drift only — the per-path opacity animation forced a full-area
        // repaint every frame and dragged the page to ~40fps
        path.setAttribute('style',
          'stroke-opacity:' + (0.06 + i * 0.010) + ';stroke-dasharray:620 380;' +
          'animation:pathDrift ' + (20 + i * 0.8) + 's linear infinite;' +
          'animation-delay:-' + (i * 0.7) + 's');
        svg.appendChild(path);
      }
    });

    el.pathsLayer.appendChild(svg);

    // rasterizing the field costs real frames — only animate it on screen
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        var on = entries[0].isIntersecting;
        svg.style.animationPlayState = on ? '' : 'paused';
        Array.prototype.forEach.call(svg.children, function (p) {
          p.style.animationPlayState = on ? 'running' : 'paused';
        });
      }, { rootMargin: '100px' });
      io.observe(el.pathsLayer);
    }
  }

  /* ---------- render ---------- */

  function render() {
    var set = new Set(state.logged);
    var done = state.logged.filter(function (x) { return x >= 1 && x <= N; }).length;

    var t = todayIndex();                 // calendar position, may exceed N
    var ended = state.habit && t > N;     // the run is over, complete or not
    var current = Math.min(Math.max(t, 1), N);
    var todayDone = set.has(current) && !ended;
    var perfect = done >= N;
    var pct = Math.round(done / N * 1000) / 10;
    var timePct = state.habit ? Math.round(Math.min(t, N) / N * 1000) / 10 : 0;

    // streak: consecutive days ending today (or yesterday, if today is still open)
    var streak = 0;
    if (state.habit) {
      var from = Math.min(t, N);
      if (!set.has(from)) from -= 1;
      for (var s = from; s >= 1; s--) { if (set.has(s)) streak++; else break; }
    }
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
    var eyebrowText;
    if (!hasHabit) eyebrowText = N + ' days · one habit';
    else if (ended) eyebrowText = 'Complete · ' + done + ' of ' + N;
    else eyebrowText = 'Day ' + current + ' of ' + N + ' · ' + phaseNameFor(current);
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

    // the habit carries the light: dim hanging quote marks, warm lit text
    if (el.habitText.dataset.habit !== state.habit) {
      el.habitText.dataset.habit = state.habit;
      el.habitText.textContent = '';
      var mark1 = document.createElement('span');
      mark1.setAttribute('style', 'color:rgba(232,224,206,.42);text-shadow:none');
      mark1.textContent = '“';
      var mark2 = document.createElement('span');
      mark2.setAttribute('style', 'color:rgba(232,224,206,.42);text-shadow:none');
      mark2.textContent = '”';
      el.habitText.appendChild(mark1);
      el.habitText.appendChild(document.createTextNode(state.habit));
      el.habitText.appendChild(mark2);
    }
    el.habitPathFill.style.width = pct + '%';
    el.subCommitted.textContent = ended
      ? 'The ' + N + ' days are up. Take a look at the run, then start another when you’re ready.'
      : N + ' days to make it automatic. Mark each day and the path behind you lights up.';
    el.subOnboard.textContent = 'Pick one thing worth doing every day and commit to it for ' + N + ' days. The path behind you lights up as you go.';

    if (ended) {
      el.btnMark.textContent = perfect ? ('All ' + N + ' done') : ('Sixty complete');
      el.btnMark.disabled = true;
    } else if (todayDone) {
      el.btnMark.textContent = 'Read today’s quote';
      el.btnMark.disabled = false;
    } else {
      el.btnMark.textContent = 'Mark day ' + current + ' done';
      el.btnMark.disabled = false;
    }
    el.btnMark.style.cursor = el.btnMark.disabled ? 'default' : 'pointer';
    el.btnMark.style.opacity = el.btnMark.disabled ? '.34' : '';
    el.btnPlan.textContent = 'See all ' + N;

    el.composerLabel.textContent = editing ? 'Change your habit' : 'What will you do every day?';
    el.composerHint.textContent = editing ? 'Enter to save' : 'Enter to begin';
    el.btnBegin.textContent = editing ? 'Save' : 'Begin';

    // stats — padded to two digits, echoing the day-cell numerals
    el.statDone.textContent = String(done).padStart(2, '0');
    el.statGoal.textContent = '/ ' + N;
    el.statStreak.textContent = String(streak).padStart(2, '0');
    el.statBest.textContent = String(best).padStart(2, '0');
    var left = hasHabit ? Math.max(0, N - Math.min(t, N + 1) + (todayDone || ended ? 0 : 1)) : N;
    el.statLeft.textContent = String(left).padStart(2, '0');

    // progress — the fill is the light you made; the dot is where you stand in time
    el.progFill.style.width = pct + '%';
    el.progDot.style.left = timePct + '%';
    el.progA.textContent = done + ' logged';
    el.progB.textContent = ended ? 'complete' : (hasHabit ? 'day ' + current + ' of ' + N : N + ' to go');
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
      var kind;
      if (isDone) kind = 'done';
      else if (!hasHabit) kind = 'future';
      else if (ended) kind = 'missed';
      else if (n === t) kind = 'today';
      else if (n === t - 1) kind = 'open';
      else if (n < t) kind = 'missed';
      else kind = 'future';

      var isJust = n === state.justN;
      var key = kind + (isJust ? '+j' : '');
      if (cellKeys[n] !== key) {
        cellKeys[n] = key;
        cellEls[n].setAttribute('style', cellStyle(kind, isJust));
        cellEls[n].classList.toggle('cell-inert', kind === 'missed' || kind === 'future');
        var aria = 'Day ' + n;
        if (kind === 'done') aria += ', done — tap to read the quote';
        else if (kind === 'today') aria += ', today';
        else if (kind === 'open') aria += ', yesterday — still open';
        else if (kind === 'missed') aria += ', missed';
        cellEls[n].setAttribute('aria-label', aria);
        cellEls[n].setAttribute('aria-pressed', isDone ? 'true' : 'false');
      }
    }

    // band + finish
    el.bandTag.textContent = ended
      ? (perfect ? (N + ' for ' + N) : (done + ' of ' + N + ' · you kept showing up'))
      : (streak > 1 ? streak + '-day streak · keep going' : 'Keep going');

    el.finish.hidden = !ended;
    el.finishA.textContent = N + ' days.';
    el.finishLine.textContent = perfect
      ? '“' + state.habit + '” — ' + N + ' for ' + N + '.'
      : '“' + state.habit + '” — you showed up ' + done + ' of ' + N + ' days. Missed days don’t erase the ones you made.';

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
  el.quoteVeil.addEventListener('click', hideQuote);
  el.qUnmark.addEventListener('click', function (e) {
    e.stopPropagation();
    var n = quoteDay;
    hideQuote();
    if (n && isEditable(n) && new Set(state.logged).has(n)) toggle(n);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideQuote();
  });
  window.addEventListener('scroll', function () {
    var stuck = window.scrollY > 24;
    if (stuck !== state.stuck) { state.stuck = stuck; render(); }
  }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();       // catch the midnight rollover
  });

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
