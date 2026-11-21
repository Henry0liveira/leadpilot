import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {extractMessages} from '../parse.mjs';
import {classifyByRules,sanitizeClassification} from '../classify.mjs';
import {createBridge} from '../server.mjs';
import {stableOutcomeId} from '../supabase.mjs';

const inst='leadpilot';
const event={event:'messages.upsert',instance:inst,data:{key:{id:'abc123',remoteJid:'5512999999999@s.whatsapp.net',fromMe:false},message:{conversation:'Qual é o preço de um site?'},messageTimestamp:1795000000}};
const secret='a'.repeat(64),botSecret='b'.repeat(64);
const config={instance:inst,gatewaySecret:secret,botSecret,botUrl:'http://127.0.0.1:8788'};
test('extrai evento real e ignora mensagem sem ID',()=>{
 const ms=extractMessages(event,{instance:inst});
 assert.equal(ms.length,1);assert.equal(ms[0].body,'Qual é o preço de um site?');
 assert.equal(extractMessages({...event,data:{...event.data,key:{remoteJid:'5512999999999@s.whatsapp.net',fromMe:false}}},{instance:inst}).length,0);
});
test('não registra grupos por padrão e reconhece pedido de humano',()=>{
 const group={...event,data:{...event.data,key:{id:'id2',remoteJid:'120363000@g.us',fromMe:false},message:{extendedTextMessage:{text:'!bot olá'}}}};
 assert.equal(extractMessages(group).length,0);
 assert.equal(extractMessages(group,{saveGroups:true}).length,1);
 assert.equal(classifyByRules('Quero falar com um atendente').outcome,'human_handoff');
 assert.equal(classifyByRules('não quero mais').outcome,'not_interested');
 assert.equal(sanitizeClassification({outcome:'inexistente'},classifyByRules('olá')).outcome,'pending');
});
test('identificadores de resultado são estáveis',()=>{
 assert.equal(stableOutcomeId('o','j','id'),stableOutcomeId('o','j','id'));
 assert.notEqual(stableOutcomeId('o','j','id'),stableOutcomeId('o','j','id2'));
});
test('ponte encaminha evento ao bot e cria fila antes de confirmar',async()=>{
 let forwarded=0,processed=0;
 const dir=await mkdtemp(path.join(tmpdir(),'leadpilot-queue-'));
 const bridge=createBridge(config,{queueDir:dir,store:{syncPayload:async messages=>{processed+=messages.length;}},fetchImpl:async(url,opts)=>{
   forwarded++;assert.ok(url.endsWith('/groq-bot/'+botSecret));assert.equal(opts.method,'POST');return {ok:true,status:202};
 }});
 const req={url:'/webhooks/evolution/'+secret,method:'POST',headers:{'content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(event))}};
 const response={writeHead(code){this.status=code;},end(){}};
 await bridge.handler(req,response);
 assert.equal(response.status,202);assert.equal(forwarded,1);
 for(let i=0;i<40&&processed<1;i++)await new Promise(r=>setTimeout(r,25));
 assert.equal(processed,1);assert.deepEqual(await readdir(dir),[]);
 await rm(dir,{recursive:true,force:true});
});
test('segredo incorreto não encaminha',async()=>{
 const bridge=createBridge(config,{store:{syncPayload:async()=>{}},fetchImpl:async()=>{throw Error('não deve chamar')}});
 const response={writeHead(code){this.status=code;},end(){}};
 await bridge.handler({url:'/webhooks/evolution/invalid',method:'POST'},response);
 assert.equal(response.status,404);
});
