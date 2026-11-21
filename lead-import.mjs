import { createHash } from 'node:crypto';

// Importador defensivo: dados de um export JSON não equivalem a dados validados pelo usuário.
const key = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const asText = (v, max = 500) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
function field(obj, ...names) {
  const entries = Object.entries(obj || {});
  for (const candidate of names) {
    const found = entries.find(([k]) => key(k) === key(candidate));
    if (found && found[1] !== null && found[1] !== undefined) return found[1];
  }
  return undefined;
}
function cleanUrl(v, opts = {}) {
  const raw = asText(v, 700);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (opts.maps && !(url.hostname === 'google.com' || url.hostname.endsWith('.google.com') || url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl')) return '';
    return url.toString().slice(0, 700);
  } catch { return ''; }
}
function siteStatus(entry, website) {
  const stated = field(entry, 'siteStatus','websiteStatus','siteVerification','websiteVerification','statusSite','verificacaoSite','siteVerified','siteState');
  const hasSite = field(entry, 'hasWebsite','hasSite','temSite','possuiSite','websiteExists');
  const noSite = field(entry, 'noWebsite','noSite','semSite');
  const status = key(stated);
  if (['nosite','semsite','naotemsite','none','absent','confirmedno','confirmedabsent'].includes(status)) return 'sem_site';
  if (['socialonly','socialmediaonly','soredessociais','soredessocial','somenteredesocial'].includes(status)) return 'so_rede_social';
  if (['unverified','unknown','averificar','naoverificado','pending'].includes(status)) return 'a_verificar';
  if (['website','hassite','comsite','verifiedyes','ownwebsite'].includes(status)) return 'com_site';
  if (noSite === true || key(noSite)==='sim' || key(noSite)==='true') return 'sem_site';
  if (hasSite === false || ['nao','false','0'].includes(key(hasSite))) return 'sem_site';
  if (hasSite === true || ['sim','true','1'].includes(key(hasSite))) return website ? 'com_site' : 'a_verificar';
  if (website) return /(?:instagram\.com|facebook\.com|linktr\.ee|wa\.me|api\.whatsapp\.com|whatsapp\.com)(?:\/|$)/i.test(website) ? 'so_rede_social' : 'com_site';
  // Website vazio NÃO comprova ausência do site.
  return 'a_verificar';
}
function unwrap(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') throw new Error('O arquivo precisa conter uma lista JSON de estabelecimentos.');
  for (const k of ['leads','results','items','data','businesses','companies','estabelecimentos','negocios']) {
    const v = field(payload, k);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      for (const nested of ['leads','items','results']) {
        const a = field(v, nested); if (Array.isArray(a)) return a;
      }
    }
  }
  throw new Error('Nenhuma lista de leads encontrada. Exportação esperada: array JSON ou objeto com leads/results/items/data.');
}
function normalize(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const name = asText(field(entry, 'name','nome','empresa','businessName','business','title','estabelecimento','nomeEmpresa'), 180);
  const address = asText(field(entry, 'address','endereco','formattedAddress','fullAddress','localizacao'), 300);
  const city = asText(field(entry, 'city','cidade','municipio','cidadeUf','cityState'), 100);
  const phone = asText(field(entry, 'phone','telefone','phoneNumber','telefonePrincipal','internationalPhoneNumber','nationalPhoneNumber','celular','contactPhone'), 60);
  const category = asText(field(entry, 'category','categoria','type','tipo','segmento'), 120);
  const website = cleanUrl(field(entry, 'website','site','websiteUrl','siteUrl','urlSite','dominio'));
  const maps = cleanUrl(field(entry, 'maps','googleMapsUrl','mapsUrl','googleMapsUri','mapsLink','linkGoogleMaps','urlGoogleMaps','urlMaps','linkMaps','placeUrl','googleMapsLink','mapsURL'),{maps:true});
  const googlePlaceId = asText(field(entry,'placeId','googlePlaceId','googleMapsPlaceId'), 160);
  const ratingValue = field(entry, 'rating','nota','avaliacao','averageRating','stars');
  const rating = ratingValue === undefined || ratingValue === '' ? null : Number(String(ratingValue).replace(',','.'));
  const reviewsValue = field(entry, 'reviewCount','reviewsCount','reviews','totalReviews','numeroAvaliacoes','avaliacoes','ratingCount','userRatingCount');
  const reviewCount = reviewsValue === undefined || reviewsValue === '' ? null : Number(String(reviewsValue).replace(/[^\d]/g,''));
  const scoreValue = field(entry, 'score','priorityScore','prioridade','pontuacao','leadScore');
  const score = scoreValue === undefined || scoreValue === '' ? null : Number(scoreValue);
  if (!name) return null;
  if (!address && !city && !phone && !maps) return null; // evita empresas sem identificador adicional
  const identity = maps || `${key(name)}|${key(address)}|${key(city)}|${String(phone).replace(/\D/g,'')}`;
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return {
    placeId:`import-${hash}`, googlePlaceId, name, address, city, category,
    phone, website, maps,
    rating:Number.isFinite(rating) && rating>=0 && rating<=5 ? rating : null,
    reviewCount:Number.isInteger(reviewCount) && reviewCount>=0 ? reviewCount : null,
    extractorScore:Number.isFinite(score) && score>=0 && score<=100 ? Math.round(score) : null,
    extractorSiteStatus:siteStatus(entry,website),
    searchTerm:asText(field(entry, 'searchQuery','searchTerm','busca','termoBusca','sourceQuery'),120),
    extractedAt:asText(field(entry, 'capturedAt','extractedAt','dataCaptura','createdAt','timestamp'),80)
  };
}
export function normalizeLeadExport(payload, limit = 1500) {
  const arr = unwrap(payload);
  if (arr.length > limit) throw new Error(`Limite de ${limit} leads por arquivo. Divida a exportação.`);
  const leads = []; let invalid = 0, duplicatedInFile = 0;
  for (const raw of arr) {
    const lead=normalize(raw);
    if (!lead) {invalid++;continue;}
    if (leads.some(existing=>sameBusiness(existing,lead))) {duplicatedInFile++;continue;}
    leads.push(lead);
  }
  return {leads, inputCount:arr.length, invalid, duplicatedInFile};
}

// Critérios fortes de duplicidade: ID do Google, URL da ficha, nome+endereço ou nome+telefone.
// Não mesclar empresas apenas por nome/cidade ou por telefone compartilhado.
export function fingerprints(lead) {
  const tokens=new Set();
  const n=key(lead.name), a=key(lead.address), phone=String(lead.phone||'').replace(/\D/g,'');
  const gp=String(lead.googlePlaceId||'').trim();
  if (gp) tokens.add('google:'+gp);
  if (lead.maps) {
    try {
      const u=new URL(lead.maps);
      u.searchParams.delete('hl');u.searchParams.delete('authuser');u.searchParams.delete('entry');
      u.hash='';
      tokens.add('maps:'+u.toString().replace(/\/$/,''));
    } catch {}
  }
  if(n && a && a.length>=8) tokens.add('address:'+n+':'+a);
  if(n && phone.length>=10) tokens.add('phone:'+n+':'+phone);
  if(lead.placeId) tokens.add('id:'+lead.placeId);
  return tokens;
}
export function sameBusiness(a,b) {
  const bTokens=fingerprints(b);
  return [...fingerprints(a)].some(t=>bTokens.has(t));
}
