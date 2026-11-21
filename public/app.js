const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const state={results:[],leads:[],places:{},filter:'all',selected:null,chatSelected:null,config:null,imported:[],importSelection:new Set(),importFilter:'all'};
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){const e=$('#toast');e.textContent=message;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),4400);}
async function api(path, options={}){
  const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});
  let j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||`Erro ${r.status}`);
  return j;
}
async function init(){
  try{
    state.config=await api('/api/config');
    $('#mode-text').textContent=state.config.demo?'Modo demonstração':'Google Places habilitado';
    $('#groq-info').textContent=state.config.aiConfigured?`Modelo ${state.config.aiModel} configurado. Teste a conexão sem enviar mensagens.`:'Sem chave Groq configurada. Preencha GROQ_API_KEY no .env e reinicie o servidor.';
    $('#test-groq').disabled=!state.config.aiConfigured;
    if(state.config.demo)toast('Modo demonstração: dados fictícios. Configure GOOGLE_PLACES_API_KEY para buscar locais reais.');
    await loadLeads();
    await loadImported();
  }catch(e){toast(e.message)}
}
function updateMetrics(){
  $('#m-found').textContent=state.results.length;
  $('#m-no-site').textContent=state.results.filter(x=>x.noRegisteredWebsite).length;
  $('#m-crm').textContent=state.leads.length;
  $('#m-interested').textContent=state.leads.filter(x=>['interessado','proposta','ganho'].includes(x.stage)).length;
}
async function loadLeads(){state.leads=await api('/api/leads');updateMetrics();}
function placeName(l){const p=state.places[l.placeId];return p?.name||l.external?.name||`Local ${l.placeId.slice(0,14)}…`;}
function card(p){
  const saved=state.leads.some(l=>l.placeId===p.id);
  const status=p.noRegisteredWebsite?'<span class="status no-site">● Sem site registrado</span>':'<span class="status has-site">● Site informado</span>';
  return `<article class="lead-card"><div class="lead-top"><div class="company-icon">⌂</div>${status}</div>
    <h3 class="company-name" title="${esc(p.name)}">${esc(p.name)}</h3><div class="company-address">${esc(p.address)}</div>
    <div class="company-address">☎ ${p.internationalPhoneNumber || p.nationalPhoneNumber ? esc(p.internationalPhoneNumber || p.nationalPhoneNumber) : "Telefone não informado no Google"}</div>
    <div class="company-foot"><span class="star">★ ${p.rating??'—'}</span><span>(${Number(p.reviewCount||0)} avaliações)</span>${p.demo?'<span>· exemplo</span>':''}</div>
    <div class="company-actions"><button class="${saved?'secondary':'primary'}" data-save="${esc(p.id)}" ${saved?'disabled':''}>${saved?'✓ No CRM':'+ Adicionar ao CRM'}</button>
    ${p.maps?`<a href="${esc(p.maps)}" target="_blank" rel="noopener">Google Maps ↗</a>`:''}</div></article>`;
}
function drawResults(){
  const items=state.results.filter(p=>state.filter==='all'||(state.filter==='noSite'&&p.noRegisteredWebsite)||(state.filter==='hasSite'&&!p.noRegisteredWebsite));
  $('#results').innerHTML=items.length?items.map(card).join(''):'<div class="empty">Não há estabelecimentos com esse filtro.</div>';
  $('#result-count').textContent=items.length;
  $('#results-caption').textContent=state.config?.demo?'Empresas fictícias para demonstração.':'Dados consultados ao vivo na API do Google Places.';
  $$('[data-save]').forEach(b=>b.addEventListener('click',async()=>{
    try{await api('/api/leads',{method:'POST',body:JSON.stringify({placeId:b.dataset.save})});await loadLeads();drawResults();toast('Place ID adicionado ao CRM. Qualifique e registre o consentimento antes de contatar.');}
    catch(e){toast(e.message)}
  }));
  updateMetrics();
}

