/** Extrai mensagens textuais de eventos MESSAGES_UPSERT da Evolution API. */
export function extractText(input) {
  let msg=input;
  for(let depth=0; depth<3 && msg && typeof msg==='object'; depth++) {
    const next=msg.ephemeralMessage?.message||msg.viewOnceMessage?.message||msg.viewOnceMessageV2?.message;
    if(!next)break;
    msg=next;
  }
  for(const value of [msg?.conversation,msg?.extendedTextMessage?.text,msg?.imageMessage?.caption,msg?.videoMessage?.caption,msg?.documentMessage?.caption]) {
    if(typeof value==='string' && value.trim())return value.trim().slice(0,4000);
  }
  return '';
}
export function extractMessages(payload,{instance='leadpilot',saveGroups=false}={}) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Payload inválido');
  const event=String(payload.event||'').replaceAll('.','_').toUpperCase();
  if(event!=='MESSAGES_UPSERT')return [];
  if(payload.instance!==instance)throw new Error('Instância inesperada');
  const data=payload.data;
  const items=Array.isArray(data)?data:Array.isArray(data?.messages)?data.messages:[data];
  return items.flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const key=item.key||{};
    if(typeof key.fromMe!=='boolean'||typeof key.id!=='string'||!key.id.trim())return [];
    const jid=String(key.remoteJid||'');
    const isGroup=jid.endsWith('@g.us');
    if(!isGroup&&!jid.endsWith('@s.whatsapp.net')&&!jid.endsWith('@lid'))return [];
    if(isGroup&&!saveGroups)return [];
    const text=extractText(item.message);
    if(!text)return [];
    const stamp=item.messageTimestamp?.low??item.messageTimestamp;
    const secs=Number(stamp);
    const at=Number.isFinite(secs)&&secs>1e9&&secs<4.1e9 ? new Date(secs*1000).toISOString():new Date().toISOString();
    return [{messageId:key.id.trim(),chatJid:jid,senderJid:String(key.participant||item.participant||jid),
      isGroup,fromMe:key.fromMe,body:text,at}];
  });
}
