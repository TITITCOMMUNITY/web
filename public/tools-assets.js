(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const nf = n => Number(n||0).toLocaleString('en-US');
  const escAttr = esc;
  function jsonFetch(url,options){return fetch(url,options).then(async r=>{let d=null;try{d=await r.json()}catch(_){}if(!r.ok)throw Error(d?.error||`HTTP ${r.status}`);return d;});}

  async function cropTexture(url,x,y,w=32,h=32){
    if(!url)return null;
    const r=await fetch(url,{mode:'cors',cache:'force-cache'}); if(!r.ok)throw Error(`TEXTURE_HTTP_${r.status}`);
    const bmp=await createImageBitmap(await r.blob());
    if(x<0||y<0||x+w>bmp.width||y+h>bmp.height)throw Error('SPRITE_OUT_OF_BOUNDS');
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(bmp,x,y,w,h,0,0,w,h);
    return new Promise(resolve=>c.toBlob(b=>resolve(b),'image/png'));
  }
  function blobUrl(blob){return blob?URL.createObjectURL(blob):null;}

  async function enhancedSearch(){
    const q=$('itemQuery')?.value.trim(),box=$('itemResults'); if(!q||q.length<2){box.innerHTML='<div class="empty-state">Enter at least 2 characters.</div>';return;}
    box.innerHTML='<div class="loading-state">Searching items.dat and decoding sprite textures...</div>';
    try{
      const d=await jsonFetch(`/api/growtopia/items?q=${encodeURIComponent(q)}`);
      if(!d.success||!d.results?.length){box.innerHTML='<div class="empty-state">No items found in the decoded dataset.</div>';return;}
      box.innerHTML=`<div class="tool-note">Source: <b>${esc(d.source||'decoded items.dat')}</b> · Version: <b>${esc(d.version||'latest')}</b> · ${nf(d.results.length)} matches</div>`+d.results.map((x,i)=>`<article class="item-card"><div class="item-image-wrap" id="sprite-${i}">${x.image?`<img loading="lazy" src="${escAttr(x.image)}" alt="${escAttr(x.title)}">`:'<div class="item-placeholder">◈</div>'}</div><div><h3>${esc(x.title)}</h3><small>ID: ${esc(x.id??'-')} · Type: ${esc(x.type??'-')} · Texture: ${esc(x.file_name||'-')} · X/Y: ${esc(x.tex_x)}/${esc(x.tex_y)}</small><p>${esc(x.description||'No description available.')}</p><div class="item-actions">${x.source_url?`<a class="secondary" href="${escAttr(x.source_url)}" target="_blank" rel="noopener">Wiki</a>`:''}${x.texture_download_url?`<a class="secondary" href="${escAttr(x.texture_download_url)}" target="_blank" rel="noopener">Texture</a>`:''}<a class="primary" href="#" data-sprite-download="${i}">Download Sprite</a></div></div></article>`).join('');
      for(let i=0;i<d.results.length;i++){
        const x=d.results[i];
        if(!x.texture_url)continue;
        try{const blob=await cropTexture(x.texture_url,Number(x.tex_x)||0,Number(x.tex_y)||0,32,32);const u=blobUrl(blob),wrap=$(`sprite-${i}`);if(wrap){wrap.innerHTML=`<img loading="lazy" src="${u}" alt="${escAttr(x.title)}" style="image-rendering:pixelated;width:64px;height:64px;object-fit:contain">`;wrap.dataset.downloadUrl=u;wrap.dataset.fileName=(x.title||'item').replace(/[^a-z0-9_-]+/gi,'_')+'.png';}}
        catch(_){/* Keep Wiki fallback if decoded texture is missing. */}
      }
      box.querySelectorAll('[data-sprite-download]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const wrap=$(`sprite-${a.dataset.spriteDownload}`);const u=wrap?.dataset.downloadUrl;if(!u)return;const dl=document.createElement('a');dl.href=u;dl.download=wrap.dataset.fileName||'item.png';dl.click();}));
    }catch(e){box.innerHTML=`<div class="error-state">Item API unavailable: ${esc(e.message)}</div>`;}
  }

  function replaceControls(){
    const btn=$('itemSearch'),input=$('itemQuery');
    if(btn){const clone=btn.cloneNode(true);btn.replaceWith(clone);clone.addEventListener('click',enhancedSearch);}
    if(input){const clone=input.cloneNode(true);input.replaceWith(clone);clone.addEventListener('keydown',e=>{if(e.key==='Enter')enhancedSearch();});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',replaceControls);else replaceControls();
})();
