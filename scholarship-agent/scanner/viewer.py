"""Export the database to one self-contained viewer.html (FR-V1..V9). No external requests."""
import json
from datetime import date

def payload(db, today, last_run=None):
    rows = []
    for o in db.all():
        h = db.history(o["id"])
        rows.append({k: o[k] for k in ("id", "name", "provider", "university", "countries", "uk_nation", "language", "topics",
                                         "level", "stipend_type", "value", "currency", "opens", "deadline", "deadline_approx",
                                         "deadline_text", "entry_year", "eligibility", "eligibility_reason", "contact",
                                         "source_urls", "quote", "first_seen", "last_seen", "last_checked", "status",
                                         "user_mark", "note", "ai_generated", "region_group")} | {"history": h})
    return {"exported": today, "last_run": last_run or today, "rows": rows}

def build(db, today, last_run=None):
    data = json.dumps(payload(db, today, last_run), ensure_ascii=False).replace("</", "<\\/")
    return TEMPLATE.replace("__DATA__", data)

def write(db, path, today, last_run=None):
    html = build(db, today, last_run)
    with open(path, "w", encoding="utf-8") as f: f.write(html)
    return path

TEMPLATE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scholarship Finder</title>
<style>
:root{--bg:#f7f6f2;--surface:#fff;--ink:#1d2330;--muted:#5b6475;--line:#d9d6cc;--accent:#1f4fa3;--accent-ink:#fff;--warn:#8a3b00;--warn-bg:#fff0e0;--ok:#14663a;--bad:#9b1c1c;--focus:#1f4fa3}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14171f;--surface:#1d2230;--ink:#e8eaf0;--muted:#a3abbb;--line:#323a4d;--accent:#8db3ff;--accent-ink:#0b1630;--warn:#ffc58a;--warn-bg:#3a2a16;--ok:#6fd49b;--bad:#ff9a9a;--focus:#8db3ff}}
:root[data-theme=dark]{--bg:#14171f;--surface:#1d2230;--ink:#e8eaf0;--muted:#a3abbb;--line:#323a4d;--accent:#8db3ff;--accent-ink:#0b1630;--warn:#ffc58a;--warn-bg:#3a2a16;--ok:#6fd49b;--bad:#ff9a9a;--focus:#8db3ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;margin:.2rem 0}
.sub{color:var(--muted);margin:0 0 12px}
.stale{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn);border-radius:8px;padding:10px 12px;margin:8px 0}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.seg{display:flex;gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:8px 0}
.seg button{flex:1;min-height:44px;border:0;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;border-right:1px solid var(--line)}
.seg button:last-child{border-right:0}
.seg button[aria-checked=true]{background:var(--accent);color:var(--accent-ink);font-weight:600}
.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}
label{display:flex;flex-direction:column;font-size:.85rem;color:var(--muted);gap:4px}
select,input[type=date],input[type=search]{min-height:44px;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:6px 8px}
.check{flex-direction:row;align-items:center;gap:8px;min-height:44px;color:var(--ink)}
.check input{width:24px;height:24px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
button.btn{min-height:44px;padding:0 16px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;cursor:pointer}
.count{margin:10px 0;font-weight:600}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin:10px 0;padding:0}
.card summary{list-style:none;cursor:pointer;padding:12px;min-height:44px}
.card summary::-webkit-details-marker{display:none}
.card h2{font-size:1.05rem;margin:0 0 4px}
.badges{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 0}
.badge{font-size:.78rem;border:1px solid var(--line);border-radius:999px;padding:2px 9px;background:var(--bg)}
.badge.warn{background:var(--warn-bg);color:var(--warn);border-color:var(--warn);font-weight:600}
.badge.ok{color:var(--ok);border-color:var(--ok)} .badge.bad{color:var(--bad);border-color:var(--bad)}
.detail{padding:0 12px 12px;border-top:1px solid var(--line)}
.detail dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:10px 0}
.detail dt{color:var(--muted)} .detail dd{margin:0;overflow-wrap:anywhere}
blockquote{margin:8px 0;padding:6px 10px;border-left:3px solid var(--line);color:var(--muted)}
a{color:var(--accent)}
.empty{padding:24px;text-align:center;color:var(--muted)}
</style></head>
<body><main>
<h1 id="title">Scholarship Finder</h1>
<p class="sub" id="meta"></p>
<div id="stale" class="stale" role="status" hidden></div>
<div class="seg" role="radiogroup" aria-label="Region">
 <button role="radio" aria-checked="false" data-region="UK">UK</button>
 <button role="radio" aria-checked="false" data-region="EU">EU</button>
 <button role="radio" aria-checked="true" data-region="both">UK and EU</button>
