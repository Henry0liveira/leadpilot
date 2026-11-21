// Normalização de telefones brasileiros para o formato usado pelo WhatsApp: 55 + DDD + número.
// Aceita "(12) 99999-1111", "12999991111", "+55 12 99999-1111" etc.
// Retorna null quando não é possível garantir um número brasileiro válido.

export function normalizePhoneBR(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    // já tem código do país
  } else if (d.length === 10 || d.length === 11) {
    d = '55' + d;
  } else {
    return null;
  }
  const ddd = d.slice(2, 4);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  const numero = d.slice(4);
  const celular = numero.length === 9 && numero.startsWith('9');
  return {
    digits: d,
    ddd,
    numero,
    celular,
    whatsappProvavel: celular,
    formatado: `+55 (${ddd}) ${celular ? `${numero.slice(0, 5)}-${numero.slice(5)}` : `${numero.slice(0, 4)}-${numero.slice(4)}`}`,
  };
}

// Para exibir no campo de formulário sem depender de nova validação no navegador.
export function formatPhoneDisplay(digits) {
  const info = normalizePhoneBR(digits);
  return info ? info.formatado : String(digits || '');
}
