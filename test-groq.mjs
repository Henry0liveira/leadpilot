import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatGroq, GROQ_ENDPOINT, DEFAULT_GROQ_MODEL } from './groq.mjs';

test('Groq usa endpoint correto, chave apenas no header e modelo configurado', async()=>{
  let recorded;
  const response=await chatGroq({apiKey:'CHAVE_DE_TESTE_NAO_REAL',messages:[{role:'user',content:'Oi'}],fetchImpl:async (url,opts)=>{
    recorded={url,opts};return {ok:true,status:200,json:async()=>({choices:[{message:{content:'Conexão simulada ok'}}]})};
  }});
  assert.equal(response,'Conexão simulada ok');
  assert.equal(recorded.url,GROQ_ENDPOINT);
  assert.equal(recorded.opts.headers.Authorization,'Bearer CHAVE_DE_TESTE_NAO_REAL');
  assert.equal(JSON.parse(recorded.opts.body).model,DEFAULT_GROQ_MODEL);
  assert.ok(!recorded.opts.body.includes('CHAVE_DE_TESTE_NAO_REAL'));
});
test('Groq recebe json mode para insight', async()=>{
  let sent;
  const response=await chatGroq({apiKey:'mock',jsonMode:true,messages:[{role:'user',content:'analisar'}],fetchImpl:async(_url,opts)=>{
    sent=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"resumo":"ok"}'}}]})};
  }});
  assert.equal(JSON.parse(response).resumo,'ok');
  assert.deepEqual(sent.response_format,{type:'json_object'});
});
test('Erros de autenticação não retornam detalhes sensíveis',async()=>{
  await assert.rejects(chatGroq({apiKey:'mock',messages:[{role:'user',content:'Oi'}],fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'segredo fictício'}})})}),e=>{
    assert.match(e.message,/Chave Groq inválida/);
    assert.ok(!e.message.includes('segredo fictício'));
    return true;
  });
});
test('Groq sem chave é bloqueada',async()=>{
  await assert.rejects(chatGroq({apiKey:'',messages:[{role:'user',content:'Oi'}]}),/GROQ_API_KEY/);
});
