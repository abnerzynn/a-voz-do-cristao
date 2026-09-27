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

  const paragraphs = [];
  let current = null;      // parágrafo em construção
  let intro = [];          // texto antes do primeiro número
  let lastNumber = null;

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

  for (const line of lines) {
    const inline = line.match(INLINE_MARKER);
    const alone = line.match(ALONE_MARKER);
    const match = inline || alone;

    if (match) {
      const num = parseInt(match[1], 10);
      // Aceita como novo marcador se for o primeiro, ou se for
      // estritamente maior que o último (numeração monotônica crescente).
      // Isso evita tratar anos ("1963") ou referências no meio da frase
      // como número de parágrafo — esses não iniciam a linha isolados.
      const isMarker =
        lastNumber === null ? true : num > lastNumber && num <= lastNumber + 50;

      if (isMarker) {
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
        current = { number: num, lines: [] };
        lastNumber = num;
        if (inline && match[2]) current.lines.push(match[2]);
        continue;
      }
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