async function loadImported(){
  const result=await api('/api/import/leads');
  state.imported=result.candidates;
  // Nunca selecionar automaticamente registros novos ou atualizados.
  state.importSelection.clear();
  drawImported();
}
function importedStatus(p){
  return ({sem_site:'Sem site informado',so_rede_social:'Só rede social',com_site:'Site informado',a_verificar:'A verificar'})[p.extractorSiteStatus]||'A verificar';
}
function drawImported(){
  const list=state.imported.filter(p=>state.importFilter==='all'||(state.importFilter==='noSite'&&['sem_site','so_rede_social'].includes(p.extractorSiteStatus))||(state.importFilter==='unverified'&&p.extractorSiteStatus==='a_verificar')||(state.importFilter==='new'&&!p.inCRM));
  $('#import-count').textContent=state.imported.length;
  $('#import-selected-count').textContent=state.importSelection.size;
  $('#import-crm-selected').disabled=state.importSelection.size===0;
  $('#import-results').innerHTML=list.length?list.map(p=>`<div class="import-row ${p.inCRM?'already-crm':''}">
    <label class="import-check"><input type="checkbox" data-candidate="${esc(p.candidateId)}" ${p.inCRM?'disabled':''} ${state.importSelection.has(p.candidateId)?'checked':''} aria-label="Selecionar ${esc(p.name)}"></label>
    <div class="import-row-info"><strong>${esc(p.name)}</strong><small>${esc([p.address,p.city].filter(Boolean).join(' · '))}</small>
    <small>☎ ${esc(p.phone||'Telefone não informado')} · ${esc(importedStatus(p))}</small></div>
    <div class="import-tags"><span class="status ${p.extractorSiteStatus==='sem_site'?'no-site':'has-site'}">${esc(importedStatus(p))}</span>
    <span class="chip">Score extrator: ${p.extractorScore??'—'}</span>${p.inCRM?'<span class="chip">Já está no CRM</span>':''}</div>
  </div>`).join(''):'<div class="empty">Nenhum lead importado neste filtro.</div>';
  $$('[data-candidate]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked)state.importSelection.add(input.dataset.candidate);
    else state.importSelection.delete(input.dataset.candidate);
    $('#import-selected-count').textContent=state.importSelection.size;
    $('#import-crm-selected').disabled=state.importSelection.size===0;
  }));
}
$('#json-import-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const input=$('#json-file'), file=input.files?.[0],button=$('#json-import-btn');
  if(!file)return toast('Escolha um arquivo JSON.');
  if(file.size>1_900_000)return toast('Arquivo muito grande: limite de 1,9 MB.');
  button.disabled=true;button.textContent='Importando…';
  try{
    const data=JSON.parse(await file.text());
    const result=await api('/api/import/leads',{method:'POST',body:JSON.stringify({data})});
    await loadImported();
    $('#import-report').textContent=`${result.imported} novos importados · ${result.duplicateInPool} já na lista · ${result.alreadyInCRM} já no CRM · ${result.duplicatedInFile} repetidos no arquivo · ${result.invalid} inválidos. Nenhum selecionado.`;
    toast(`Importados ${result.imported} leads para a lista. Nenhum selecionado.`);
  }catch(e){toast('Não foi possível importar: '+e.message)}
  finally{button.disabled=false;button.textContent='Importar para a lista';input.value='';}
});
$('#import-crm-selected').addEventListener('click',async()=>{
  const ids=[...state.importSelection];
  if(!ids.length)return toast('Marque manualmente os leads desejados.');
  if(!confirm(`Adicionar ${ids.length} lead(s) selecionado(s) ao CRM?`))return;
  const btn=$('#import-crm-selected');btn.disabled=true;
  try{
    const result=await api('/api/import/leads/to-crm',{method:'POST',body:JSON.stringify({ids})});
    await loadLeads();await loadImported();
    toast(`${result.added} lead(s) adicionados ao CRM; ${result.alreadyInCRM} já existiam.`);
  }catch(e){toast(e.message)}finally{btn.disabled=state.importSelection.size===0;}
});
$$('[data-import-filter]').forEach(b=>b.addEventListener('click',()=>{
  $$('[data-import-filter]').forEach(x=>x.classList.toggle('active',x===b));
  state.importFilter=b.dataset.importFilter;drawImported();
}));

