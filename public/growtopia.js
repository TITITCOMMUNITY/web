const $ = (id) => document.getElementById(id);

async function loadStatus(){
  try{
    const r=await fetch('/api/growtopia/status',{cache:'no-store'}); const d=await r.json();
    if(!d.success){$('online').textContent='Unavailable';$('status').textContent='⚪ Server status unavailable';$('status').className='gt-status off';return;}
    $('online').textContent=Number(d.online).toLocaleString('en-US');
    $('status').textContent=d.online>0?'🟢 Online':'🟠 Maintenance / Empty';
    $('status').className='gt-status '+(d.online>0?'ok':'warn');
    $('updated').textContent='Updated '+new Date(d.updated_at||Date.now()).toLocaleTimeString();
  }catch{$('online').textContent='Unavailable';$('status').textContent='⚪ Request failed';$('status').className='gt-status off';}
}
async function searchItems(){
  const q=$('itemQuery').value.trim(); if(q.length<2){$('results').innerHTML='<p class="gt-muted">Enter at least 2 characters.</p>';return;}
  $('results').innerHTML='<p class="gt-muted">Searching…</p>';
  try{const r=await fetch('/api/growtopia/items?q='+encodeURIComponent(q));const d=await r.json();if(!d.success||!d.results?.length){$('results').innerHTML='<p class="gt-muted">No results.</p>';return;}$('results').innerHTML=d.results.map(x=>`<div class="gt-item"><strong>${escapeHtml(x.title)}</strong><br><span class="gt-muted">${escapeHtml(x.snippet||'')}</span><br><a href="${x.url}" target="_blank" rel="noopener">Open Wiki →</a></div>`).join('');}catch{$('results').innerHTML='<p class="gt-muted">Search failed.</p>';}
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
$('searchBtn').addEventListener('click',searchItems);$('itemQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchItems();});
loadStatus();setInterval(loadStatus,15000);
