const $ = id => document.getElementById(id);
const nf = n => Number(n || 0).toLocaleString('en-US');
const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const escAttr = esc;

function route() {
  const page = (location.hash || '#home').slice(1);
  const valid = ['home','items','miner','price','dq','level','profit','status','planner'];
  const current = valid.includes(page) ? page : 'home';
  document.querySelectorAll('.tool-page').forEach(el => el.classList.toggle('active', el.dataset.page === current));
  document.querySelectorAll('#toolNav a').forEach(el => el.classList.toggle('active', el.dataset.tool === current));
  if (current === 'status') loadStatus();
  if (current === 'dq') loadDQ();
  if (current === 'miner') loadMiner(false);
}
window.addEventListener('hashchange', route);

async function jsonFetch(url, options) {
  const r = await fetch(url, options);
  let d = null;
  try { d = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d;
}

async function searchItems() {
  const q = $('itemQuery')?.value.trim();
  const box = $('itemResults');
  if (!q || q.length < 2) { box.innerHTML = '<div class="empty-state">Enter at least 2 characters.</div>'; return; }
  box.innerHTML = '<div class="loading-state">Searching item database...</div>';
  try {
    const d = await jsonFetch(`/api/growtopia/items?q=${encodeURIComponent(q)}`);
    if (!d.success || !d.results?.length) { box.innerHTML = '<div class="empty-state">No items found.</div>'; return; }
    box.innerHTML = d.results.map(x => `<article class="item-card">${x.image ? `<img src="${escAttr(x.image)}" alt="${escAttr(x.title)}">` : '<div class="item-placeholder">◈</div>'}<div><h3>${esc(x.title)}</h3><small>ID/Page: ${esc(x.page_id ?? '-')}</small><p>${esc(x.description || 'No description available.')}</p><div class="item-actions">${x.source_url ? `<a class="secondary" href="${escAttr(x.source_url)}" target="_blank" rel="noopener">Wiki</a>` : ''}${x.download_url ? `<a class="primary" href="${escAttr(x.download_url)}" download>Download Image</a>` : ''}</div></div></article>`).join('');
  } catch (e) { box.innerHTML = `<div class="error-state">Item API unavailable: ${esc(e.message)}</div>`; }
}

async function loadMiner(force) {
  const box = $('minerResult');
  if (!box) return;
  box.innerHTML = '<div class="loading-state">Mining official public sources...</div>';
  try {
    const d = await jsonFetch('/api/growtopia/miner' + (force ? '?refresh=1' : ''));
    $('minerUpdated').textContent = `Synced ${new Date(d.generated_at || Date.now()).toLocaleString()}`;
    box.innerHTML = renderMiner(d);
  } catch (e) { box.innerHTML = `<div class="error-state">Miner unavailable: ${esc(e.message)}</div>`; $('minerUpdated').textContent = 'Sync failed'; }
}
function renderMiner(d) {
  const s=d.sources||{}, detail=s.detail||{}, site=s.website||{}, shop=s.shop||{}, errors=d.errors||[];
  const products=Array.isArray(shop.products)?shop.products:[], images=Array.isArray(site.images)?site.images:[], links=Array.isArray(site.links)?site.links:[], forums=Array.isArray(site.forums)?site.forums:[], social=Array.isArray(site.official_social)?site.official_social:[];
  return `<div class="result-title">Official source snapshot</div><div class="result-grid"><div><small>PLAYERS</small><strong>${esc(detail.online_user??'—')}</strong></div><div><small>OFFICIAL LINKS</small><strong>${nf(links.length)}</strong></div><div><small>OFFICIAL IMAGES</small><strong>${nf(images.length)}</strong></div><div><small>SHOP PRODUCTS</small><strong>${nf(products.length)}</strong></div></div><div class="miner-columns"><div><h3>Official website</h3>${site.title?`<p>${esc(site.title)}</p>`:''}${forums.slice(0,5).map(x=>`<a class="miner-link" href="${escAttr(x.url)}" target="_blank" rel="noopener">${esc(x.title||x.url)}</a>`).join('')}${social.slice(0,5).map(x=>`<a class="miner-link" href="${escAttr(x.url)}" target="_blank" rel="noopener">${esc(x.title||x.url)}</a>`).join('')}</div><div><h3>Official shop / new products</h3>${products.length?products.slice(0,20).map(x=>`<div class="miner-product">${esc(x.name)}</div>`).join(''):'<p>No product headings could be parsed from the current shop markup.</p>'}</div><div><h3>Source images</h3><div class="miner-images">${images.slice(0,18).map(u=>`<a href="${escAttr('/api/growtopia/image?url='+encodeURIComponent(u))}" download title="Download image"><img loading="lazy" src="${escAttr(u)}" alt=""></a>`).join('')||'<p>No images parsed.</p>'}</div></div></div>${errors.length?`<div class="error-state">${errors.map(x=>`<div>${esc(x.source)}: ${esc(x.error)}</div>`).join('')}</div>`:''}<p class="tool-note">This is a public-source snapshot. HTML structures can change; BILSX reports parse failures rather than inventing new item/news data.</p>`;
}

async function checkPrice() { const item=$('priceItem')?.value.trim(),box=$('priceResult'); if(!item)return; box.innerHTML='<div class="loading-state">Checking market estimate...</div>'; try{const d=await jsonFetch(`/api/growtopia/price?item=${encodeURIComponent(item)}`); if(d.configured===false||d.error==='PRICE_SOURCE_NOT_CONFIGURED'){box.innerHTML='<div class="empty-state"><strong>Price source is not configured yet.</strong><br><small>The BILSX price engine is ready, but no live community price source has been connected.</small></div>';return;} box.innerHTML=renderPrice(d,item);}catch(e){box.innerHTML=`<div class="error-state">Price engine unavailable: ${esc(e.message)}</div>`;}}
function renderPrice(d,item){const buy=d.buy??d.buy_price??d.buyPrice??d.data?.buy??null,sell=d.sell??d.sell_price??d.sellPrice??d.data?.sell??null,estimate=d.estimate??d.average??d.price??d.data?.price??null,confidence=d.confidence??d.data?.confidence??'Unknown',updated=d.updated_at??d.updatedAt??d.data?.updated_at??null;return `<div class="price-head"><div><small>ITEM</small><h3>${esc(d.item_name||d.name||item)}</h3></div><span class="confidence">${esc(confidence)}</span></div><div class="price-grid"><div><small>BUY</small><strong>${formatPrice(buy)}</strong></div><div><small>SELL</small><strong>${formatPrice(sell)}</strong></div><div><small>ESTIMATE</small><strong>${formatPrice(estimate)}</strong></div></div><p class="tool-note">Market values are community estimates and may change quickly.${updated?` Updated ${esc(updated)}.`:''}</p>`;}
function formatPrice(v){if(v==null||v==='')return'—';if(typeof v==='object'){const a=v.min??v.low,b=v.max??v.high;if(a!=null&&b!=null)return`${nf(a)}–${nf(b)}`;}return esc(typeof v==='number'?nf(v):v);}

async function loadDQ(){const box=$('dqResult');if(!box)return;box.innerHTML='<div class="loading-state">Loading Daily Quest...</div>';try{const d=await jsonFetch('/api/growtopia/dq');if(d.configured===false||d.error==='DAILY_QUEST_SOURCE_NOT_CONFIGURED'){box.innerHTML='<div class="empty-state"><strong>Daily Quest source is not configured yet.</strong><br><small>The BILSX UI and API adapter are ready; connect a reliable quest source to show live data.</small></div>';$('dqUpdated').textContent='Source not configured';return;}$('dqUpdated').textContent=`Updated ${new Date().toLocaleTimeString()}`;box.innerHTML=renderDQ(d);}catch(e){box.innerHTML=`<div class="error-state">Daily Quest unavailable: ${esc(e.message)}</div>`;}}
function renderDQ(d){const title=d.title||d.quest||d.name||d.data?.title||'Daily Quest',items=d.items||d.requirements||d.data?.items||[],total=d.total_cost??d.estimated_cost??d.data?.total_cost??null;if(!Array.isArray(items)||!items.length)return`<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(d.description||d.message||'Quest data returned without item requirements.')}</p></div>`;return`<div class="dq-head"><div><small>QUEST</small><h3>${esc(title)}</h3></div>${total!=null?`<div class="dq-cost"><small>EST. COST</small><strong>${esc(formatPrice(total))}</strong></div>`:''}</div><div class="dq-list">${items.map(x=>`<div><span>${esc(x.name||x.item||x.title||'Item')}</span><strong>×${esc(x.quantity??x.amount??0)}</strong>${x.price!=null?`<small>${esc(formatPrice(x.price))}</small>`:''}</div>`).join('')}</div>`;}

async function loadStatus(){try{const d=await jsonFetch('/api/growtopia/status'),online=Number(d.online??d.online_user??d.playerCount??0),available=d.success!==false,label=!available?'Unavailable':online>0?'Online':'Maintenance / Offline',cls=!available?'offline':online>0?'online':'maintenance';if($('heroOnline'))$('heroOnline').textContent=available?nf(online):'—';if($('heroStatus'))$('heroStatus').textContent=label;if($('statusOnline'))$('statusOnline').textContent=available?nf(online):'—';if($('statusLabel')){$('statusLabel').textContent=label;$('statusLabel').className=cls;}if($('statusTime'))$('statusTime').textContent=new Date().toLocaleTimeString();if($('sideOnline'))$('sideOnline').textContent=available?`${nf(online)} players`:'Status unavailable';if($('statusDetail'))$('statusDetail').innerHTML=`<span class="status-dot ${cls}"></span><strong>${esc(label)}</strong><span>Source: growtopiagame.com/detail via BILSX API</span>`;}catch(e){['heroOnline','statusOnline'].forEach(id=>{if($(id))$(id).textContent='—';});if($('heroStatus'))$('heroStatus').textContent='Status unavailable';if($('statusLabel'))$('statusLabel').textContent='Unavailable';if($('sideOnline'))$('sideOnline').textContent='Status unavailable';if($('statusDetail'))$('statusDetail').innerHTML=`<span class="status-dot offline"></span><strong>Unavailable</strong><span>${esc(e.message)}</span>`;}}

async function calcLevel(){const box=$('levelResult');box.innerHTML='<div class="loading-state">Calculating...</div>';const p=new URLSearchParams({current:$('currentLevel').value,target:$('targetLevel').value,xp:$('currentXp').value,ghostXp:$('ghostXp').value,pack:$('jarPack').value,price:$('jarPrice').value});try{const d=await jsonFetch('/api/growtopia/level?'+p);if(!d.success)throw new Error(d.error||'CALCULATION_FAILED');box.innerHTML=`<div class="result-title">Progression estimate</div><div class="result-grid"><div><small>XP NEEDED</small><strong>${nf(d.xp_needed)}</strong></div><div><small>GHOST JARS</small><strong>${nf(d.ghost_jars)}</strong></div><div><small>PACKS</small><strong>${nf(d.jar_packs)}</strong></div><div><small>EST. COST</small><strong>${d.cost_wl?nf(d.cost_wl)+' WL':'—'}</strong></div></div>`;}catch(e){box.innerHTML=`<div class="error-state">Calculator unavailable: ${esc(e.message)}</div>`;}}
let packRows=[];function addPackItem(name='Item',qty=20,price=0){packRows.push({name,qty,price});renderPackRows();}function renderPackRows(){$('packRows').innerHTML=packRows.map((x,i)=>`<div class="pack-row"><input data-i="${i}" data-k="name" value="${escAttr(x.name)}"><input type="number" data-i="${i}" data-k="qty" value="${x.qty}" min="0"><input type="number" data-i="${i}" data-k="price" value="${x.price}" min="0"><button data-remove="${i}" type="button">×</button></div>`).join('');document.querySelectorAll('#packRows input').forEach(el=>el.oninput=()=>{packRows[+el.dataset.i][el.dataset.k]=el.dataset.k==='name'?el.value:Number(el.value);});document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{packRows.splice(+b.dataset.remove,1);renderPackRows();});}function calcPack(){const packs=Math.max(0,Number($('packCount').value)),cost=packs*Number($('packCost').value),revenue=packRows.reduce((s,x)=>s+packs*Number(x.qty)*Number(x.price),0),profit=revenue-cost,roi=cost?profit/cost*100:0;$('packResult').innerHTML=`<div class="result-grid"><div><small>COST</small><strong>${nf(cost)} WL</strong></div><div><small>REVENUE</small><strong>${nf(revenue)} WL</strong></div><div><small>PROFIT</small><strong>${nf(profit)} WL</strong></div><div><small>ROI</small><strong>${roi.toFixed(2)}%</strong></div></div>`;}
function buildPlanner(){const grid=$('plannerGrid');if(!grid)return;grid.innerHTML='';for(let y=0;y<20;y++)for(let x=0;x<50;x++){const cell=document.createElement('button');cell.type='button';cell.className='planner-cell';cell.title=`${x},${y}`;cell.onclick=()=>cell.classList.toggle('filled');grid.appendChild(cell);}}

