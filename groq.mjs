/** Integração Groq (somente no servidor). Nunca exponha GROQ_API_KEY ao navegador. */
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

/**
 * @param {Object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {Array<{role:string,content:string}>} options.messages
 * @param {number} [options.maxTokens]
 * @param {boolean} [options.jsonMode]
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function chatGroq({apiKey, model=DEFAULT_GROQ_MODEL, messages, maxTokens=500, jsonMode=false, fetchImpl=fetch}) {
  if (!apiKey || !String(apiKey).trim()) throw new Error('Configure GROQ_API_KEY no arquivo .env.');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Mensagens para a IA não informadas.');
  const request = {
    model,
    messages,
    max_completion_tokens:maxTokens,
    reasoning_effort:'low',
    ...(jsonMode ? {response_format:{type:'json_object'}} : {})
  };
  const response=await fetchImpl(GROQ_ENDPOINT, {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}`},
    body:JSON.stringify(request),
    signal:AbortSignal.timeout(25000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) {
    // Erros genéricos: evita retornar segredos ou mensagens arbitrárias do provedor.
    if(response.status===401||response.status===403)throw new Error('Chave Groq inválida ou sem permissão. Gere uma nova chave e configure no .env.');
    if(response.status===429)throw new Error('Limite de requisições da Groq atingido. Tente novamente mais tarde.');
    throw new Error(`Falha na Groq (HTTP ${response.status}). Verifique modelo, limites e conexão.`);
  }
  const content=result.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw new Error('A Groq não retornou conteúdo de resposta.');
  return content.trim();
}