</div>
<form class="filters" id="filters" aria-label="Filters" onsubmit="return false">
 <label>Search<input type="search" id="q" placeholder="name, university, quote"></label>
 <label>Deadline from<input type="date" id="dlFrom"></label>
 <label>Deadline to<input type="date" id="dlTo"></label>
 <label>First seen from<input type="date" id="fsFrom"></label>
 <label>First seen to<input type="date" id="fsTo"></label>
 <label>Topic<select id="topic"><option value="">All</option></select></label>
 <label>Country<select id="country"><option value="">All</option></select></label>
 <label>Language of instruction<select id="language"><option value="">All</option></select></label>
 <label>Level<select id="level"><option value="">All</option></select></label>
 <label>Stipend type<select id="stipend"><option value="">All</option></select></label>
 <label>Eligibility for you<select id="elig"><option value="">All</option></select></label>
 <label>Entry year<select id="year"><option value="">All</option></select></label>
 <label>Status<select id="status"><option value="">All</option></select></label>
 <label>Your mark<select id="mark"><option value="">All</option></select></label>
 <label class="check"><input type="checkbox" id="hasContact"> Has contact</label>
 <label>Sort by<select id="sort"><option value="deadline">Deadline</option><option value="value">Value</option><option value="first_seen">First seen</option><option value="name">Name</option></select></label>
 <label>Direction<select id="dir"><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
 <div class="row"><button type="button" class="btn" id="clear">Clear filters</button></div>
</form>
<div class="count" id="count" role="status" aria-live="polite"></div>
<div id="list"></div>
</main>
<script id="data" type="application/json">__DATA__</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent),R=D.rows,$=function(i){return document.getElementById(i)};
var region='both';
var COUNTRY={GB:'United Kingdom',IE:'Ireland',AT:'Austria',ES:'Spain',PT:'Portugal',FR:'France',IT:'Italy',NL:'Netherlands',BE:'Belgium',SE:'Sweden',DE:'Germany'};
var LEVEL={masters:"Master's",phd:'PhD',both:"Master's and PhD"};
function uniq(f){var s={};R.forEach(function(r){[].concat(f(r)).forEach(function(v){if(v!=null&&v!=='')s[v]=1})});return Object.keys(s).sort()}
function fill(id,vals,label){var el=$(id);vals.forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=label?label(v):v;el.appendChild(o)})}
fill('topic',uniq(function(r){return r.topics}));
fill('country',uniq(function(r){return r.countries}),function(c){return COUNTRY[c]||c});
fill('language',uniq(function(r){return r.language}));
fill('level',uniq(function(r){return r.level}),function(v){return LEVEL[v]||v});
fill('stipend',uniq(function(r){return r.stipend_type}));
fill('elig',uniq(function(r){return r.eligibility}));
fill('year',uniq(function(r){return r.entry_year}));
fill('status',uniq(function(r){return r.status}));
fill('mark',uniq(function(r){return r.user_mark}));
$('meta').textContent='Data exported '+D.exported+' · last scan '+D.last_run;
var age=(Date.now()-new Date(D.exported+'T00:00:00').getTime())/864e5;
if(age>14){$('stale').hidden=false;$('stale').textContent='This export is '+Math.floor(age)+' days old. Run a new scan and republish.'}
function days(r){return r.deadline?Math.round((new Date(r.deadline)-new Date(D.exported))/864e5):null}
function regionOk(r){return region==='both'||r.region_group===region||r.region_group==='both'}
function match(r){
 if(!regionOk(r))return false;
 var q=$('q').value.trim().toLowerCase();
 if(q&&(r.name+' '+r.university+' '+(r.quote||'')).toLowerCase().indexOf(q)<0)return false;
 var v;
 if((v=$('dlFrom').value)&&!(r.deadline&&r.deadline>=v))return false;
 if((v=$('dlTo').value)&&!(r.deadline&&r.deadline<=v))return false;
 if((v=$('fsFrom').value)&&!(r.first_seen>=v))return false;
 if((v=$('fsTo').value)&&!(r.first_seen<=v))return false;
 if((v=$('topic').value)&&r.topics.indexOf(v)<0)return false;
 if((v=$('country').value)&&r.countries.indexOf(v)<0)return false;
 if((v=$('language').value)&&r.language!==v)return false;
 if((v=$('level').value)&&r.level!==v&&r.level!=='both')return false;
 if((v=$('stipend').value)&&r.stipend_type!==v)return false;
 if((v=$('elig').value)&&r.eligibility!==v)return false;
 if((v=$('year').value)&&String(r.entry_year)!==v)return false;
 if((v=$('status').value)&&r.status!==v)return false;
 if((v=$('mark').value)&&r.user_mark!==v)return false;
 if($('hasContact').checked&&!r.contact)return false;
 return true}
