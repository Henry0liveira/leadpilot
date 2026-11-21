import test from 'node:test';
import assert from 'node:assert/strict';
import { playbookFor, buildInsightMessages, sanitizeInsight } from './playbook.mjs';

test('escolhe o segmento mesmo com acentos e variações', () => {
  assert.match(playbookFor('Sorveteria artesanal').segmento, /Sorveteria/);
  assert.match(playbookFor('Açaíteria').segmento, /Sorveteria/);
  assert.match(playbookFor('Salão de beleza').segmento, /Barbearia/);
});

test('segmento desconhecido cai no padrão com funcionalidades', () => {
  const pb = playbookFor('');
  assert.equal(pb.segmento, 'Negócio local');
  assert.ok(pb.funcionalidades.length > 0);
});

test('a primeira mensagem não tem preço nem link', () => {
  const pb = playbookFor('sorveteria');
  assert.doesNotMatch(pb.primeiraMensagem, /R\$|https?:\/\//);
});

test('o prompt não envia nome nem endereço do negócio, só dados do operador', () => {
  const messages = buildInsightMessages({
    id: 'x', nome: 'Nome Secreto Ltda', address: 'Rua Escondida 123',
    segmento: 'sorveteria', notes: 'vende só pelo delivery', websiteVerified: 'sem_site',
    marketFit: 4, budgetFit: 3, interest: 1, stage: 'novo', priorityScore: 70,
  }, { business: 'Orbyte', offer: 'sites' });
  const todo = messages.map((m) => m.content).join('\n');
  assert.doesNotMatch(todo, /Nome Secreto/);
  assert.doesNotMatch(todo, /Rua Escondida/);
  assert.match(todo, /vende só pelo delivery/);
  assert.equal(messages[0].role, 'system');
});

test('sanitizeInsight bloqueia preço e link na mensagem inicial', () => {
  const r = sanitizeInsight({
    resumo: 'ok', proximoPasso: 'ligar',
    abordagem: { mensagemInicial: 'Por R$ 500 faço seu site em https://x.com' },
  });
  assert.equal(r.abordagem.mensagemInicial, '');
});

test('sanitizeInsight limita listas e corrige nível inválido', () => {
  const r = sanitizeInsight({
    resumo: 'ok', proximoPasso: 'ligar',
    prioridade: { nivel: 'altíssimo' },
    perguntasDiagnostico: ['a', 'b', 'c', 'd', 'e', 'f'],
    funcionalidadesSugeridas: [{ nome: 'Cardápio' }, { nome: '' }],
  });
  assert.equal(r.prioridade.nivel, 'morno');
  assert.equal(r.perguntasDiagnostico.length, 4);
  assert.equal(r.funcionalidadesSugeridas.length, 1);
});

test('sanitizeInsight rejeita resposta sem resumo ou próximo passo', () => {
  assert.throws(() => sanitizeInsight({ resumo: '' }), /incompleta/);
  assert.throws(() => sanitizeInsight(null), /incompleta/);
});
