# Terminal Controls — Spec

## Contexto

O terminal embutido (xterm.js + node-pty) funciona para I/O básico, mas não possui keybindings padrão de terminal que usuários esperam. Combinações como Ctrl+Shift+C (copiar), Ctrl+Shift+V (colar) e Ctrl+Enter não funcionam.

## Problema

O `TerminalView.tsx` apenas conecta `term.onData()` ao WebSocket — não há `attachCustomKeyEventHandler` nem tratamento de eventos especiais. Tudo é passado cru para o PTY, e combinações com Shift ou modificadores compostos não geram códigos de controle ASCII, então são silenciosamente ignoradas.

## Requisitos

| ID | Requisito | Prioridade | Status |
|----|-----------|------------|--------|
| TC-01 | Ctrl+Shift+C copia texto selecionado no terminal para clipboard | Must | Done |
| TC-02 | Ctrl+Shift+V cola texto do clipboard no terminal | Must | Done |
| TC-03 | Ctrl+Shift+A seleciona todo o conteúdo do terminal | Should | Done |
| TC-04 | Ctrl+Enter envia newline literal (`\n`) ao PTY | Should | Done |
| TC-05 | Keybindings não devem interferir com atalhos normais do terminal (Ctrl+C = SIGINT, Ctrl+D = EOF, etc.) | Must | Done |
| TC-06 | Handler registrado no cache (junto com criação do terminal), sobrevive navegação | Must | Done |
| TC-07 | Cross-platform: Ctrl (Linux/Win) + Cmd (macOS) via `ctrlKey \|\| metaKey` | Must | Done |
| TC-08 | Toast "Texto copiado" ao copiar seleção com sucesso | Must | Done |
| TC-09 | Right-click seleciona palavra sob cursor (`rightClickSelectsWord: true`) | Nice | Done |

## Boas Práticas Aplicadas (pesquisa xterm.js + node-pty)

- **Issue #2293**: Handler bloqueia tanto `keydown` quanto `keyup` para keybindings customizados (previne keyup fantasma)
- **`event.code`**: Usado para teclas de letra (layout-independente), `event.key` para teclas especiais (Enter)
- **`term.paste()`**: Método oficial que trata bracketed paste mode automaticamente
- **`rightClickSelectsWord`**: Opção nativa do xterm.js para UX de seleção com botão direito
- **Handler lightweight**: Checagem rápida via `matchesKeybinding()` antes de qualquer lógica — sem impacto em performance

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/lib/terminal-keybindings.ts` | **Novo** — lógica isolada dos keybindings |
| `apps/web/src/lib/terminal-cache.ts` | Registra keybindings na criação + `rightClickSelectsWord` |
| `apps/web/src/components/TerminalView.tsx` | Conecta callback de toast ao handler de copy |
