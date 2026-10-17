(()=>{
'use strict';
// 7.40+ Captains Mode: first/second are pick priority, not Radiant/Dire.
const order=[
['first','ban'],['first','ban'],['second','ban'],['second','ban'],['first','ban'],['second','ban'],['second','ban'],
['first','pick'],['second','pick'],
['first','ban'],['first','ban'],['second','ban'],
['second','pick'],['first','pick'],['first','pick'],['second','pick'],['second','pick'],['first','pick'],
['first','ban'],['second','ban'],['first','ban'],['second','ban'],
['first','pick'],['second','pick']
];
const el=id=>document.getElementById(id), state={actions:[],side:'first',busy:false,loaded:false};
const H=()=>window.DOTA_HEROES||[],img=h=>window.DOTA_HERO_IMAGE(h?.slug||''), hById=id=>H()[id-1];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>window.teamDb||window.supabase?.createClient(window.TEAM_CONFIG.SUPABASE_URL,window.TEAM_CONFIG.SUPABASE_PUBLISHABLE_KEY);
let db;
function notice(s){const n=el('notice');n.textContent=s;n.classList.remove('hidden');clearTimeout(notice.t);notice.t=setTimeout(()=>n.classList.add('hidden'),6500)}
function used(){return new Set(state.actions.map(x=>Number(x.hero_id)))}
function next(){return order[state.actions.length]}
function our(t){return t===state.side}
function slot(a){const h=hById(a.hero_id);return `<div class="draft-tile"><img src="${img(h)}" alt=""><span>${esc(h?.name||'Unbekannt')}</span></div>`}
// Compact two-sided hero strip, with pick portraits and seven ban portraits per team.
function renderOverview(actions, side, active=false){
 const buckets={our:{pick:[],ban:[]},their:{pick:[],ban:[]}};
 for(const a of actions){
  const step=order[Number(a.turn_number)-1];
  if(!step)continue;
  buckets[step[0]===side?'our':'their'][step[1]].push(a);
 }
 const upcoming=active?order[actions.length]:null;
 const upcomingTeam=upcoming?(upcoming[0]===side?'our':'their'):null;
 const upcomingType=upcoming?.[1]==='ban'?'Ban':'Pick';
 const portrait=(a,type,i,teamKey)=>{
  const isCurrent=!a&&active&&teamKey===upcomingTeam&&type===upcomingType&&i===actions.filter(x=>{const st=order[Number(x.turn_number)-1];return st&&st[0]===upcoming[0]&&st[1]===upcoming[1]}).length;
  const ban=type==='Ban',code=(ban?'B':'P')+(i+1);
  if(!a)return `<div class="overview-slot empty ${ban?'ban':''} ${isCurrent?'current':''}" aria-label="${type} ${i+1} noch offen"><span class="overview-slot-index">${code}</span></div>`;
  const h=hById(a.hero_id);
  return `<div class="overview-slot filled ${ban?'ban':''}" title="${esc(h?.name||'Unbekannt')} · ${type} ${i+1}"><img loading="lazy" src="${img(h)}" alt="${esc(h?.name||'Unbekannt')}"><span class="overview-slot-index">${code}</span>${ban?'<span class="overview-cross" aria-hidden="true">×</span>':''}</div>`;
 };
 const team=(key,name)=>{
  const picks=Array.from({length:5},(_,i)=>portrait(buckets[key].pick[i],'Pick',i,key)).join('');
  const bans=Array.from({length:7},(_,i)=>portrait(buckets[key].ban[i],'Ban',i,key)).join('');
  return `<section class="overview-team ${key}"><h4>${name}</h4><div class="overview-team-body"><div class="overview-ban-rail"><span>Bans</span><div class="overview-ban-grid">${bans}</div></div><div class="overview-picks"><span>Picks</span><div class="overview-pick-grid">${picks}</div></div></div></section>`;
 };
 return `<div class="overview-versus">${team('our','Unser Team')}<div class="overview-vs">VS</div>${team('their','Gegner')}</div>`;
}
function renderLiveTimeline(){
 const header='<div class="compact-team-header"><span>Unser Team</span><span>Gegner</span></div>';
 const rows=state.actions.map(a=>{
  const step=order[Number(a.turn_number)-1];if(!step)return '';
  const isOur=our(step[0]),isPick=step[1]==='pick',hero=hById(a.hero_id);
  const previous=state.actions.filter(x=>Number(x.turn_number)<=Number(a.turn_number)&&order[Number(x.turn_number)-1]?.[0]===step[0]&&order[Number(x.turn_number)-1]?.[1]===step[1]);
  const label=(isPick?'Pick ':'Ban ')+previous.length;
  const pos=isPick&&isOur?inferredPosition(a):0;
  const content=`<div class="compact-draft-action ${isPick?'is-pick':'is-ban'}"><span class="compact-action-label">${label}${pos?' · Pos '+pos:''}</span><img loading="lazy" src="${img(hero)}" alt=""><strong>${esc(hero?.name||'Unbekannt')}</strong><small>#${a.turn_number}</small></div>`;
  return `<div class="compact-draft-turn"><div>${isOur?content:''}</div><div>${isOur?'':content}</div></div>`;
 }).join('');
 return header+`<div class="compact-draft-rows">${rows||'<p class="hint">Noch keine Aktionen.</p>'}</div>`;
}
function render(){if(!state.loaded)return;
 const nextStep=next();el('draft-side').value=state.side;
 el('draft-status').innerHTML=nextStep?`<b>Schritt ${state.actions.length+1}/24</b> · <strong>${our(nextStep[0])?'UNSER TEAM':'GEGNER'}</strong> · ${nextStep[1]==='ban'?'BAN':'PICK'}`:'<b>Draft abgeschlossen (24/24)</b>';
 el('draft-overview').innerHTML=renderOverview(state.actions,state.side,true);
 el('draft-history').innerHTML=renderLiveTimeline();
 const q=el('draft-search').value.trim().toLowerCase(),taken=used();
 el('draft-catalog').innerHTML=H().map((h,i)=>({...h,id:i+1})).filter(h=>h.name.toLowerCase().includes(q)).map(h=>`<button type="button" class="draft-choice ${taken.has(h.id)?'taken':''}" data-hero="${h.id}" ${taken.has(h.id)||!nextStep?'disabled':''}><img loading="lazy" src="${img(h)}" alt=""><span>${esc(h.name)}</span></button>`).join('');
 renderRecommendations();
 window.opponentHub?.renderDraftSuggestions?.(used());
}
function renderRecommendations(){
 const data=typeof window.getDraftData==='function'?window.getDraftData():{roster:[],ratings:[],players:[]};
 const select=el('draft-player'),previous=select.value||'all';
 select.innerHTML='<option value="all">Alle Spieler</option>'+data.players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
 select.value=data.players.some(p=>String(p.id)===previous)?previous:'all';
 const target=select.value,min=Number(el('draft-confidence').value),free=el('draft-only-free').checked,search=(el('draft-rec-search')?.value||'').trim().toLocaleLowerCase('de');
 el('draft-confidence-label').textContent=min;
 const labels=['','Carry','Mid','Offlane','Soft Support','Hard Support'];
 el('draft-recs').innerHTML=[1,2,3,4,5].map(pos=>{
  const assigned=data.roster.find(r=>Number(r.position)===pos)?.player_id;
  const assignedName=data.players.find(p=>String(p.id)===String(assigned))?.name||'Nicht besetzt';
  const rows=data.ratings.filter(r=>Number(r.position)===pos&&Number(r.confidence)>=min&&(target==='all'||String(r.player_id)===target)&&(!search||(hById(r.hero_id)?.name||'').toLocaleLowerCase('de').includes(search))&&(!free||!used().has(Number(r.hero_id)))).sort((a,b)=>b.confidence-a.confidence||String(hById(a.hero_id)?.name).localeCompare(String(hById(b.hero_id)?.name)));
  return `<section class="draft-position-group"><h4>Pos ${pos} · ${labels[pos]} <small>Roster: ${esc(assignedName)}</small></h4><div class="draft-rec-list">${rows.map(r=>{const h=hById(r.hero_id),p=data.players.find(p=>String(p.id)===String(r.player_id));return `<button class="draft-rec" data-recommend="${r.hero_id}" ${used().has(Number(r.hero_id))||!next()?'disabled':''}><img loading="lazy" src="${img(h)}" alt=""><span><b>${esc(h?.name||'?')}</b><small>${esc(p?.name||'?')} · Pos ${pos}</small></span><strong>${r.confidence}/10</strong></button>`}).join('')||'<div class="empty">Keine passenden Helden</div>'}</div></section>`
 }).join('');
 // Flex picks: at least two distinct players, across all five positions.
 const grouped=new Map();
 for(const r of data.ratings){
  const heroId=Number(r.hero_id),pId=String(r.player_id);
  if(!grouped.has(heroId))grouped.set(heroId,new Map());
  const map=grouped.get(heroId),old=map.get(pId);
  if(!old||Number(r.confidence)>Number(old.confidence))map.set(pId,r);
 }
 const flex=[...grouped.entries()].filter(([id,map])=>map.size>=2&&(!free||!used().has(id))&&(!search||(hById(id)?.name||'').toLocaleLowerCase('de').includes(search)))
 .map(([id,map])=>{const all=[...map.values()],qualified=all.filter(r=>Number(r.confidence)>=min);return {id,all,qualified,average:all.reduce((s,r)=>s+Number(r.confidence),0)/all.length}})
 .filter(x=>x.qualified.length>=2&&(target==='all'||x.all.some(r=>String(r.player_id)===target)))
 .sort((a,b)=>b.average-a.average||b.all.length-a.all.length||(hById(a.id)?.name||'').localeCompare(hById(b.id)?.name||''));
 el('draft-flex-recs').innerHTML=flex.map(x=>{const h=hById(x.id),names=x.all.map(r=>{const p=data.players.find(p=>String(p.id)===String(r.player_id));return `${esc(p?.name||'?')} ${Number(r.confidence)}/10 (Pos ${Number(r.position)})`}).join(' · ');return `<button class="draft-rec" data-recommend="${x.id}" ${used().has(x.id)||!next()?'disabled':''}><img loading="lazy" src="${img(h)}" alt=""><span><b>${esc(h?.name||'?')}</b><small class="flex-rec-players">${names}</small></span><strong>${x.average.toFixed(1)}/10 Ø</strong></button>`}).join('')||'<p class="hint">Keine Flex-Picks für diese Filter.</p>';
 const status=el('draft-rec-status');if(status)status.textContent=`${data.ratings.length} gespeicherte Heldenbewertungen geladen · ${data.players.length} Spieler. ${state.loaded?'Draft verbunden.':'Draft-Verbindung wird geprüft.'}`;
}
let archives=[],selectedArchive=null;
async function loadArchives(){const {data,error}=await db.from('draft_archives').select('*').order('created_at',{ascending:false});if(error)throw error;archives=data||[];const select=el('draft-archive-select'),prev=String(selectedArchive?.id||select.value||'');select.innerHTML='<option value="">Draft auswählen</option>'+archives.map(a=>`<option value="${a.id}">${esc(a.name)} · ${new Date(a.created_at).toLocaleString('de-DE')}</option>`).join('');if(archives.some(a=>String(a.id)===prev))select.value=prev;const analysis=el('analysis-select');analysis.innerHTML=select.innerHTML;if(archives.some(a=>String(a.id)===prev))analysis.value=prev;}
function inferredPosition(a,archive){
 const explicit=Number(a.position);if(explicit>=1&&explicit<=5)return explicit;
 const data=window.getDraftData?.()||{ratings:[],roster:[]};
 const eligible=data.ratings.filter(r=>Number(r.hero_id)===Number(a.hero_id));
 const assigned=eligible.filter(r=>data.roster.some(x=>Number(x.position)===Number(r.position)&&String(x.player_id)===String(r.player_id)));
 const best=(assigned.length?assigned:eligible).sort((x,y)=>Number(y.confidence)-Number(x.confidence))[0];
 return best?Number(best.position):0;
}
function archiveSummary(a){
 const actions=Array.isArray(a.actions)?a.actions:[];
 const sideNames=['Unser Team','Gegnerteam'];
 const cols=sideNames.map((name,i)=>`<div class="analysis-team-title">${name}</div>`).join('');
 const rows=actions.map((action,i)=>{
  const step=order[Number(action.turn_number)-1];if(!step)return '';
  const ours=step[0]===a.our_side, pick=step[1]==='pick';
  const hero=hById(action.hero_id), pos=Number(action.position)||0;
  const count=actions.slice(0,i+1).filter(x=>{const st=order[Number(x.turn_number)-1];return st&&st[0]===step[0]&&st[1]===step[1]}).length;
  const options='<option value="0">Position offen</option>'+[1,2,3,4,5].map(p=>`<option value="${p}" ${pos===p?'selected':''}>Pos ${p}</option>`).join('');
  const content=`<div class="analysis-action ${pick?'is-pick':'is-ban'}"><span class="analysis-step">${pick?'Pick':'Ban'} ${count} · Schritt ${action.turn_number}</span><div class="analysis-hero"><img src="${img(hero)}" alt=""><strong>${esc(hero?.name||'Unbekannt')}</strong></div>${pick?`<label>Position<select class="analysis-position" data-turn="${action.turn_number}" aria-label="Position für ${esc(hero?.name||'Pick')}">${options}</select></label>`:''}</div>`;
  return `<div class="analysis-turn"><div class="analysis-side">${ours?content:''}</div><div class="analysis-side">${ours?'':content}</div></div>`;
 }).join('');
 return `<div class="analysis-summary-header"><div><strong>${esc(a.name)}</strong><p>${actions.length}/24 Aktionen · ${a.our_side==='first'?'Unser Team: First Pick':'Unser Team: Second Pick'} · ${new Date(a.created_at).toLocaleString('de-DE')}</p></div><button id="analysis-save-positions" type="button" class="secondary">Positionen speichern</button></div><div class="analysis-overview"><h4>Draft auf einen Blick</h4>${renderOverview(actions,a.our_side)}</div><div class="analysis-columns">${cols}</div><div class="analysis-timeline">${rows||'<p>Noch keine Aktionen gespeichert.</p>'}</div><p class="hint">Picks können Position 1–5 zugewiesen werden. Die Zuordnung wird im gespeicherten Draft hinterlegt. Bans bleiben chronologisch sichtbar.</p>`;
}
async function selectArchive(id){
 const selectedId=id===''?0:Number(id||el('analysis-select').value||el('draft-archive-select').value);
 selectedArchive=archives.find(a=>Number(a.id)===selectedId)||null;
 el('analysis-select').value=selectedArchive?String(selectedArchive.id):'';
 el('draft-archive-select').value=selectedArchive?String(selectedArchive.id):'';
 el('draft-archive-summary').innerHTML=selectedArchive?archiveSummary(selectedArchive):'<p>Gespeicherten Draft auswählen.</p>';
 el('analysis-meta').textContent=selectedArchive?`Erstellt: ${new Date(selectedArchive.created_at).toLocaleString('de-DE')}`:'Noch kein Draft ausgewählt';
 el('analysis-delete').disabled=!selectedArchive;
 el('analysis-winner').value=selectedArchive?.winner||'';
 el('analysis-match-id').value=selectedArchive?.match_id||'';
 el('analysis-save-result').disabled=!selectedArchive;
 await loadComments();
}
async function saveResult(){
 if(!selectedArchive)return notice('Zuerst einen gespeicherten Draft auswählen.');
 const winner=el('analysis-winner').value||null;
 const match_id=el('analysis-match-id').value.trim()||null;
 if(match_id && !/^\d{1,40}$/.test(match_id))return notice('Match-ID darf nur Ziffern enthalten (maximal 40).');
 const {data,error}=await db.from('draft_archives').update({winner,match_id}).eq('id',selectedArchive.id).select('id,winner,match_id').single();
 if(error)return notice('Matchergebnis konnte nicht gespeichert werden: '+error.message);
 selectedArchive.winner=data.winner;selectedArchive.match_id=data.match_id;
 const row=archives.find(a=>String(a.id)===String(selectedArchive.id));if(row){row.winner=data.winner;row.match_id=data.match_id;}
 notice('Matchergebnis gespeichert.');
}
async function deleteArchive(){
 if(!selectedArchive)return notice('Zuerst einen gespeicherten Draft auswählen.');
 const target=selectedArchive;
 if(!confirm(`Gespeicherten Draft "${target.name}" und alle zugehörigen Kommentare dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden. Der aktive Captain’s-Mode-Draft bleibt unverändert.`))return;
 const button=el('analysis-delete');button.disabled=true;
 try{
  const {data,error}=await db.from('draft_archives').delete().eq('id',target.id).select('id');
  if(error)throw error;
  if(!data?.length)throw new Error('Der Draft konnte nicht gelöscht werden (keine Berechtigung oder nicht gefunden).');
  selectedArchive=null;
  el('draft-comment-text').value='';
  await loadArchives();
  await selectArchive('');
  notice('Gespeicherter Draft und zugehörige Kommentare gelöscht.');
 }catch(e){notice('Löschen fehlgeschlagen: '+e.message);button.disabled=false;}
}
async function savePositions(){
 if(!selectedArchive)return notice('Zuerst einen Draft auswählen.');
 const positions=new Map([...document.querySelectorAll('.analysis-position')].map(x=>[Number(x.dataset.turn),Number(x.value)]));
 const updated=(selectedArchive.actions||[]).map(a=>{
  const {position,...rest}=a;const p=positions.get(Number(a.turn_number));return p?{...rest,position:p}:rest;
 });
 const {error}=await db.from('draft_archives').update({actions:updated}).eq('id',selectedArchive.id);
 if(error)return notice('Positionsspeicherung fehlgeschlagen: '+error.message);
 selectedArchive.actions=updated;const row=archives.find(x=>x.id===selectedArchive.id);if(row)row.actions=updated;
 notice('Pick-Positionen gespeichert.');await selectArchive(selectedArchive.id);
}
function openAnalysis(id){
 const nav=document.querySelector('[data-view="analysis"]');nav?.click();
 if(id)el('analysis-select').value=String(id);
 selectArchive(id||el('analysis-select').value);
}
async function saveArchive(){if(!state.loaded)return;const name=el('draft-save-name').value.trim();if(!name){notice('Bitte einen Draft-Namen eingeben.');return}const {data,error}=await db.from('draft_archives').insert({name,our_side:state.side,actions:state.actions.map(a=>({turn_number:a.turn_number,hero_id:a.hero_id})),opponent_team_id:window.opponentHub?.selectedTeamId?.()||null}).select().single();if(error){notice('Speichern fehlgeschlagen: '+error.message);return}selectedArchive=data;el('draft-save-name').value='';await loadArchives();el('draft-archive-select').value=String(data.id);await selectArchive(data.id);notice('Draft gespeichert.');}
async function restoreArchive(){if(!selectedArchive)return notice('Zuerst einen gespeicherten Draft auswählen.');if(!confirm('Aktiven Draft durch diesen gespeicherten Draft ersetzen? Der aktuelle Draft wird überschrieben.'))return;const rows=Array.isArray(selectedArchive.actions)?selectedArchive.actions:[];const valid=rows.every((a,i)=>Number(a.turn_number)===i+1&&Number(a.hero_id)>0)&&rows.length<=24&&new Set(rows.map(x=>Number(x.hero_id))).size===rows.length;if(!valid)return notice('Gespeicherter Draft ist ungültig.');const del=await db.from('draft_actions').delete().gte('turn_number',1);if(del.error)return notice(del.error.message);const upd=await db.from('draft_settings').update({our_side:selectedArchive.our_side}).eq('id',1);if(upd.error)return notice(upd.error.message);if(rows.length){const ins=await db.from('draft_actions').insert(rows.map(x=>({turn_number:Number(x.turn_number),hero_id:Number(x.hero_id)})));if(ins.error)return notice('Wiederherstellung unvollständig: '+ins.error.message)}await load();if(window.opponentHub?.selectTeam)await window.opponentHub.selectTeam(selectedArchive.opponent_team_id||'');notice('Draft geladen.');}
async function loadComments(){if(!selectedArchive){el('draft-comments').innerHTML='<p>Wähle zuerst einen gespeicherten Draft.</p>';return}const {data,error}=await db.from('draft_comments').select('*').eq('draft_id',selectedArchive.id).order('created_at',{ascending:true});if(error){notice(error.message);return}const players=window.getDraftData?.().players||[];el('draft-comments').innerHTML=(data||[]).map(c=>`<div class="draft-comment"><b>${esc(players.find(p=>String(p.id)===String(c.player_id))?.name||'Spieler')}</b><small>${new Date(c.created_at).toLocaleString('de-DE')}</small><p>${esc(c.body)}</p></div>`).join('')||'<p>Noch keine Kommentare.</p>';}
async function addComment(e){e.preventDefault();if(!selectedArchive)return notice('Zuerst einen gespeicherten Draft auswählen.');const player_id=Number(el('draft-comment-player').value),body=el('draft-comment-text').value.trim();if(!player_id||!body)return;const {error}=await db.from('draft_comments').insert({draft_id:selectedArchive.id,player_id,body});if(error)return notice('Kommentar fehlgeschlagen: '+error.message);el('draft-comment-text').value='';await loadComments();}
function updateCommentPlayers(){const players=window.getDraftData?.().players||[],sel=el('draft-comment-player'),old=sel.value;sel.innerHTML=players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if(players.some(p=>String(p.id)===old))sel.value=old;else if(el('active-player'))sel.value=el('active-player').value;}
async function load(){db=client();renderRecommendations();if(!db){notice('Supabase nicht geladen');return}try{const [a,s]=await Promise.all([db.from('draft_actions').select('*').order('turn_number'),db.from('draft_settings').select('*').eq('id',1).single()]);if(a.error)throw a.error;if(s.error)throw s.error;state.actions=a.data||[];state.side=s.data.our_side;state.loaded=true;render();updateCommentPlayers();await loadArchives();if(selectedArchive)await selectArchive(selectedArchive.id)}catch(e){notice('Draft-Datenbank fehlt oder nicht erreichbar: '+e.message);renderRecommendations()}}
async function choose(id){if(state.busy||!next()||used().has(id))return;state.busy=true;try{const {error}=await db.from('draft_actions').insert({turn_number:state.actions.length+1,hero_id:id});if(error)throw error;await load()}catch(e){notice('Draft-Aktion fehlgeschlagen: '+e.message);await load()}finally{state.busy=false}}
async function undo(){if(state.busy||!state.actions.length)return;state.busy=true;try{const {error}=await db.from('draft_actions').delete().eq('turn_number',state.actions.length);if(error)throw error;await load()}catch(e){notice('Rückgängig fehlgeschlagen: '+e.message)}finally{state.busy=false}}
async function reset(){if(!confirm('Gesamten Draft löschen? Kalender, Hero-Pool und Roster bleiben erhalten.'))return;state.busy=true;try{const {error}=await db.from('draft_actions').delete().gte('turn_number',1);if(error)throw error;await load()}catch(e){notice('Zurücksetzen fehlgeschlagen: '+e.message)}finally{state.busy=false}}
function init(){el('draft-catalog').onclick=e=>{const b=e.target.closest('[data-hero]');if(b)choose(Number(b.dataset.hero))};el('draft-recs').onclick=e=>{const b=e.target.closest('[data-recommend]');if(b)choose(Number(b.dataset.recommend))};el('draft-flex-recs').onclick=e=>{const b=e.target.closest('[data-recommend]');if(b)choose(Number(b.dataset.recommend))};el('draft-undo').onclick=undo;el('draft-reset').onclick=reset;el('draft-search').oninput=render;el('draft-player').onchange=renderRecommendations;el('draft-rec-search').oninput=renderRecommendations;el('draft-rec-refresh').onclick=async()=>{try{await window.refreshDraftData?.();renderRecommendations()}catch(e){notice('Aktualisieren fehlgeschlagen: '+e.message)}};el('draft-confidence').oninput=renderRecommendations;el('draft-only-free').onchange=renderRecommendations;el('draft-save').onclick=saveArchive;el('draft-archive-select').onchange=e=>{selectedArchive=archives.find(a=>String(a.id)===e.target.value)||null};el('analysis-select').onchange=e=>selectArchive(e.target.value);el('analysis-refresh').onclick=loadArchives;el('analysis-delete').onclick=deleteArchive;el('analysis-save-result').onclick=saveResult;el('draft-go-analysis').onclick=()=>openAnalysis(el('draft-archive-select').value);el('draft-archive-summary').onclick=e=>{if(e.target.id==='analysis-save-positions')savePositions()};el('draft-restore').onclick=restoreArchive;el('draft-comment-form').onsubmit=addComment;el('draft-side').onchange=async e=>{if(state.actions.length&&!confirm('First/Second Pick ändern? Bestehende Draft-Aktionen bleiben erhalten und werden neu zugeordnet.')){e.target.value=state.side;return}const v=e.target.value;const {error}=await db.from('draft_settings').update({our_side:v}).eq('id',1);if(error)notice(error.message);await load()};load();}
window.getDraftUsed=()=>used();
window.renderDraft=()=>{if(state.loaded)render();else renderRecommendations()};window.openDraftAnalysis=()=>{loadArchives().then(()=>{if(selectedArchive)selectArchive(selectedArchive.id)})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
