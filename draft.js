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
const client=()=>window.supabase?.createClient(window.TEAM_CONFIG.SUPABASE_URL,window.TEAM_CONFIG.SUPABASE_PUBLISHABLE_KEY);
let db;
function notice(s){const n=el('notice');n.textContent=s;n.classList.remove('hidden');clearTimeout(notice.t);notice.t=setTimeout(()=>n.classList.add('hidden'),6500)}
function used(){return new Set(state.actions.map(x=>Number(x.hero_id)))}
function next(){return order[state.actions.length]}
function our(t){return t===state.side}
function slot(a){const h=hById(a.hero_id);return `<div class="draft-tile"><img src="${img(h)}" alt=""><span>${esc(h?.name||'Unbekannt')}</span></div>`}
function render(){if(!state.loaded)return;
 const nextStep=next();el('draft-side').value=state.side;
 el('draft-status').innerHTML=nextStep?`<b>Schritt ${state.actions.length+1}/24</b> · <strong>${our(nextStep[0])?'UNSER TEAM':'GEGNER'}</strong> · ${nextStep[1]==='ban'?'BAN':'PICK'}`:'<b>Draft abgeschlossen (24/24)</b>';
 for(const side of ['our','their'])for(const action of ['picks','bans']){
 const list=state.actions.filter(a=>{const [team,type]=order[a.turn_number-1];return (side==='our'?our(team):!our(team))&&type===(action==='picks'?'pick':'ban')});
 el(`draft-${side}-${action}`).innerHTML=list.map(slot).join('')||'<span class="draft-empty">Noch keine</span>';
 }
 el('draft-history').innerHTML=state.actions.map(a=>{const [team,type]=order[a.turn_number-1];return `<div><span>${a.turn_number}. ${our(team)?'Wir':'Gegner'} · ${type==='ban'?'Ban':'Pick'}</span><b>${esc(hById(a.hero_id)?.name||'?')}</b></div>`}).join('')||'<p>Noch keine Aktionen</p>';
 const q=el('draft-search').value.trim().toLowerCase(),taken=used();
 el('draft-catalog').innerHTML=H().map((h,i)=>({...h,id:i+1})).filter(h=>h.name.toLowerCase().includes(q)).map(h=>`<button type="button" class="draft-choice ${taken.has(h.id)?'taken':''}" data-hero="${h.id}" ${taken.has(h.id)||!nextStep?'disabled':''}><img loading="lazy" src="${img(h)}" alt=""><span>${esc(h.name)}</span></button>`).join('');
 renderRecommendations();
}
function renderRecommendations(){if(!state.loaded)return;const roster=window.roster||[],ratings=window.ratings||[],players=window.players||[];
 // Original app uses top-level lexical let bindings; they are readable here via typeof guards.
 const rosterRows=typeof window.getDraftData==='function'?window.getDraftData():null;
 const data=rosterRows||{roster:[],ratings:[],players:[]};
 const pos=Number(el('draft-position').value),previous=el('draft-player').value;
 const assigned=data.roster.find(r=>Number(r.position)===pos)?.player_id;
 el('draft-player').innerHTML='<option value="all">Alle Spieler</option>'+data.players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
 const target=data.players.some(p=>String(p.id)===previous)?previous:(assigned?String(assigned):'all');el('draft-player').value=target;
 const min=Number(el('draft-confidence').value);el('draft-confidence-label').textContent=min;
 const rows=data.ratings.filter(r=>Number(r.position)===pos&&Number(r.confidence)>=min&&(target==='all'||String(r.player_id)===target)&&(!el('draft-only-free').checked||!used().has(Number(r.hero_id)))).sort((a,b)=>b.confidence-a.confidence||String(hById(a.hero_id)?.name).localeCompare(String(hById(b.hero_id)?.name)));
 el('draft-recs').innerHTML=rows.map(r=>{const h=hById(r.hero_id),p=data.players.find(p=>String(p.id)===String(r.player_id));return `<button class="draft-rec" data-recommend="${r.hero_id}" ${used().has(Number(r.hero_id))||!next()?'disabled':''}><img src="${img(h)}" alt=""><span><b>${esc(h?.name||'?')}</b><small>${esc(p?.name||'?')} · Pos ${pos}</small></span><strong>${r.confidence}/10</strong></button>`}).join('')||'<div class="empty">Keine passenden Helden. Filter reduzieren oder Hero-Pool ergänzen.</div>';
}
async function load(){db=client();if(!db){notice('Supabase nicht geladen');return}try{const [a,s]=await Promise.all([db.from('draft_actions').select('*').order('turn_number'),db.from('draft_settings').select('*').eq('id',1).single()]);if(a.error)throw a.error;if(s.error)throw s.error;state.actions=a.data||[];state.side=s.data.our_side;state.loaded=true;render()}catch(e){notice('Draft-Datenbank fehlt oder nicht erreichbar: '+e.message)}}
async function choose(id){if(state.busy||!next()||used().has(id))return;state.busy=true;try{const {error}=await db.from('draft_actions').insert({turn_number:state.actions.length+1,hero_id:id});if(error)throw error;await load()}catch(e){notice('Draft-Aktion fehlgeschlagen: '+e.message);await load()}finally{state.busy=false}}
async function undo(){if(state.busy||!state.actions.length)return;state.busy=true;try{const {error}=await db.from('draft_actions').delete().eq('turn_number',state.actions.length);if(error)throw error;await load()}catch(e){notice('Rückgängig fehlgeschlagen: '+e.message)}finally{state.busy=false}}
async function reset(){if(!confirm('Gesamten Draft löschen? Kalender, Hero-Pool und Roster bleiben erhalten.'))return;state.busy=true;try{const {error}=await db.from('draft_actions').delete().gte('turn_number',1);if(error)throw error;await load()}catch(e){notice('Zurücksetzen fehlgeschlagen: '+e.message)}finally{state.busy=false}}
function init(){el('draft-catalog').onclick=e=>{const b=e.target.closest('[data-hero]');if(b)choose(Number(b.dataset.hero))};el('draft-recs').onclick=e=>{const b=e.target.closest('[data-recommend]');if(b)choose(Number(b.dataset.recommend))};el('draft-undo').onclick=undo;el('draft-reset').onclick=reset;el('draft-search').oninput=render;el('draft-position').onchange=()=>{el('draft-player').value='all';renderRecommendations()};el('draft-player').onchange=renderRecommendations;el('draft-confidence').oninput=renderRecommendations;el('draft-only-free').onchange=renderRecommendations;el('draft-side').onchange=async e=>{if(state.actions.length&&!confirm('First/Second Pick ändern? Bestehende Draft-Aktionen bleiben erhalten und werden neu zugeordnet.')){e.target.value=state.side;return}const v=e.target.value;const {error}=await db.from('draft_settings').update({our_side:v}).eq('id',1);if(error)notice(error.message);await load()};load();}
window.renderDraft=render;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
