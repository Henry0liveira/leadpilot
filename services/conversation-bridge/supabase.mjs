import {createHash} from 'node:crypto';
import {classifyByRules,classifyWithGroq} from './classify.mjs';

export const stableOutcomeId=(owner,jid,messageId)=>{
  const x=createHash('sha256').update(owner+'|'+jid+'|'+messageId).digest('hex');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-5'+x.slice(13,16)+'-a'+x.slice(17,20)+'-'+x.slice(20,32);
};
export function createStore(config,{fetchImpl=fetch}={}){
  const {url,secretKey,ownerId,instance='leadpilot',groqKey='',groqModel='openai/gpt-oss-20b',analyzeWithGroq=false}=config;
  if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url||''))throw new Error('SUPABASE_URL inválida');
  if(!secretKey||!ownerId||!/^[-0-9a-f]{36}$/i.test(ownerId))throw new Error('SUPABASE_SECRET_KEY ou LEADPILOT_OWNER_ID ausente');
  const base=url.replace(/\/$/,'')+'/rest/v1/';
  async function rest(table,{method='GET',params={},body,prefer}={}){
    const qs=new URLSearchParams(params);
    const target=base+table+(qs.size?'?'+qs.toString():'');
    const headers={'apikey':secretKey,'Content-Type':'application/json'};
    if(prefer)headers.Prefer=prefer;
    const response=await fetchImpl(target,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      const reason=await response.text().catch(()=> '');
      throw new Error('Supabase '+table+': HTTP '+response.status+'; código '+(response.headers?.get?.('x-supabase-error-code')||'desconhecido')+'; '+(reason.includes('permission denied')?'permissão insuficiente':''));
    }
    if(response.status===204)return [];
    return await response.json();
  }
  async function upsert(table,conflict,row){
    const records=await rest(table,{method:'POST',params:{on_conflict:conflict},body:row,prefer:'resolution=merge-duplicates,return=representation'});
    if(!Array.isArray(records)||!records[0]?.id)throw new Error('Supabase '+table+': upsert sem registro');
    return records[0];
  }
  async function read(table,params){return rest(table,{params:{...params,limit:'12'}});}
  async function syncOne(msg){
    const {chatJid,senderJid,fromMe,body,at,isGroup,messageId}=msg;
    let contactId=null;
    if(!isGroup){
      const old=await read('contacts',{select:'id',owner_id:'eq.'+ownerId,whatsapp_jid:'eq.'+chatJid});
      if(old.length)contactId=old[0].id;
      else {
        const created=await upsert('contacts','owner_id,whatsapp_jid',{
          owner_id:ownerId,whatsapp_jid:chatJid,
          phone:chatJid.endsWith('@s.whatsapp.net')?chatJid.slice(0,-'@s.whatsapp.net'.length):null
        });
        contactId=created.id;
      }
    }
    const oldConversation=await read('conversations',{select:'id,last_message_at',owner_id:'eq.'+ownerId,instance_name:'eq.'+instance,remote_jid:'eq.'+chatJid});
    let conversation=oldConversation[0];
    if(!conversation){
      conversation=await upsert('conversations','owner_id,instance_name,remote_jid',{
        owner_id:ownerId,contact_id:contactId,instance_name:instance,remote_jid:chatJid,
        chat_type:isGroup?'group':'direct',last_message_at:at
      });
    } else if(!conversation.last_message_at||Date.parse(at)>Date.parse(conversation.last_message_at)){
      await rest('conversations',{method:'PATCH',params:{id:'eq.'+conversation.id,owner_id:'eq.'+ownerId},
        body:{last_message_at:at},prefer:'return=minimal'});
    }
    const unique=messageId+':'+(fromMe?'out':'in');
    const existing=await read('messages',{select:'id',conversation_id:'eq.'+conversation.id,external_message_id:'eq.'+unique});
    if(!existing.length){
      await upsert('messages','id',{
        id:stableOutcomeId(ownerId,chatJid,unique+':message'),
        owner_id:ownerId,conversation_id:conversation.id,external_message_id:unique,
        sender_jid:senderJid,direction:fromMe?'outgoing':'incoming',sender_type:fromMe?'bot':'contact',
        content:body,created_at:at
      });
    }
    const duplicate=existing.length>0;
    if(fromMe||isGroup)return duplicate?{duplicate:true}:{saved:true};
    const stored=await read('conversation_outcomes',{select:'id',id:'eq.'+stableOutcomeId(ownerId,chatJid,unique)});
    if(stored.length)return duplicate?{duplicate:true}:{saved:true};
    const rule=classifyByRules(body);
    let classification={...rule,extracted_by:'system'};
    if(analyzeWithGroq&&groqKey){
      const history=await read('messages',{select:'direction,content',conversation_id:'eq.'+conversation.id,order:'created_at.desc'});
      classification=await classifyWithGroq({body,history:history.reverse(),key:groqKey,model:groqModel,fetchImpl});
    }
    const outcome={id:stableOutcomeId(ownerId,chatJid,unique),owner_id:ownerId,
      conversation_id:conversation.id,outcome:classification.outcome,
      sentiment:classification.sentiment,summary:classification.summary,
      main_need:classification.main_need||null,objections:classification.objections||null,
      next_action:classification.next_action||null,extracted_by:classification.extracted_by,
      model_name:classification.model_name||null,confidence:classification.confidence,
      metadata:{source:'evolution',message_id:unique},recorded_at:at
    };
    await upsert('conversation_outcomes','id',outcome);
    return {saved:!duplicate,duplicate,analyzed:true};
  }
  async function syncPayload(messages){
    const result={saved:0,duplicates:0,analyzed:0};
    for(const m of messages){
      const r=await syncOne(m);
      if(r.duplicate)result.duplicates++;
      if(r.saved)result.saved++;
      if(r.analyzed)result.analyzed++;
    }
    return result;
  }
  return {syncPayload,rest};
}
