const $ = s => document.querySelector(s);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let current = [];

function toast(message, bad = false) { const el=$('#toast'); el.textContent=message; el.className=bad?'show bad':'show'; setTimeout(()=>el.className='',2800); }
function render(data) {
  current=data.items; $('#total').textContent=data.total.toLocaleString();
  const active=data.items.filter(x=>x.status==='启用').length; $('#activeCount').textContent=active.toLocaleString(); $('#activeRate').textContent=data.items.length?`${Math.round(active/data.items.length*100)}%`:'0%';
  $('#range').textContent=`显示 1 - ${data.items.length} 条，共 ${data.total.toLocaleString()} 条`;
  $('#rows').innerHTML=data.items.map((x,i)=>`<tr><td><input type="checkbox"></td><td><span class="code">${escapeHtml(x.code)}</span></td><td><div class="company"><span style="--h:${(i*57+205)%360}">${escapeHtml(x.name.slice(0,2))}</span><div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.address)}</small></div></div></td><td><span class="badge ${x.status==='启用'?'on':'off'}"><i></i>${escapeHtml(x.status)}</span></td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.contact)}</td><td>${escapeHtml(x.phone)}</td><td>${escapeHtml(x.taxNumber)}</td><td>${escapeHtml(x.updatedAt)}</td><td><button class="more" data-i="${i}">•••</button></td></tr>`).join('');
}
async function load() { const p=new URLSearchParams({search:$('#search').value,status:$('#status').value}); const r=await fetch(`/api/suppliers?${p}`); if(!r.ok) throw new Error((await r.json()).message); render(await r.json()); }
$('#filter').onclick=()=>load().catch(e=>toast(e.message,true));
$('#search').onkeydown=e=>{if(e.key==='Enter') $('#filter').click()};
$('#sync').onclick=async()=>{const b=$('#sync');b.disabled=true;b.textContent='同步中…';try{const r=await fetch('/api/sync',{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.message);await load();toast(`同步完成，共处理 ${d.count} 条供应商数据`)}catch(e){toast(e.message,true)}finally{b.disabled=false;b.innerHTML='↻&nbsp; 同步数据'}};
$('#export').onclick=()=>{const p=new URLSearchParams({search:$('#search').value,status:$('#status').value});location.href=`/api/export?${p}`;toast('正在生成 Excel 文件')};
load().catch(e=>toast(e.message,true));