$('itemSearch')?.addEventListener('click',searchItems);$('itemQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchItems();});$('minerRefresh')?.addEventListener('click',()=>loadMiner(false));$('minerForce')?.addEventListener('click',()=>loadMiner(true));$('priceSearch')?.addEventListener('click',checkPrice);$('priceItem')?.addEventListener('keydown',e=>{if(e.key==='Enter')checkPrice();});$('dqRefresh')?.addEventListener('click',loadDQ);$('calcLevel')?.addEventListener('click',calcLevel);$('addPackItem')?.addEventListener('click',()=>addPackItem());$('calcPack')?.addEventListener('click',calcPack);$('clearPlanner')?.addEventListener('click',buildPlanner);
[['Surgical Anesthetic',20],['Surgical Antibiotics',20],['Surgical Antiseptic',20],['Surgical Clamp',20],['Surgical Defibrillator',20],['Surgical Lab Kit',20],['Surgical Pins',20],['Surgical Scalpel',20],['Surgical Splint',20],['Surgical Sponge',20],['Surgical Stitches',20],['Surgical Transfusion',20],['Surgical Ultrasound',20],['Surg-E',5]].forEach(x=>addPackItem(x[0],x[1],0));
buildPlanner();route();loadStatus();setInterval(loadStatus,15000);setInterval(()=>{if((location.hash||'#home')==='#miner')loadMiner(false);},300000);
