(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const escAttr = esc;
  const proxy = (url, download = false, name = 'growtopia-image.png') => url ? `/api/growtopia/image?url=${encodeURIComponent(url)}${download ? `&download=1&name=${encodeURIComponent(name)}` : ''}` : '';
  const states = new Map();
  let results = [];

  function card(x, i) {
    const fallback = x.image ? proxy(x.image) : '';
    return `<article class="item-card" data-item-index="${i}">
      <div class="item-art-wrap">
        ${x.texture_url ? `<img class="item-sprite" id="bilsxSprite${i}" loading="lazy" src="${fallback}" alt="${escAttr(x.title)}">` : (fallback ? `<img class="item-sprite" id="bilsxSprite${i}" loading="lazy" src="${fallback}" alt="${escAttr(x.title)}">` : '<div class="item-placeholder">◈</div>')}
        ${x.texture_url ? `<span class="sprite-status" id="bilsxSpriteStatus${i}">Loading sprite…</span>` : ''}
      </div>
      <div class="item-main">
        <h3>${esc(x.title)}</h3>
        <small>ID: ${esc(x.id ?? '-')} · Type: ${esc(x.type ?? '-')} · File: ${esc(x.file_name || '-')}</small>
        <p>${esc(x.description || 'No description available.')}</p>
        <div class="item-meta">Texture: ${esc(x.file_name || '—')} · X: ${esc(x.tex_x ?? 0)} · Y: ${esc(x.tex_y ?? 0)} · Sprite 32×32</div>
        <div class="item-actions">
          ${x.source_url ? `<a class="secondary" href="${escAttr(x.source_url)}" target="_blank" rel="noopener">Wiki</a>` : ''}
          ${x.texture_url ? `<button class="primary bilsx-download" data-index="${i}" type="button">Download Sprite</button>` : (x.image ? `<a class="primary" href="${escAttr(proxy(x.image,true,`${x.title || 'item'}.png`))}" download>Download Image</a>` : '<span class="tool-note">No artwork available</span>')}
        </div>
      </div>
    </article>`;
  }

  async function decodeSprite(x, i) {
    if (!x.texture_url) return;
    const img = $(`bilsxSprite${i}`), status = $(`bilsxSpriteStatus${i}`);
    if (!img) return;
    try {
      const image = new Image(); image.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = proxy(x.texture_url); });
      const sx = Math.max(0, Number(x.tex_x) || 0), sy = Math.max(0, Number(x.tex_y) || 0);
      if (sx + 32 > image.naturalWidth || sy + 32 > image.naturalHeight) throw new Error('SPRITE_COORDINATES_OUT_OF_RANGE');
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      canvas.getContext('2d').drawImage(image, sx, sy, 32, 32, 0, 0, 32, 32);
      states.set(i, {canvas, name:`${String(x.title || 'item').replace(/[^a-zA-Z0-9._-]/g,'_')}_${x.id ?? i}.png`});
      img.src = canvas.toDataURL('image/png'); img.classList.add('decoded-sprite');
      if (status) status.textContent = 'items.dat sprite';
    } catch (e) {
      if (status) status.textContent = 'Sprite unavailable';
      if (x.image) img.src = proxy(x.image);
      console.warn('[BILSX] sprite decode failed:', x.title, e);
    }
  }

  async function download(i) {
    const x = results[i]; if (!x) return;
    try {
      const state = states.get(i);
      const blob = state?.canvas ? await new Promise(resolve => state.canvas.toBlob(resolve, 'image/png')) : x.image ? await (await fetch(proxy(x.image))).blob() : null;
      if (!blob) throw new Error('IMAGE_NOT_AVAILABLE');
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = state?.name || `${String(x.title || 'item').replace(/[^a-zA-Z0-9._-]/g,'_')}_${x.id ?? i}.png`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) { alert(`Gagal download sprite: ${e.message}`); }
  }

  async function search() {
    const q = $('itemQuery')?.value.trim(), box = $('itemResults');
    if (!q || q.length < 2) { box.innerHTML = '<div class="empty-state">Enter at least 2 characters.</div>'; return; }
    box.innerHTML = '<div class="loading-state">Searching decoded items.dat and loading sprites...</div>';
    try {
      const r = await fetch(`/api/growtopia/items?q=${encodeURIComponent(q)}`, {cache:'no-store'}), d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
      results = Array.isArray(d.results) ? d.results : [];
      if (!results.length) { box.innerHTML = '<div class="empty-state">No items found in the decoded dataset.</div>'; return; }
      states.clear();
      box.innerHTML = `<div class="tool-note">Source: <b>${esc(d.source || 'items.dat')}</b> · Version: <b>${esc(d.version || 'latest')}</b> · ${results.length} matches</div>` + results.map(card).join('');
      document.querySelectorAll('.bilsx-download').forEach(b => b.addEventListener('click', () => download(Number(b.dataset.index))));
      await Promise.all(results.map((x,i) => decodeSprite(x,i)));
    } catch (e) { box.innerHTML = `<div class="error-state">Item Browser unavailable: ${esc(e.message)}</div>`; }
  }

  function install() {
    const old = $('itemSearch'); if (!old) return;
    const fresh = old.cloneNode(true); old.replaceWith(fresh); fresh.addEventListener('click', search);
    const input = $('itemQuery');
    if (input) { const freshInput = input.cloneNode(true); input.replaceWith(freshInput); freshInput.addEventListener('keydown', e => { if (e.key === 'Enter') search(); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
