import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {extractMessages} from './parse.mjs';
import {createStore} from './supabase.mjs';

export function createBridge(config,{fetchImpl=fetch,store,queueDir='./data/queue'}={}){
  const {instance='leadpilot',gatewaySecret,botSecret,botUrl='http://127.0.0.1:8788',saveGroups=false}=config;
  if(!gatewaySecret||gatewaySecret.length<32||!botSecret||botSecret.length<32)throw new Error('Segredos de webhook ausentes ou curtos');
  if(!/^http:\/\/127\.0\.0\.1:8788\/?$/.test(botUrl))throw new Error('BOT_LOCAL_URL deve apontar ao bot local na porta 8788');
  const queue=path.resolve(queueDir);
  const backend=store||createStore(config,{fetchImpl});
  const compare=(a,b)=>{
    const x=Buffer.from(String(a)),y=Buffer.from(String(b));
    return x.length===y.length&&timingSafeEqual(x,y);
  };
  async function enqueue(payload){
    await mkdir(queue,{recursive:true,mode:0o700});
    const json=JSON.stringify(payload);
    const name=createHash('sha256').update(json).digest('hex')+'.json';
    try {await writeFile(path.join(queue,name),json,{flag:'wx',mode:0o600});}
    catch(e){if(e.code!=='EEXIST')throw e;}
  }
  let active=false;
  async function drain(){
    if(active)return;
    active=true;
    try {
      await mkdir(queue,{recursive:true,mode:0o700});
      for(const filename of (await readdir(queue)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort().slice(0,100)){
        const full=path.join(queue,filename);
        try {
          const payload=JSON.parse(await readFile(full,'utf8'));
          const msgs=extractMessages(payload,{instance,saveGroups});
          await backend.syncPayload(msgs);
          await unlink(full);
        } catch(e) {
          console.error('[bridge] sincronização pendente:',e.message.slice(0,180));
          break;
        }
      }
    } finally {active=false;}
  }
  function reply(res,code,body=''){
    res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(body?{error:body}:{ok:true}));
  }
  async function handler(req,res){
    const pathname=(req.url||'').split('?')[0];
    if(pathname==='/health'&&req.method==='GET')return reply(res,200);
    const match=/^\/webhooks\/evolution\/([A-Za-z0-9_-]+)$/.exec(pathname);
    if(req.method!=='POST'||!match||!compare(match[1],gatewaySecret))return reply(res,404);
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return reply(res,415,'Content-Type deve ser application/json');
    let bytes=0;const chunks=[];
    try{
      for await(const part of req){bytes+=part.length;if(bytes>256_000)return reply(res,413,'Evento muito grande');chunks.push(part);}
      const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.instance!==instance)return reply(res,400,'Instância inválida');
      const event=String(payload.event||'').replaceAll('.','_').toUpperCase();
      if(event!=='MESSAGES_UPSERT')return reply(res,202);
      await enqueue(payload);
      const upstream=await fetchImpl(botUrl.replace(/\/$/,'')+'/groq-bot/'+botSecret,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)
      });
      if(!upstream.ok){console.error('[bridge] bot respondeu HTTP',upstream.status);return reply(res,502,'Bot temporariamente indisponível');}
      void drain().catch(e=>console.error('[bridge] erro no processamento:',e.message.slice(0,180)));
      return reply(res,202);
    } catch(e){console.error('[bridge] falha ao receber evento:',e.message.slice(0,160));return reply(res,502,'Falha temporária de processamento');}
  }
  return {handler,drain,enqueue};
}
function envFlag(name,fallback=false){return ['true','1','yes','on'].includes(String(process.env[name]??fallback).toLowerCase());}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const config={
    instance:process.env.EVOLUTION_INSTANCE||'leadpilot',gatewaySecret:process.env.GATEWAY_WEBHOOK_SECRET,
    botSecret:process.env.BOT_WEBHOOK_SECRET,botUrl:process.env.BOT_LOCAL_URL||'http://127.0.0.1:8788',
    url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY,
    ownerId:process.env.LEADPILOT_OWNER_ID,saveGroups:envFlag('SAVE_GROUP_MESSAGES',false),
    analyzeWithGroq:envFlag('GROQ_OUTCOMES_ENABLED',true),groqKey:process.env.GROQ_API_KEY||'',groqModel:process.env.GROQ_MODEL||'openai/gpt-oss-20b'
  };
  const bridge=createBridge(config,{queueDir:process.env.QUEUE_DIR||'/app/data/queue'});
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8789);
  http.createServer((req,res)=>{void bridge.handler(req,res).catch(e=>{console.error('[bridge] request error',e.message);if(!res.headersSent){res.writeHead(500);res.end();}});}).listen(port,host,()=>{
    console.log('[bridge] ouvindo em '+host+':'+port+', instância '+config.instance);
    void bridge.drain();
    setInterval(()=>{void bridge.drain();},15000).unref();
  });
}
