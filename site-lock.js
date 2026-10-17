/* UI access gate for static GitHub Pages. Not a security boundary. */
(()=>{
const digestExpected='68fee6f08e272a8b53d1fa568fcd0f3a5c1764f6863c934c410907f48eb25eda';
const flag='dota-hub-v9-unlocked';
async function digest(text){const bytes=new TextEncoder().encode(text);const result=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('');}
function unlock(){document.body.classList.remove('site-locked');document.getElementById('site-password').value='';}
function init(){if(sessionStorage.getItem(flag)==='1'){unlock();return;}document.getElementById('site-lock-form').addEventListener('submit',async(e)=>{e.preventDefault();const field=document.getElementById('site-password');const ok=(await digest(field.value))===digestExpected;if(ok){sessionStorage.setItem(flag,'1');unlock();}else{document.getElementById('site-lock-error').textContent='Falsches Passwort.';field.value='';field.focus();}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