function cmp(a,b){var k=$('sort').value,d=$('dir').value==='desc'?-1:1,x,y;
 if(k==='deadline'){x=a.deadline||'9999';y=b.deadline||'9999'}
 else if(k==='value'){x=a.value==null?-1:a.value;y=b.value==null?-1:b.value}
 else if(k==='first_seen'){x=a.first_seen;y=b.first_seen}
 else{x=a.name.toLowerCase();y=b.name.toLowerCase()}
 return x<y?-d:x>y?d:0}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function badge(t,c){return el('span','badge '+(c||''),t)}
function fmtVal(r){return r.value?Math.round(r.value).toLocaleString('en-GB')+' '+r.currency:'not stated'}
function fmtDl(r){var d=days(r);return r.deadline?r.deadline+(d!=null?(d<0?' (closed)':' ('+d+' days left)'):''):(r.deadline_text?r.deadline_text+' (approximate)':'not stated')}
function card(r){
 var d=el('details','card'),s=el('summary'),h=el('h2',null,r.name);s.appendChild(h);
 s.appendChild(el('div','sub',r.university+' · '+r.countries.map(function(c){return COUNTRY[c]||c}).join(', ')+' · Deadline: '+fmtDl(r)));
 var b=el('div','badges');
 b.appendChild(badge(r.region_group==='both'?'UK + EU':r.region_group));
 if(r.first_seen>=D.last_run)b.appendChild(badge('NEW','warn'));
 var dd=days(r);if(dd!=null&&dd>=0&&dd<=30)b.appendChild(badge('Closing soon: '+dd+' days','warn'));
 if(r.status==='closed')b.appendChild(badge('Closed','bad'));
 b.appendChild(badge(r.stipend_type));b.appendChild(badge(LEVEL[r.level]||r.level));
 b.appendChild(badge('Eligibility: '+r.eligibility,r.eligibility==='eligible'?'ok':r.eligibility==='not eligible'?'bad':''));
 if(r.user_mark)b.appendChild(badge('Your mark: '+r.user_mark));
 s.appendChild(b);d.appendChild(s);
 var x=el('div','detail'),dl=el('dl');
 function row(k,v,link){dl.appendChild(el('dt',null,k));var dd=el('dd');if(link){var a=el('a',null,v);a.href=v;a.rel='noopener noreferrer';a.target='_blank';dd.appendChild(a)}else dd.textContent=v;dl.appendChild(dd)}
 row('Value',fmtVal(r));row('Opens',r.opens||'not stated');row('Entry year',r.entry_year||'not stated');
 row('Topics',r.topics.join(', '));row('Language',r.language);
 row('Eligibility',r.eligibility+' – '+r.eligibility_reason);
 row('Contact',r.contact||'not stated');
 r.source_urls.forEach(function(u,i){row(i?'Also at':'Source',u,true)});
 row('Last checked',r.last_checked);
 if(r.ai_generated)row('Note','Summary is AI-generated');
 if(r.note)row('Your note',r.note);
 x.appendChild(dl);
 if(r.quote){var q=el('blockquote',null,r.quote);x.appendChild(q)}
 if(r.history.length){x.appendChild(el('strong',null,'Changes'));var u=el('ul');r.history.forEach(function(h){u.appendChild(el('li',null,h.changed_on+': '+h.field+' '+h.old+' → '+h.new))});x.appendChild(u)}
 d.appendChild(x);return d}
function render(){
 var rows=R.filter(match).sort(cmp),l=$('list');l.textContent='';
 $('count').textContent=rows.length+' of '+R.length+' opportunities';
 if(!rows.length){l.appendChild(el('div','empty','Nothing matches these filters.'))}
 rows.forEach(function(r){l.appendChild(card(r))})}
document.querySelectorAll('.seg button').forEach(function(b){b.addEventListener('click',function(){
 region=b.dataset.region;document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-checked',x===b)});render()})});
document.querySelectorAll('#filters input,#filters select').forEach(function(e){e.addEventListener('input',render);e.addEventListener('change',render)});
$('clear').addEventListener('click',function(){
 document.querySelectorAll('#filters select').forEach(function(s){if(s.id!=='sort'&&s.id!=='dir')s.value=''});
 document.querySelectorAll('#filters input[type=date],#filters input[type=search]').forEach(function(i){i.value=''});
 $('hasContact').checked=false;region='both';
 document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-checked',x.dataset.region==='both')});render()});
render();
})();
</script></body></html>
"""
