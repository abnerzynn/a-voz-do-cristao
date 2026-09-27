'use strict';

/**
 * Identificação de parágrafos em mensagens de William Marrion Branham.
 *
 * As mensagens são numeradas por parágrafo. Um número de parágrafo aparece
 * no início de uma linha, seguido do texto. Tudo que vier depois pertence
 * ao mesmo parágrafo até que o próximo número apareça.
 *
 * Preserva: falas, colchetes, pontuação, continuações em novas linhas e o
 * conteúdo original. Não separa apenas por linha.
 */

// Linha que começa com um número seguido de espaço e texto: "10 Alguém..."
const INLINE_MARKER = /^\s*(\d{1,4})[\.\)]?\s+(\S.*)$/;
// Linha que contém apenas um número: "10"
const ALONE_MARKER = /^\s*(\d{1,4})[\.\)]?\s*$/;

function countChars(text) {
  return text ? text.replace(/\s+/g, ' ').trim().length : 0;
}

/**
 * Analisa o texto completo e devolve os parágrafos numerados.
 * @param {string} raw
 * @returns {{paragraphs: Array<{number:number|null, text:string, charCount:number}>, warnings: string[]}}
 */
function parseParagraphs(raw) {
  const warnings = [];
  if (!raw || !raw.trim()) {
    return { paragraphs: [], warnings: ['Texto vazio.'] };
  }

  // Normaliza quebras de linha, mantém o restante do conteúdo intacto.
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  // --- 1ª passagem: levanta todos os candidatos a número de parágrafo ---
  const candidatos = [];
  lines.forEach((line, i) => {
    const inline = line.match(INLINE_MARKER);
    const alone = line.match(ALONE_MARKER);
    const m = inline || alone;
    if (m) candidatos.push({ i, num: parseInt(m[1], 10), resto: inline ? m[2] : '' });
  });

  // --- 2ª passagem: aceita apenas os que formam a sequência real ---
  // Um número só é marcador se a numeração continuar a partir dele. Assim,
  // números soltos no início de linha (a data do cabeçalho, um versículo,
  // um ano) não "sequestram" a contagem e não engolem os parágrafos seguintes.
  const aceitos = [];
  let lastNumber = null;
  for (let k = 0; k < candidatos.length; k++) {
    const c = candidatos[k];
    const proximos = candidatos.slice(k + 1, k + 4);

    if (lastNumber === null) {
      // O primeiro marcador precisa iniciar uma sequência (ou ser o único).
      if (candidatos.length === 1 || proximos.some(x => x.num === c.num + 1)) {
        aceitos.push(c);
        lastNumber = c.num;
      }
      continue;
    }
    if (c.num === lastNumber + 1) {
      aceitos.push(c);
      lastNumber = c.num;
      continue;
    }
    // Salto verdadeiro na numeração: só vale se a sequência seguir depois dele.
    if (c.num > lastNumber + 1 && c.num <= lastNumber + 20 &&
        proximos.some(x => x.num === c.num + 1)) {
      aceitos.push(c);
      lastNumber = c.num;
    }
    // Caso contrário: número solto no meio do texto — ignora.
  }
  const marcadores = new Map(aceitos.map(c => [c.i, c]));

  // --- 3ª passagem: monta os parágrafos ---
  const paragraphs = [];
  let current = null;      // parágrafo em construção
  let intro = [];          // texto antes do primeiro número

  const pushCurrent = () => {
    if (current) {
      const text = current.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      paragraphs.push({
        number: current.number,
        text,
        charCount: countChars(text)
      });
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marcador = marcadores.get(i);

    if (marcador) {
      pushCurrent();
      if (intro.length && paragraphs.length === 0) {
        const introText = intro.join('\n').trim();
        if (introText) {
          paragraphs.push({
            number: null,
            text: introText,
            charCount: countChars(introText)
          });
          warnings.push('Há texto antes do primeiro parágrafo numerado (marcado como introdução).');
        }
        intro = [];
      }
      current = { number: marcador.num, lines: [] };
      if (marcador.resto) current.lines.push(marcador.resto);
      continue;
    }

    // Linha comum: pertence ao parágrafo atual (ou à introdução).
    if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }

  pushCurrent();

  // Se nada foi detectado como número, guarda tudo como um único bloco.
  if (paragraphs.length === 0 && intro.join('').trim()) {
    const text = intro.join('\n').trim();
    paragraphs.push({ number: null, text, charCount: countChars(text) });
    warnings.push('Nenhum número de parágrafo foi encontrado. O texto foi salvo como um único bloco.');
  }

  // Verifica saltos na numeração (possível erro de leitura/OCR).
  const numbered = paragraphs.filter(p => p.number !== null);
  for (let i = 1; i < numbered.length; i++) {
    const gap = numbered[i].number - numbered[i - 1].number;
    if (gap > 1) {
      warnings.push(
        `Salto na numeração: do parágrafo ${numbered[i - 1].number} para ${numbered[i].number}.`
      );
    }
  }

  // Parágrafos vazios (número sem texto).
  for (const p of numbered) {
    if (p.charCount === 0) {
      warnings.push(`Parágrafo ${p.number} está sem texto.`);
    }
  }

  return { paragraphs, warnings };
}

module.exports = { parseParagraphs, countChars };
