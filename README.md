# A Voz do Cristão — Sistema de Projeção

## ⬇️ Baixar e instalar

### **[➡️ BAIXAR O APLICATIVO (Windows)](https://github.com/abnerzynn/a-voz-do-cristao/releases/latest)**

1. Clique no link acima.
2. Baixe o arquivo **`A-Voz-do-Cristao-Setup-x.x.x.exe`**.
3. Dê dois cliques nele e siga a instalação.
4. Abra o aplicativo — ele **já vem conectado** e baixa sozinho as mensagens da igreja.

> **Se o Windows mostrar "O Windows protegeu o seu PC":** clique em
> **Mais informações** → **Executar assim mesmo**. Isso acontece porque o
> instalador não tem assinatura digital paga — não é vírus.

> **Na primeira vez**, a sincronização baixa centenas de mensagens e pode levar
> um ou dois minutos. Depois disso tudo fica no computador e funciona **sem internet**.

Atualizações seguintes são **automáticas**: basta abrir o aplicativo.

---


Aplicativo **desktop para Windows** para organizar, buscar e projetar mensagens de
William Marrion Branham. Funciona **offline**, projeta em outro monitor e transmite
o texto pela **rede local** (inclusive uma saída transparente para o **OBS**).

Não é um site convertido em `.exe` — é um programa desktop (Electron) pensado para
uso durante o culto, no estilo do Holyrics, porém focado exclusivamente em mensagens.

## Recursos

- **Roteiro do culto**: monte a lista de leituras da pregação (cole a lista do Word e o
  aplicativo localiza cada mensagem por título e data), e projete sem procurar nada.
- **Sincronização na nuvem**: a mesma biblioteca e o mesmo roteiro em todos os
  computadores da igreja, sem configurar nada.
- **Cadastro de mensagens** com título, dia, mês (por extenso), ano e tradução
  (VGR, GO, AM, MH, MLE, VSA, CB).
- **Separação automática de parágrafos** pela numeração (tudo entre o número 10 e o
  11 pertence ao parágrafo 10), preservando falas, colchetes, pontuação e continuações.
- **Slides inteligentes**: limite padrão de 250 caracteres (configurável), divisão
  equilibrada que nunca corta palavras e prioriza ponto final, depois `? !`, `: ;`,
  vírgula e por último o espaço.
- **Busca por título + parágrafo** (ex.: *Humilha-te*, parágrafo 46) com tolerância a
  erros de digitação — abre direto no primeiro slide do parágrafo.
- **Busca por palavra/frase** em todas as mensagens, com trecho e destaque.
- **Projeção** em segundo/terceiro monitor, tela cheia, com atalhos
  (← → Home End, espaço = próximo).
- **Transmissão pela rede local** (sem internet): `/view/slide` (completo) e
  `/view/text` (somente texto, **fundo transparente real** para o OBS).
- **Backup**: exportar / importar / restaurar em outro computador.
- Tema claro/escuro, controle real do tamanho da fonte, cores da projeção.

## Como executar (desenvolvimento)

```bash
npm install
npm start
```

## Gerar o instalador (.exe) para Windows

```bash
npm run dist
```

O instalador é gerado na pasta `dist/`.

## Onde ficam os dados

Tudo é salvo localmente em um único arquivo JSON dentro da pasta de dados do
aplicativo (`%APPDATA%/a-voz-do-cristao/avoz-database.json`). O backup é uma cópia
desse arquivo — basta importá-lo em outro computador.

## Transmissão / OBS

1. Abra a aba **Transmissão** e clique em **Iniciar transmissão**.
2. Copie o endereço (ex.: `http://192.168.5.63:5757/view/slide`).
3. No OBS, adicione uma **Fonte de navegador** com o endereço
   `http://SEU-IP:5757/view/text` para receber **somente o texto com fundo
   transparente**. Ao trocar o slide no aplicativo, o OBS atualiza sozinho.

## Estrutura do projeto

```
main.js            Processo principal do Electron (janelas, IPC, monitores)
preload.js         Ponte segura entre a interface e o processo principal
src/parser.js      Identificação dos parágrafos numerados
src/slicer.js      Criação inteligente dos slides
src/db.js          Banco de dados JSON (CRUD, busca, backup)
src/server.js      Servidor local de transmissão (HTTP + SSE)
renderer/          Interface (index.html, styles.css, app.js) e janela de projeção
```
