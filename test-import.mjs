import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLeadExport, sameBusiness, fingerprints } from './lead-import.mjs';

const base={name:'Sorveteria Estrela', address:'Rua São José 150, Pindamonhangaba SP', city:'Pindamonhangaba SP', phone:'(12) 99999-1111', score:87, website:''};
test('importa leads válidos e marca como a verificar quando site está vazio',()=>{
  const r=normalizeLeadExport({leads:[base]});
  assert.equal(r.leads.length,1);
  assert.equal(r.leads[0].name,base.name);
  assert.equal(r.leads[0].extractorSiteStatus,'a_verificar');
  assert.equal(r.leads[0].extractorScore,87);
});
test('elimina duplicatas no arquivo quando nome e endereço coincidem, mesmo com telefones diferentes',()=>{
  const r=normalizeLeadExport({results:[base,{...base,phone:'(12) 99999-2222', maps:'https://google.com/maps/place/Sorveteria+Estrela'}]});
  assert.equal(r.leads.length,1);
  assert.equal(r.duplicatedInFile,1);
});
test('detecta duplicata por nome e telefone com endereço alterado',()=>{
  const r=normalizeLeadExport([base,{...base,address:'Outra avenida de Pinda', website:'https://example.org'}]);
  assert.equal(r.duplicatedInFile,1);
});
test('não marca empresas diferentes só por telefone compartilhado e cidade',()=>{
  const a=normalizeLeadExport([base]).leads[0];
  const b=normalizeLeadExport([{...base,name:'Sorveteria Outro Nome'}]).leads[0];
  assert.equal(sameBusiness(a,b),false);
});
test('compara URL do Maps e Google Place ID',()=>{
  const a=normalizeLeadExport([{...base, googlePlaceId:'ChIJteste',mapsUrl:'https://www.google.com/maps/place/Foo?hl=pt&entry=ttu'}]).leads[0];
  const b=normalizeLeadExport([{...base,name:'Foo Renomeado',address:'Rua Outro 4', phone:'(12) 8888-9999',placeId:'ChIJteste',maps:'https://www.google.com/maps/place/Foo?hl=en'}]).leads[0];
  assert.equal(sameBusiness(a,b),true);
  assert.ok(fingerprints(a).size>0);
});
test('campos não confiáveis não viram scripts e recusam registros sem identidade mínima',()=>{
  assert.equal(normalizeLeadExport([{name:'Teste'}]).invalid,1);
  assert.throws(()=>normalizeLeadExport({arbitrary:'no list'}));
});
test('link de WhatsApp no campo de site não conta como site próprio',()=>{
  const r=normalizeLeadExport([{name:'Loja Teste',address:'Rua A 10, Pinda',website:'https://api.whatsapp.com/send?phone=5512999991111'}]);
  assert.equal(r.leads[0].extractorSiteStatus,'so_rede_social');
});
