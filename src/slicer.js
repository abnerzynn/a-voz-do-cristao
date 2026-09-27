'use strict';

/**
 * Criação inteligente de slides a partir de um parágrafo.
 *
 * Regras:
 *  - Cada parágrafo começa obrigatoriamente em um novo slide.
 *  - Limite padrão de 250 caracteres por slide (configurável).
 *  - Nº de slides = ceil(tamanho / limite): até 250 -> 1, 251..500 -> 2, etc.
 *  - Divisão equilibrada: nunca corta palavra ao meio; prioriza ponto final,
 *    depois ? / !, depois : / ;, depois vírgula e por último espaço.
 */

const CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']', '}', '…']);

// Prioridade do ponto de quebra conforme o caractere que o antecede.
function breakPriority(ch) {
  switch (ch) {
    case '.':
    case '…':
    case '!':
    case '?':
      return 5; // fim de frase
    case ':':
    case ';':
      return 3; // dois-pontos / ponto e vírgula
    case ',':
      return 2; // vírgula
    default:
      return 1; // apenas espaço entre palavras
  }
}

// Caractere "significativo" antes de um espaço, ignorando aspas/parênteses de fechamento.
function meaningfulCharBefore(text, spaceIndex) {
  let i = spaceIndex - 1;
  while (i >= 0 && CLOSERS.has(text[i])) i--;
  return i >= 0 ? text[i] : '';
}

/**
 * Divide um texto em N partes equilibradas escolhendo bons pontos de quebra.
 */
function splitBalanced(text, parts) {
  if (parts <= 1) return [text.trim()];

  const L = text.length;
  const target = L / parts;

  // Todos os espaços são candidatos a ponto de corte (corte entre palavras).
  const candidates = [];
  for (let i = 0; i < L; i++) {
    if (text[i] === ' ' || text[i] === '\n') {
      candidates.push({
        index: i,
        priority: breakPriority(meaningfulCharBefore(text, i))
      });
    }
  }

  const cuts = [];
  let lastCut = 0;
  const window = Math.max(30, target * 0.6);

  for (let k = 1; k < parts; k++) {
    const ideal = Math.round(k * target);
    let best = null;
    let bestScore = -Infinity;

    for (const c of candidates) {
      if (c.index <= lastCut) continue;
      const dist = Math.abs(c.index - ideal);
      if (dist > window && best) continue; // fora da janela, já temos candidato
      // Pontuação: prioridade domina; distância desempata.
      const score = c.priority * 1000 - dist;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best) {
      cuts.push(best.index);
      lastCut = best.index;
    } else {
      // Sem espaço disponível: corta no ideal (raro; palavra muito longa).
      cuts.push(ideal);
      lastCut = ideal;
    }
  }

  const pieces = [];
  let start = 0;
  for (const cut of cuts) {
    pieces.push(text.slice(start, cut).trim());
    start = cut;
  }
  pieces.push(text.slice(start).trim());

  return pieces.filter(p => p.length > 0);
}

/**
 * Gera os slides de um único parágrafo.
 * @param {{number:number|null, text:string}} paragraph
 * @param {number} limit  Limite de caracteres por slide.
 * @returns {Array<{text:string, paragraphNumber:number|null, posInParagraph:number, total:number, charCount:number}>}
 */
function slideParagraph(paragraph, limit) {
  const clean = (paragraph.text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const parts = Math.max(1, Math.ceil(clean.length / limit));
  const pieces = splitBalanced(clean, parts);

  return pieces.map((text, i) => ({
    text,
    paragraphNumber: paragraph.number,
    posInParagraph: i + 1,
    partsInParagraph: pieces.length,
    charCount: text.length
  }));
}

/**
 * Gera todos os slides da mensagem a partir dos parágrafos.
 */
function buildSlides(paragraphs, limit) {
  const cfgLimit = Number(limit) > 0 ? Number(limit) : 250;
  const slides = [];
  let position = 0;
  for (const p of paragraphs) {
    for (const s of slideParagraph(p, cfgLimit)) {
      position += 1;
      slides.push({ ...s, posTotal: position });
    }
  }
  return slides;
}

module.exports = { buildSlides, slideParagraph, splitBalanced };