$('#search-form').addEventListener('submit',async(e)=>{
  e.preventDefault();const btn=$('#search-btn');btn.disabled=true;btn.textContent='Buscando…';
  try{const j=await api('/api/search',{method:'POST',body:JSON.stringify({city:$('#city').value,segment:$('#segment').value})});state.results=j.places;for(const p of j.places)state.places[p.id]=p;drawResults();}
  catch(e){toast('Erro na busca: '+e.message)}
  finally{btn.disabled=false;btn.textContent='⌕  Buscar empresas'}
});
$('#test-groq').addEventListener('click',async()=>{
  const button=$('#test-groq');button.disabled=true;button.textContent='Testando IA…';
  try{const result=await api('/api/ai/test',{method:'POST'});$('#groq-info').textContent=`Groq conectada (${result.model}). Resposta: ${result.answer}`;toast('Groq funcionando! Nenhuma mensagem enviada ao WhatsApp.');}
  catch(e){toast('Falha no teste da Groq: '+e.message);}
  finally{button.disabled=false;button.textContent='Testar IA (sem WhatsApp)';}
});
$$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;drawResults()}));
function navigate(view){
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  for(const x of ['discover','pipeline','messages'])$('#'+x+'-view').hidden=x!==view;
  $('#view-title').textContent=({discover:'Descobrir oportunidades',pipeline:'Pipeline comercial',messages:'Central de mensagens'})[view];
  if(view==='pipeline')drawPipeline();if(view==='messages')drawChats();
}
$$('.nav').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
async function hydratePlaces(leads){
  await Promise.all(leads.slice(0,30).filter(l=>!state.places[l.placeId]&&canFetchLive(l)).map(async l=>{
    try{state.places[l.placeId]=await api(`/api/places/${encodeURIComponent(l.placeId)}`)}catch{}
  }));
}
async function drawPipeline(){
  await loadLeads();await hydratePlaces(state.leads);
  $('#crm-list').innerHTML=state.leads.length?state.leads.map(l=>`<button class="crm-item ${state.selected===l.id?'selected':''}" data-crm="${esc(l.id)}"><div><b>${esc(placeName(l))}</b><small>${esc(l.stage)} · ${l.optIn?'Consentimento registrado':'Sem opt-in'}</small></div><span class="priority">${l.score}</span></button>`).join(''):'<div class="empty">Busque empresas e adicione algumas ao CRM.</div>';
  $$('[data-crm]').forEach(b=>b.addEventListener('click',()=>{state.selected=b.dataset.crm;drawPipeline();}));
  if(state.selected){const l=state.leads.find(x=>x.id===state.selected);if(l)drawInspector(l);else $('#inspector').innerHTML='<div class="empty">Selecione um lead.</div>'}
}
const opt=(key,value,label)=>`<option value="${value}" ${key===value?'selected':''}>${label}</option>`;
function drawInspector(l){
  // Os telefones do Google Places são mostrados somente a partir de uma consulta ao vivo.
  // Telefones do Google são consultados ao vivo; só entram no CRM se você clicar em "Usar telefone do Google" e salvar.
  const livePlace = state.places[l.placeId];
  const livePhone = livePlace?.internationalPhoneNumber || livePlace?.nationalPhoneNumber || l.external?.phone || '';
  const phoneLink = String(livePhone).replace(/[^+\d]/g, '');
  const phonePanel = `<div class="google-phone"><strong>${l.external?'Telefone do JSON importado':'Telefone informado no Google Places'}</strong><p>${livePhone ? esc(livePhone) : 'Não informado ou indisponível'}</p>${livePhone ? `<a href="tel:${esc(phoneLink)}">Ligar para o estabelecimento</a>` : ''}<small>Exibido apenas para consulta. Não confirma WhatsApp nem autorização para mensagens comerciais.</small></div>`;
  $('#inspector').innerHTML=`<div class="section-head"><div><span class="eyebrow">02 / QUALIFICAÇÃO</span><h2>${esc(placeName(l))}</h2><p>Informações do Google são consultadas ao vivo. CRM armazena apenas seus próprios registros e o Place ID.</p></div><span class="chip">Lead</span></div>
  <div class="score-box"><strong>${l.score}<small>/100</small></strong><div><b>Score de prioridade comercial</b><br><small>Não representa uma probabilidade calculada de aceitar a proposta.</small></div></div>
  ${phonePanel}
  <form id="lead-form" class="form-grid">
    <label>ETAPA<select name="stage">${['novo','qualificando','contatado','interessado','proposta','ganho','perdido','nao_contatar'].map(v=>opt(l.stage,v,v.replaceAll('_',' '))).join('')}</select></label>
    <label>SITE VERIFICADO MANUALMENTE<select name="websiteVerified">${opt(l.websiteVerified,'nao_verificado','Não verificado')}${opt(l.websiteVerified,'sem_site','Confirmado sem site')}${opt(l.websiteVerified,'com_site','Confirmado com site')}</select></label>
    <label>FIT COM SEU SERVIÇO<select name="marketFit">${[1,2,3,4,5].map(v=>opt(l.marketFit,v,`${v}/5`)).join('')}</select></label>
    <label>CAPACIDADE DE INVESTIMENTO (SUA AVALIAÇÃO)<select name="budgetFit">${[1,2,3,4,5].map(v=>opt(l.budgetFit,v,`${v}/5`)).join('')}</select></label>
    <label>INTERESSE OBSERVADO<select name="interest">${[0,1,2,3].map(v=>opt(l.interest,v,`${v}/3`)).join('')}</select></label>
    <label>TELEFONE / WHATSAPP (DDD + NÚMERO)<input name="phone" value="${esc(formatPhoneDisplay(l.phone))}" placeholder="12 99999-1111"/></label>
    <p class="phone-hint wide">${esc(phoneHint(l))}</p>
    ${canFetchLive(l)?'<button class="secondary wide" type="button" id="fill-google-phone">Usar telefone do Google (consulta ao vivo)</button>':''}
    <label>SEGMENTO (VOCÊ INFORMA)<input name="segmento" value="${esc(l.segmento||'')}" placeholder="ex.: sorveteria, barbearia"/></label>
    <label class="wide">ANOTAÇÕES INDEPENDENTES<textarea name="notes" rows="3" placeholder="Pesquisa própria, dados confirmados, necessidades…">${esc(l.notes)}</textarea></label>
    <label class="wide checkbox-line"><input type="checkbox" name="optIn" ${l.optIn?'checked':''}/> Tenho consentimento explícito para mensagens comerciais nesse WhatsApp</label>
    <label class="wide">COMO E QUANDO OBTEVE CONSENTIMENTO?<textarea name="consentEvidence" rows="2" placeholder="Ex.: formulário de contato preenchido em 20/11; autorizou mensagens no WhatsApp.">${esc(l.consentEvidence)}</textarea></label>
    <label class="wide checkbox-line"><input type="checkbox" name="autoReply" ${l.autoReply?'checked':''}/> Responder automaticamente às mensagens recebidas enquanto autorizado</label>
    <div class="wide form-actions"><button class="primary" type="submit">Salvar qualificação</button></div>
  </form><div class="line"></div><h3>Abordagem e funcionalidades</h3><p>Sugestões do playbook de vendas. Troque os marcadores [nome do negócio], [seu nome] e [sua empresa] antes de enviar.</p><div class="ai-output" id="playbook-box" role="status">Carregando sugestões…</div><div class="line"></div><h3>Análise com Groq</h3><p>A IA usa só o segmento, as anotações e os campos que você preencheu. Não recebe nome, endereço nem fichas do Google.</p><button class="secondary" type="button" id="analyze-lead" ${state.config?.aiConfigured?'':'disabled'}>✦ Analisar oportunidade</button><div class="ai-output" id="lead-insight" role="status">${state.config?.aiConfigured?'Clique em analisar para ver as recomendações.':'Configure GROQ_API_KEY para habilitar.'}</div><div class="line"></div><h3>Enviar mensagem</h3><p>Somente a contatos com opt-in, após mensagem recebida nas últimas 24 horas. Para iniciar fora dessa janela, use modelo aprovado pela API oficial.</p>
  <textarea id="outbound-text" rows="3" placeholder="Digite uma resposta para o contato…"></textarea><div class="form-actions"><button class="primary" id="send-message" type="button">Enviar via Evolution API</button><button class="secondary" type="button" id="go-chat">Ver conversa</button></div>`;
  $('#lead-form').addEventListener('submit',async(e)=>{
    e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f);
    b.optIn=e.target.elements.optIn.checked;b.autoReply=e.target.elements.autoReply.checked;
    try{await api('/api/leads/'+l.id,{method:'PUT',body:JSON.stringify(b)});toast('Lead atualizado.');await drawPipeline();}
    catch(e){toast(e.message)}
  });
  $('#analyze-lead').addEventListener('click',async()=>{
    const button=$('#analyze-lead');button.disabled=true;button.textContent='Analisando…';
    try{const j=await api('/api/leads/'+l.id+'/insight',{method:'POST'});$('#lead-insight').innerHTML=renderInsight(j.insight);
    }catch(e){toast('Erro na análise: '+e.message)}finally{button.disabled=false;button.textContent='✦ Analisar oportunidade'}
  });
  $('#send-message').addEventListener('click',async()=>{
    const text=$('#outbound-text').value.trim();if(!text)return toast('Escreva uma mensagem.');
    try{await api('/api/leads/'+l.id+'/message',{method:'POST',body:JSON.stringify({text})});toast('Mensagem enviada pelo canal configurado.');await drawPipeline();}
    catch(e){toast(e.message)}
  });
  $('#go-chat').addEventListener('click',()=>{state.chatSelected=l.id;navigate('messages')});
  loadPlaybook(l);
  $('#fill-google-phone')?.addEventListener('click',()=>fillGooglePhone(l));
}
function formatPhoneDisplay(d){
  const s=String(d||'');
  if(/^55\d{10,11}$/.test(s)){const ddd=s.slice(2,4),n=s.slice(4);return `+55 (${ddd}) ${n.length===9?n.slice(0,5)+'-'+n.slice(5):n.slice(0,4)+'-'+n.slice(4)}`;}
  return s;
}
function phoneHint(l){
  const d=String(l.phone||'');
  if(!d)return l.external?.phone?'O telefone do JSON importado não tem formato brasileiro reconhecido. Informe manualmente.':'Sem telefone. Informe DDD + número ou use o Google.';
  const celular=d.length===13&&d[4]==='9';
  const origem=l.phoneSource==='importado'?'Preenchido do JSON importado · ':'';
  return origem+(celular?'Celular: WhatsApp provável':'Telefone fixo: WhatsApp improvável')+'. Confirme antes de enviar.';
}
function canFetchLive(l){return !String(l.placeId||'').startsWith('import-');}
async function fillGooglePhone(l){
  const b=$('#fill-google-phone');if(b)b.disabled=true;
  try{
    const p=await api(`/api/places/${encodeURIComponent(l.placeId)}`);
    state.places[l.placeId]=p;
    const tel=p.internationalPhoneNumber||p.nationalPhoneNumber;
    if(!tel)return toast('O Google não informou telefone para este local.');
    $('#lead-form [name=phone]').value=formatPhoneDisplay(tel.replace(/\D/g,''))||tel;
    toast('Telefone preenchido. Clique em Salvar qualificação para gravar.');
  }catch(e){toast(e.message)}
  finally{if(b)b.disabled=false}
}
async function loadPlaybook(l){
  const box=$('#playbook-box');if(!box)return;
  try{const pb=await api(`/api/leads/${l.id}/playbook`);box.innerHTML=renderPlaybook(pb);}
  catch(e){box.textContent='Não foi possível carregar as sugestões.';}
}
function renderPlaybook(pb){
  return `<strong>Dores comuns em ${esc(pb.segmento)}</strong><ul>${pb.dores.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
  <strong>Funcionalidades para propor</strong><ul>${pb.funcionalidades.map(f=>`<li><b>${esc(f.nome)}</b> <small>(precisa de: ${esc(f.precisaDe)})</small></li>`).join('')}</ul>
  <strong>Modelo de primeira mensagem</strong><p><em>${esc(pb.primeiraMensagem)}</em></p>`;
}
function renderInsight(a){
  const itens=(arr,fn)=>arr.length?`<ul>${arr.map(fn).join('')}</ul>`:'<p>—</p>';
  return `<strong>Resumo</strong><p>${esc(a.resumo)}</p>
  <strong>Prioridade: ${esc(a.prioridade.nivel)}</strong><p>${esc(a.prioridade.justificativa)}</p>
  <strong>Objetivo do primeiro contato</strong><p>${esc(a.abordagem.objetivoPrimeiroContato)}</p>
  ${a.abordagem.mensagemInicial?`<strong>Mensagem sugerida</strong><p><em>${esc(a.abordagem.mensagemInicial)}</em></p>`:'<p><small>A IA não gerou uma mensagem segura. Use o modelo acima.</small></p>'}
  <strong>Perguntas para diagnóstico</strong>${itens(a.perguntasDiagnostico,q=>`<li>${esc(q)}</li>`)}
  <strong>Objeções prováveis</strong>${itens(a.objecoes,o=>`<li><b>${esc(o.objecao)}</b>: ${esc(o.resposta)}</li>`)}
  <strong>Funcionalidades sugeridas</strong>${itens(a.funcionalidadesSugeridas,f=>`<li><b>${esc(f.nome)}</b>: ${esc(f.motivo)}${f.precisaDe?` <small>(precisa de: ${esc(f.precisaDe)})</small>`:''}</li>`)}
  <strong>Próximo passo</strong><p>${esc(a.proximoPasso)}</p>
  ${a.cuidados.length?`<strong>Cuidados</strong>${itens(a.cuidados,c=>`<li>${esc(c)}</li>`)}`:''}`;
}
async function drawChats(){
  await loadLeads();await hydratePlaces(state.leads);
  const ordered=[...state.leads].sort((a,b)=>(b.messages.at(-1)?.at||'').localeCompare(a.messages.at(-1)?.at||''));
  $('#chat-list').innerHTML=ordered.length?ordered.map(l=>`<button class="crm-item ${state.chatSelected===l.id?'selected':''}" data-chat="${esc(l.id)}"><div><b>${esc(placeName(l))}</b><small>${l.messages.length} mensagens · ${esc(l.stage)}</small></div><span class="priority">${l.messages.length}</span></button>`).join(''):'<div class="empty">Sem contatos.</div>';
  $$('[data-chat]').forEach(b=>b.addEventListener('click',()=>{state.chatSelected=b.dataset.chat;drawChats()}));
  if(!state.chatSelected)return;
  const l=ordered.find(x=>x.id===state.chatSelected);if(!l)return;
  const bubbles=l.messages.map(m=>`<div class="bubble ${m.direction==='in'?'in':'out'}">${esc(m.text)}<small>${esc(new Date(m.at).toLocaleString('pt-BR'))} · ${esc(m.origin||'WhatsApp')}</small></div>`).join('');
  $('#chat-panel').innerHTML=`<h2>${esc(placeName(l))}</h2><p>${l.autoReply?'Resposta automática ativada':'Atendimento manual'} · ${l.optIn?'Opt-in registrado':'Sem opt-in'}${l.optedOut?' · Não contatar':''}</p><div class="chat-msgs">${bubbles||'<div class="empty">Nenhuma mensagem recebida ainda.</div>'}</div><div class="form-actions"><button class="secondary" id="edit-chat-lead">Gerenciar lead</button></div>`;
  $('#edit-chat-lead').addEventListener('click',()=>{state.selected=l.id;navigate('pipeline')});
}
init();
