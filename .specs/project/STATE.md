# State

## Decisions

| Date       | Decision                                                            | Rationale                                                                                                                         |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-18 | Usar Electron + React (referencia t3code)                           | Crossplatform, stack conhecida, referencia funcional disponivel                                                                   |
| 2026-03-18 | Bun = tooling (install, dev, scripts), Node.js = runtime (Electron) | Bun nao roda dentro do Electron. Mesmo modelo do t3code                                                                           |
| 2026-03-18 | Rewrite completo — zero dependencia do iara Go                      | Desktop reimplementa toda logica em TypeScript                                                                                    |
| 2026-03-18 | Clean break no formato de dados                                     | Nao compativel com .iara/ da CLI Go. SQLite + JSONL do Claude                                                                     |
| 2026-03-18 | Monorepo Turborepo com Bun                                          | Consistencia com t3code, performance de build                                                                                     |
| 2026-03-18 | Effect-TS para error handling                                       | Consistencia com t3code, composability                                                                                            |
| 2026-03-18 | Crossplatform macOS + Linux + Windows                               | t3code ja tem suporte completo Windows (NSIS, icones, paths, CI)                                                                  |
| 2026-03-18 | Sem mode selection                                                  | Descartado do escopo                                                                                                              |
| 2026-03-18 | Sem chat rendering                                                  | Desktop lanca terminal com contexto, nao renderiza conversa                                                                       |
| 2026-03-18 | Sem session persistence                                             | Descartado — nao restaura layout ao reabrir                                                                                       |
| 2026-03-18 | Sem auto-updater                                                    | Descartado do MVP e v1                                                                                                            |
| 2026-03-18 | Browser panel no scope                                              | Inspirado no cmux agent-browser. Split vertical toggle. UI so aparece no M3                                                       |
| 2026-03-18 | Sem split panes complexos                                           | Apenas split vertical para browser panel                                                                                          |
| 2026-03-18 | Sidebar com metadata rica                                           | branch, ports, status, last active por task                                                                                       |
| 2026-03-18 | Tasks como workspaces visuais                                       | Cada task e um workspace com paineis (overview, dev logs, browser)                                                                |
| 2026-03-18 | --plugin-dir para slash commands                                    | Mecanismo correto do Claude Code para registrar comandos interativos                                                              |
| 2026-03-18 | System prompt em dois niveis: TASK.md + PROJECT.md                  | PROJECT.md real na raiz do projeto, TASK.md por task. Task root tem symlink → ../PROJECT.md. Ambos via --append-system-prompt     |
| 2026-03-18 | System prompts editaveis na UI e em editor                          | Arquivos .md no task root, editaveis em qualquer editor. UI tambem edita                                                          |
| 2026-03-18 | Socket como padrao unico de comunicacao                             | CLI bridge → Unix socket/named pipe. Um mecanismo, zero ambiguidade                                                               |
| 2026-03-18 | Hooks: merge em settings global, nao overwrite                      | Merge em ~/.claude/settings.json. Guard por IARA_DESKTOP_SOCKET env var, no-op se ausente                                         |
| 2026-03-18 | Dev server frontend auto-abre browser                               | Health check + heuristica (vite/next = frontend, go/python = backend)                                                             |
| 2026-03-18 | syncShellEnvironment                                                | Essencial para encontrar claude, git no PATH (referencia t3code)                                                                  |
| 2026-03-18 | SQLite + Drizzle ORM para data persistence                          | Um arquivo, queries, migrations tipadas. Drizzle por DX e type-safety                                                             |
| 2026-03-18 | Sessions lidos do JSONL do Claude                                   | Sem duplicacao. Desktop le ~/.claude/projects/<path-hash>/<session-id>.jsonl direto                                               |
| 2026-03-18 | Env files como arquivos no projeto                                  | Editaveis em IDE/editor. Symlinks globais como iara CLI. Injetados via child_process.spawn                                        |
| 2026-03-18 | Env vars editaveis pela UI e por arquivo                            | UI edita + arquivos editaveis em qualquer editor. Watch detecta mudancas                                                          |
| 2026-03-18 | Prompt de restart ao detectar mudanca de envs                       | Watch detecta alteracao → pergunta ao usuario se quer reiniciar                                                                   |
| 2026-03-18 | Restart Claude Code preserva session                                | Ao reiniciar, relanca com --resume <session-id> para manter contexto                                                              |
| 2026-03-18 | So worktrees — sem "default branch"                                 | Toda interacao requer task (worktree). Nao existe abrir projeto sem task                                                          |
| 2026-03-18 | Repos main em .repos/ dentro do projeto                             | Clonados na criacao do projeto. Worktrees criadas a partir de .repos/. Auto-contido                                               |
| 2026-03-18 | DX baseada no t3code                                                | mise, dev-runner com portas deterministicas, hot-restart Electron, smoke test                                                     |
| 2026-03-18 | Setup project e new task sao fluxos do desktop                      | Fluxos da UI que usam claude -p internamente. Nao sao skills nem slash commands                                                   |
| 2026-03-18 | M1 so scaffold + worktrees                                          | Nenhuma feature user-facing alem do shell. Domain layer + git ops. Features UI a partir do M2                                     |
| 2026-03-18 | Terminal embutido promovido para M5 (v2)                            | Ao inves de launch externo, renderizar xterm.js dentro do app com Claude via node-pty. Spec em .specs/features/embedded-terminal/ |
| 2026-03-18 | Filesystem como fonte de verdade para projetos                      | Pastas em ~/.iara/projects/ definem existencia. DB é cache de metadata. Pastas manuais reconhecidas automaticamente               |
| 2026-03-18 | Rename de nome visual, slug/pasta imutavel                          | Nome é visual (DB). Slug é a pasta no filesystem. Renomear pasta quebraria worktrees e references                                 |
| 2026-03-18 | Repos devem ter nome definido pelo usuario                          | Nome sugerido automaticamente da URL/pasta, mas editavel. Nome é o diretorio em .repos/                                           |
| 2026-03-18 | Sem GitHub integration no wizard (futuro)                           | Apenas Git URL, pasta local, e repo vazio por enquanto. gh integration como feature futura                                        |
| 2026-03-18 | File picker copia pasta + git init se necessario                    | Pasta local sem .git recebe git init. Pasta é copiada para .repos/, nao linkada                                                   |
| 2026-03-18 | Dialogs de confirmacao in-app, nao nativos                          | Modal customizado dentro do app com contexto rico (lista repos, tasks ativas, etc)                                                |
| 2026-03-18 | Projeto sem repos permitido apenas se pasta criada manualmente      | Wizard exige >= 1 repo. Pastas manuais sem .repos/ aparecem como projeto vazio                                                    |

## Blockers

_Nenhum no momento._

## Lessons Learned

_Primeira sessao._

## Deferred Ideas

- Git visualization (branch graph)
- Dashboard com metricas de sessoes
- Plugin system para extensibilidade de terceiros
- Auto-updater
