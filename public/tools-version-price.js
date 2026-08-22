(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const nf = n => Number(n || 0).toLocaleString('en-US');

  async function getJson(url){const r=await fetch(url,{cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||`HTTP ${r.status}`);return d;}

  function addVersionPanel(d){
    const page=document.querySelector('[data-page="miner"]');
    if(!page || document.getElementById('platformVersionPanel')) return;
    const panel=document.createElement('div');panel.id='platformVersionPanel';panel.className='tool-panel';
    const s=d?.sources||{};
    const rows=['android','ios','windows'].map(k=>{const x=s[k]||{};return `<div><small>${k.toUpperCase()}</small><strong>${esc(x.version||'Not detected')}</strong><span>${x.ok?'Official source reachable':'Source unavailable'} · HTTP ${esc(x.http_status??'-')}</span></div>`}).join('');
    const dataset=d?.dataset||{};
    panel.innerHTML=`<h3>Official Platform / BILSX Data Sync</h3><div class="result-grid">${rows}</div><p class="tool-note">BILSX dataset: <b>${esc(dataset.version||'—')}</b> · Items: <b>${nf(dataset.stats?.item_count||0)}</b> · Previous: <b>${esc(dataset.previous_version||'—')}</b></p><p class="tool-note">Store versions are signals; the parsed items.dat dataset remains the canonical item-data fingerprint.</p>`;
    const anchor=page.querySelectorAll('.tool-panel')[0];anchor?.after(panel);
  }

  async function refreshMinerPanel(){
    try{const d=await getJson('/api/growtopia/miner');addVersionPanel(d);}
    catch(e){console.warn('BILSX version monitor:',e);}
  }

  function addPriceProviderHint(){
    const box=$('priceResult');if(!box||document.getElementById('gtidHint'))return;
    if(box.textContent.includes('GTID_PRICE_API_NOT_CONFIGURED') || box.textContent.includes('source is not configured')){
      const hint=document.createElement('div');hint.id='gtidHint';hint.className='tool-note';hint.innerHTML='Provider: <b>GTID</b> · GTID exposes a realtime DL tracker, but its public page does not document a machine-readable item-price endpoint. BILSX will not guess an endpoint; configure <code>GTID_PRICE_API_URL</code> once the endpoint is verified.';box.appendChild(hint);
    }
  }

  window.addEventListener('hashchange',()=>{if(location.hash==='#miner')setTimeout(refreshMinerPanel,300);});
  setTimeout(()=>{if(location.hash==='#miner')refreshMinerPanel();},700);
  const oldFetch=window.fetch; // harmless observer: refresh the explanatory GTID hint after price requests
  window.fetch=async function(...args){const r=await oldFetch.apply(this,args);if(String(args[0]).includes('/api/growtopia/price'))setTimeout(addPriceProviderHint,100);return r;};
})();
