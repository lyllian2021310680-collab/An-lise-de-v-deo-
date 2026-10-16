# PRD — AVA Vôlei Analytics (Análise de vídeo de voleibol)

## Problem statement (reconstrução)
O usuário enviou um projeto existente (zip) e pediu: recriar o projeto fielmente, do jeito que está,
verificar todas as funções, corrigir erros de código, finalizar o que estiver incompleto e ver o que
dá para adicionar — SEM mudar comportamento/visual que já funciona. App de análise técnica de vôlei da
AVA (Associação Voleibol Assisense): identidade vermelho/preto, galeria de vídeos, pastas de atletas,
análise técnica (marcar fundamentos no tempo exato, classificar, atletas), marcações visuais sobre o
vídeo, placar/rallies, relatórios coletivos e individuais, IA e exportação. Preparado para, no futuro,
viver dentro do site principal dos atletas.

## User choices
- Vídeos: link do YouTube **e** envio de arquivo (Emergent object storage).
- IA mantida como no original: Claude (claude-sonnet-5-5) via Emergent Universal Key (sem custo de chave).
- Sem login no MVP (acesso aberto). Controle de acesso real → Fase 2.
- Extras aditivos aprovados: campo "ID externo" por atleta + camada de integração isolada (local).

## Architecture
- Backend: FastAPI + MongoDB (uuid string ids, `_id` excluído, datetime ISO). Emergent object storage
  (`/api/upload`, `/api/files/{path}`). Seed + migrate idempotentes no startup.
- Camada de integração ISOLADA: `backend/integration_layer.py` (router `/api/integration/*`), hoje
  local/desconectada; env futura `EXTERNAL_SITE_URL`/`EXTERNAL_SITE_API_KEY`.
- Frontend: React 19 + React Router + Tailwind + shadcn/ui + Recharts + lucide-react. Tema escuro
  padrão (vermelho/preto), toggle claro. Fontes: Barlow Condensed, Inter, JetBrains Mono.
- Coleções: videos, athletes, positions, formations, fundamentos, classificacoes, actions, rallies,
  kphases, categorias, equipes, saved_filters, settings, files.

## Personas
- Treinador/analista (admin): importa, analisa, marca, gera relatórios.
- (Futuro) Atleta: acesso individual às próprias análises dentro do site principal.

## Reconstrução + correções (2026-06)
- Projeto recriado fielmente a partir do zip enviado; todas as páginas e rotas restauradas.
- Backend configurado com EMERGENT_LLM_KEY; storage inicializa OK; seed/migrate rodam no startup.
- Dependências instaladas (emergentintegrations). Verificação função por função concluída.
- Testes: 51/51 casos de backend (pytest) passam; fluxos de frontend 100% nos smoke tests.
- Nenhum bug crítico encontrado — o código original estava íntegro; faltava apenas a configuração de
  ambiente (chave Emergent) para IA e armazenamento funcionarem.

## Adicionado (aditivo, sem alterar o existente)
- `external_id` (ID externo) opcional no cadastro de atletas (reservado p/ casar com o site principal).
- Camada de integração isolada `/api/integration/status | pull-athletes | push-analyses` (no-op local,
  pronta para Fase 2). App é embutível (iframe) — sem restrição de frame no backend.

## Backlog / próximos
- P1: Exportação de VÍDEO renderizado (clipe/compilação com marcações) — edições já em metadados.
- P1: Transcrição de vídeo com marcação de tempo (Gemini) para uploads/YouTube.
- P2: Busca por título/atleta na galeria já existe; adicionar exportar análise em PDF/TXT.
- Fase 2: conectar a camada de integração ao site principal (importar atletas reais, enviar análises),
  autenticação/permissões conforme o site principal.
- Fase 3: painéis de comparação entre atletas, metas e alertas de frequência; compartilhamento por link.

## Observações técnicas (não bloqueantes)
- Aviso cosmético do Recharts (width/height=-1) ao montar gráfico em aba oculta em /relatorios.
- server.py grande (~1300 linhas): possível modularização futura (videos/actions/rallies/ai/stats).

## Iteração 2 (2026-06) — melhorias pontuais
- Marcações vinculadas ao instante (startTime/endTime editáveis, "agora"), visíveis só no período; lista de marcações; posição "Fixa na tela" ou "Acompanhar jogador/objeto" (quadros-chave manuais interpolados, arrastar pausado ou rodando). Clique vazio desmarca.
- Placar: botões de ponto travados durante o envio (anti clique duplo); "Desfazer ponto" e remover ponto por rally (POST /api/rallies/{id}/remove-point: reopen|detach|delete com confirm_delete, 409 sem confirmação); renumeração + recálculo. Lances avulsos (detached) não entram no próximo ponto; PATCH /api/actions/{id}/attach devolve.
- Exportar clipes renderizados com marcações (canvas + MediaRecorder no navegador, mp4/webm) por lance, rally e trecho em edição. YouTube exige anexar arquivo original (PATCH /api/videos/{id}/original).
- PDF (jsPDF + html2canvas, tema claro) em Relatórios (aba atual), Dossiê do atleta e resposta da IA.
- Resposta da IA em markdown formatado (react-markdown + remark-gfm).
- Recorte antes/depois e retime NÃO alterados.

## Iteração 3 (2026-06)
- Relatórios: botão "Relatório completo (PDF)" percorre todas as abas (Geral, Recepção, Por Formação — uma seção por formação com dados, Mapa de Calor, Comparação se houver resultado) e gera um único PDF com títulos de seção e paginação. "PDF da aba" mantém a exportação da aba atual.
