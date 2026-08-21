(() => {
  async function refreshNews() {
    if ((location.hash || '#home') !== '#miner') return;
    const box = document.getElementById('minerResult');
    if (!box) return;
    try {
      const r = await fetch('/api/growtopia/miner');
      const d = await r.json();
      const news = d?.sources?.forums?.news || [];
      if (!news.length) return;
      let section = document.getElementById('minerNews');
      if (!section) {
        section = document.createElement('div');
        section.id = 'minerNews';
        section.className = 'miner-news';
        box.appendChild(section);
      }
      section.innerHTML = `<h3>Official / forum news signals</h3>${news.slice(0,12).map(x => `<a class="miner-link" href="${String(x.url).replace(/"/g,'&quot;')}" target="_blank" rel="noopener">${String(x.title || x.url).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</a>`).join('')}`;
    } catch (_) {}
  }
  window.addEventListener('hashchange', refreshNews);
  setInterval(refreshNews, 300000);
  setTimeout(refreshNews, 1200);
})();
