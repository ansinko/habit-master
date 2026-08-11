/* Zoznam uzavretých behov. Všetky čísla sú odvodené — nič sa neukladá. */
import { loadHistory } from './store.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatRange(startDate, endedAt) {
  const fmt = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('sk-SK', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return endedAt ? `${fmt(startDate)} – ${fmt(endedAt)}` : fmt(startDate);
}

export async function renderHistory(node) {
  let runs;
  try {
    runs = await loadHistory();
  } catch {
    node.innerHTML = '<p class="hist-empty">Históriu sa nepodarilo načítať.</p>';
    return;
  }

  if (!runs.length) {
    node.innerHTML = '<p class="hist-empty">Zatiaľ žiadny uzavretý beh. Prvý pribudne, keď začneš ďalšiu výzvu.</p>';
    return;
  }

  node.innerHTML = runs.map((r) => {
    const pct = r.goalDays > 0 ? Math.round((r.daysDone / r.goalDays) * 100) : 0;
    const label = r.status === 'finished' ? 'dokončený' : 'ukončený predčasne';
    return `
      <article class="hist-row">
        <div class="hist-main">
          <h3 class="hist-name">${escapeHtml(r.habitName)}</h3>
          <p class="hist-meta">${formatRange(r.startDate, r.endedAt)} · ${label}</p>
        </div>
        <div class="hist-score">
          <span class="hist-count">${r.daysDone}/${r.goalDays}</span>
          <span class="hist-pct">${pct}%</span>
        </div>
      </article>`;
  }).join('');
}
