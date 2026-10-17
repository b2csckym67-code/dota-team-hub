(()=>{
'use strict';
const $=id=>document.getElementById(id);
const heroes=()=>window.DOTA_HEROES||[];
const image=h=>window.DOTA_HERO_IMAGE(h?.slug||'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['','Carry','Mid','Offlane','Soft Support','Hard Support'];
let db,teams=[],players=[],pool=[],teamId='',ready=false,busy=false;
const team=()=>teams.find(t=>String(t.id)===String(teamId));
function notify(msg){const n=$('opponent-status');if(n)n.textContent=msg;}
function dbError(result){if(result.error)throw result.error;return result.data||[];}
function options(){
 const opt='<option value="">Kein Gegnerteam</option>'+teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
 for(const id of ['opponent-team-select','draft-opponent-team']){
  const sel=$(id);if(sel){sel.innerHTML=opt;sel.value=teamId||'';}
 }
}
function renderPlayers(){
 $('opponent-player-rows').innerHTML=[1,2,3,4,5].map(pos=>{
  const p=players.find(x=>Number(x.position)===pos);
  return `<label>Pos ${pos} · ${labels[pos]}<input class="opponent-player-name" data-pos="${pos}" maxlength="80" value="${esc(p?.name||'')}" placeholder="Spielername"></label>`;
 }).join('');
 const old=$('opponent-hero-position').value;
 $('opponent-hero-position').innerHTML=[1,2,3,4,5].map(pos=>`<option value="${pos}">Pos ${pos} · ${esc(players.find(x=>Number(x.position)===pos)?.name||'Noch kein Name')}</option>`).join('');
 $('opponent-hero-position').value=old&&Number(old)>=1&&Number(old)<=5?old:'1';
}
function renderHeroGrid(){
 const pos=Number($('opponent-hero-position').value),q=$('opponent-hero-search').value.trim().toLocaleLowerCase('de');
 const selected=new Set(pool.filter(r=>Number(r.position)===pos).map(r=>Number(r.hero_id)));
 $('opponent-hero-grid').innerHTML=heroes().map((h,i)=>({h,id:i+1})).filter(x=>x.h.name.toLocaleLowerCase('de').includes(q)).map(x=>`<button type="button" class="${selected.has(x.id)?'selected':''}" data-opp-hero="${x.id}" aria-pressed="${selected.has(x.id)}" title="${esc(x.h.name)}"><img loading="lazy" src="${image(x.h)}" alt=""><span>${esc(x.h.name)}</span></button>`).join('')||'<p class="hint">Kein Held gefunden.</p>';
}
function renderHeroList(){
 $('opponent-hero-list').innerHTML=[1,2,3,4,5].map(pos=>{
  const p=players.find(x=>Number(x.position)===pos),entries=pool.filter(r=>Number(r.position)===pos);
  return `<section class="opponent-hero-group"><h4>Pos ${pos} · ${esc(p?.name||'Unbekannt')}</h4><div class="opponent-hero-chips">${entries.map(r=>{const h=heroes()[Number(r.hero_id)-1];return `<div class="opponent-hero-chip"><img loading="lazy" src="${image(h)}" alt=""><span>${esc(h?.name||'Unbekannt')}</span><button class="delete-mini" type="button" data-remove-opp="${pos}:${r.hero_id}" aria-label="Held entfernen">×</button></div>`}).join('')||'<span class="hint">Keine Helden eingetragen.</span>'}</div></section>`;
 }).join('');
}
function renderDraftSuggestions(used=window.getDraftUsed?.()||new Set()){
 const target=$('draft-opponent-bans');if(!target)return;
 if(!teamId){target.innerHTML='<p class="hint">Gegnerteam auswählen, um Ban-Vorschläge zu sehen.</p>';return;}
 const grouped=new Map();
 for(const r of pool){const id=Number(r.hero_id);if(used.has(id))continue;
  if(!grouped.has(id))grouped.set(id,new Set());grouped.get(id).add(Number(r.position));
 }
 const ranked=[...grouped.entries()].sort((a,b)=>b[1].size-a[1].size||(heroes()[a[0]-1]?.name||'').localeCompare(heroes()[b[0]-1]?.name||''));
 target.innerHTML=ranked.map(([id,positions])=>{
  const h=heroes()[id-1],names=[...positions].sort().map(pos=>esc(players.find(p=>Number(p.position)===pos)?.name||`Pos ${pos}`)).join(', ');
  return `<div class="opponent-ban-row"><img loading="lazy" src="${image(h)}" alt=""><div class="opponent-ban-text"><strong>${esc(h?.name||'?')}</strong><small>${names}</small></div><span class="ban-count">${positions.size} Spieler</span></div>`;
 }).join('')||'<p class="hint">Keine verfügbaren Helden eingetragen.</p>';
}
function renderAll(){options();renderPlayers();renderHeroGrid();renderHeroList();renderDraftSuggestions();}
async function loadTeams(){
 teams=dbError(await db.from('opponent_teams').select('*').order('name'));
 if(teamId&&!teams.some(t=>String(t.id)===String(teamId)))teamId='';
 options();
}
async function selectTeam(id){
 teamId=teams.some(t=>String(t.id)===String(id))?String(id):'';
 localStorage.setItem('dota-opponent-team',teamId);
 if(!teamId){players=[];pool=[];renderAll();notify('Kein Gegnerteam ausgewählt.');return;}
 const [p,h]=await Promise.all([
  db.from('opponent_players').select('*').eq('team_id',Number(teamId)).order('position'),
  db.from('opponent_heroes').select('*').eq('team_id',Number(teamId)).order('position')
 ]);
 players=dbError(p);pool=dbError(h);
 renderAll();notify('Geladen: '+team()?.name);
}
async function createTeam(){
 const name=$('opponent-team-name').value.trim();
 if(!name||name.length>80){notify('Teamname eingeben (max. 80 Zeichen).');return;}
 if(busy)return;busy=true;
 try{
  const {data,error}=await db.from('opponent_teams').insert({name}).select('id').single();if(error)throw error;
  dbError(await db.from('opponent_players').insert([1,2,3,4,5].map(position=>({team_id:data.id,position,name:''}))));
  await loadTeams();await selectTeam(data.id);$('opponent-team-name').value='';notify('Gegnerteam gespeichert.');
 }catch(e){notify('Anlegen fehlgeschlagen: '+e.message)}finally{busy=false;}
}
async function savePlayers(){
 if(!teamId){notify('Zuerst ein Gegnerteam auswählen.');return;}
 const rows=[...document.querySelectorAll('.opponent-player-name')].map(input=>({team_id:Number(teamId),position:Number(input.dataset.pos),name:input.value.trim()}));
 try{dbError(await db.from('opponent_players').upsert(rows,{onConflict:'team_id,position'}));await selectTeam(teamId);notify('Spielernamen gespeichert.');}catch(e){notify('Speichern fehlgeschlagen: '+e.message)}
}
async function toggleHero(pos,id,removeOnly=false){
 if(!teamId){notify('Zuerst ein Gegnerteam auswählen.');return;}
 if(busy)return;busy=true;
 try{
  const exists=pool.some(r=>Number(r.position)===pos&&Number(r.hero_id)===id);
  if(exists||removeOnly)dbError(await db.from('opponent_heroes').delete().eq('team_id',Number(teamId)).eq('position',pos).eq('hero_id',id));
  else dbError(await db.from('opponent_heroes').insert({team_id:Number(teamId),position:pos,hero_id:id}));
  const response=await db.from('opponent_heroes').select('*').eq('team_id',Number(teamId)).order('position');pool=dbError(response);
  renderHeroGrid();renderHeroList();renderDraftSuggestions();notify('Gegner-Hero-Pool aktualisiert.');
 }catch(e){notify('Held konnte nicht gespeichert werden: '+e.message)}finally{busy=false;}
}
async function deleteTeam(){
 if(!teamId)return notify('Zuerst ein Gegnerteam auswählen.');
 if(!confirm(`Gegnerteam "${team()?.name}" einschließlich Spielern und Helden dauerhaft löschen?`))return;
 try{dbError(await db.from('opponent_teams').delete().eq('id',Number(teamId)));
  teamId='';await loadTeams();await selectTeam('');notify('Gegnerteam gelöscht.');
 }catch(e){notify('Löschen fehlgeschlagen: '+e.message)}
}
async function refresh(){try{await loadTeams();await selectTeam(teamId);notify('Gegnerdaten aktualisiert.')}catch(e){notify('Laden fehlgeschlagen: '+e.message)}}
async function init(){
 db=window.teamDb;
 $('opponent-team-create').onclick=createTeam;
 $('opponent-players-save').onclick=savePlayers;
 $('opponent-team-delete').onclick=deleteTeam;
 $('opponent-team-select').onchange=e=>selectTeam(e.target.value).catch(x=>notify(x.message));
 $('draft-opponent-team').onchange=e=>selectTeam(e.target.value).catch(x=>notify(x.message));
 $('draft-opponent-refresh').onclick=refresh;
 $('draft-go-opponents').onclick=()=>document.querySelector('[data-view="opponents"]')?.click();
 $('opponent-hero-position').onchange=renderHeroGrid;
 $('opponent-hero-search').oninput=renderHeroGrid;
 $('opponent-hero-grid').onclick=e=>{const b=e.target.closest('[data-opp-hero]');if(b)toggleHero(Number($('opponent-hero-position').value),Number(b.dataset.oppHero));};
 $('opponent-hero-list').onclick=e=>{const b=e.target.closest('[data-remove-opp]');if(b){const [pos,id]=b.dataset.removeOpp.split(':').map(Number);toggleHero(pos,id,true)}};
 if(!db){notify('Supabase nicht verbunden.');return;}
 try{await loadTeams();await selectTeam(localStorage.getItem('dota-opponent-team')||'');ready=true;}catch(e){notify('Gegneranalyse nicht verfügbar. SQL-Upgrade v11 prüfen: '+e.message);}
}
window.opponentHub={selectedTeamId:()=>teamId?Number(teamId):null,selectTeam:async id=>{if(!db)return;await loadTeams();await selectTeam(id)},renderDraftSuggestions};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
