# localia

Interface local de geração e edição de imagens (ComfyUI) com chat auxiliar (Ollama), rodando inteiramente no notebook do Rafa. Projeto pessoal; repositório público `localia` no GitHub (conta rafaortman), já criado.

## Hardware (restrição central)

- Dell G15 5530 · i7-13650HX · **RTX 3050 6 GB VRAM** · **16 GB RAM DDR5** (2×8 GB Hynix 4800, ambos os slots ocupados) · Windows 11 Pro.
- **Só um modelo cabe na VRAM por vez.** Toda decisão de arquitetura parte disso.
- Upgrade para 2×16 GB está em avaliação; não assumir que aconteceu.

## Princípios

- Otimizar o hardware para a renderização da imagem acima de tudo.
- Simplicidade: sem framework de front, sem build, sem dependências npm.
- Validar restrições e pré-requisitos na prática antes de construir. Medir, não supor.

## Arquitetura

```
Navegador → http://localhost:3000
        ▼
server.js  (Node, só módulos nativos: http, fs, path, net)
 ├─ serve /public
 ├─ /comfy/*  → proxy HTTP + WebSocket → ComfyUI Desktop 127.0.0.1:8000
 ├─ /ollama/* → proxy HTTP (streaming)  → Ollama 127.0.0.1:11434
 └─ /api/mode → estado global do modo (image | chat) + troca de VRAM
```

- Servidor escuta em `127.0.0.1` (fase standalone). Expor na rede interna depois = trocar para `0.0.0.0` + regra no Firewall do Windows. Não implementar agora.
- ComfyUI e Ollama nunca são expostos diretamente; só via proxy.
- Configuração local (portas, nome do checkpoint, modelo do Ollama) em `config.json` (gitignored), com `config.example.json` versionado.

Estrutura:

```
localia/
├─ CLAUDE.md
├─ README.md
├─ server.js
├─ config.example.json
├─ workflows/        ← workflows ComfyUI em formato API (JSON), escritos à mão
│  ├─ zimage-txt2img.json   ← Z-Image Turbo (padrão)
│  ├─ zimage-img2img.json
│  ├─ zimage-inpaint.json
│  ├─ txt2img.json          ← SDXL (alternativa)
│  ├─ img2img.json
│  └─ inpaint.json
└─ public/
   ├─ index.html
   ├─ style.css
   └─ app.js         ← ES modules nativos
```

`.gitignore`: `config.json`, `node_modules/`, imagens geradas/enviadas, qualquer arquivo de modelo.

## Modos e troca de VRAM

O modo é **global no servidor** (uma GPU = um estado). Toggle na interface chama `/api/mode`.

- **→ image**: descarrega o Ollama (`POST /api/generate {"model": <modelo>, "keep_alive": 0}`). O modelo de imagem fica residente.
- **→ chat**: libera o ComfyUI (`POST /free {"unload_models": true, "free_memory": true}`). O LLM fica residente.
- Mostrar indicador de "carregando modelo" durante a troca. Medido (`bench/swap.js`, arquivos já no cache de RAM do Windows): ~4 s para o chat, ~2 s para a imagem. Com cache frio (primeira vez após boot) medimos 25 s no Ollama e +7 s no SDXL. Com o Z-Image (`bench/zimage-full.js`): ~6,8 s para o chat e nenhuma carga extra medida para voltar à imagem (os modelos ficaram em cache de RAM); uso de RAM do sistema ~14 de 15,7 GB, mas a medição inclui o cache de arquivos do Windows e não é conclusiva.
- Bloquear envio de imagem em modo chat e vice-versa.

## Modo imagem (ComfyUI; Z-Image Turbo por padrão, SDXL como alternativa)

**Decisão do Rafa (2026-10-23):** o modelo padrão é o **Z-Image Turbo**, com **troca manual** para o SDXL (SDXL base ou RealVisXL). Motivo: qualidade superior nos testes (`bench/out/contact.html`) e os 3 modos validados nos 6 GB. A troca vale para a sessão inteira, nunca por modo, e mostra "carregando modelo". Cada modelo usa a sua família de workflows (`zimage-*.json` ou `*.json`). Com o Z-Image selecionado, a interface esconde cfg, sampler e prompt negativo (o modelo é destilado: cfg 1, 8 steps, sem negativo); com o SDXL, mostra todos.

A interface é uma caixa de prompt + imagem opcional + máscara opcional. O modo é inferido:

| Entrada | Workflow | Nós principais |
|---|---|---|
| só prompt | txt2img | CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage → KSampler → VAEDecode → SaveImage |
| prompt + imagem | img2img | LoadImage → VAEEncode → KSampler (denoise < 1) |
| prompt + imagem + máscara | inpaint | LoadImage + LoadImageMask → VAEEncode → SetLatentNoiseMask → KSampler (denoise ~0.75) |

- Os nós da tabela são os do SDXL. Z-Image Turbo: `UNETLoader` (z_image_turbo_bf16) + `CLIPLoader` (qwen_3_4b, type lumina2) + `VAELoader` (ae) → `CLIPTextEncode` → `ConditioningZeroOut` (negativo) → `ModelSamplingAuraFlow` (shift 3) → `KSampler` (8 steps, cfg 1, res_multistep, simple) → `VAEDecode` → `SaveImage`; img2img e inpaint acrescentam `LoadImage` + `VAEEncode` (+ `LoadImageMask` + `SetLatentNoiseMask` no inpaint), como no SDXL.
- Workflows escritos diretamente em formato API; o front preenche prompt, negativo, seed, steps, cfg, tamanho, denoise, nomes de arquivo.
- Fluxo da API do ComfyUI: `POST /upload/image` (imagem e máscara) → `POST /prompt {prompt, client_id}` → WebSocket `/ws?clientId=` (`progress`, `executing` com node `null` = fim, `execution_success`/`execution_error`) → `GET /history/{prompt_id}` → `GET /view?filename=&subfolder=&type=output`.
- `GET /object_info/CheckpointLoaderSimple` para listar checkpoints instalados.
- `POST /interrupt` para cancelar.
- Redimensionar imagens enviadas no front para ~1 MP com lados múltiplos de 64 antes do upload (evita estourar VRAM).
- **Defaults Z-Image Turbo (padrão):** 1024×1024, 8 steps, cfg 1, `res_multistep` + `simple` (valores do template do Comfy Desktop, fixos). Tempo medido: ~36 s por imagem quente (~52 s a primeira, com a carga). Pico de ~5,4 GB de VRAM, com offload para a RAM. Denoise provisório: img2img 0,8; inpaint 0,9 (o inpaint seguiu menos o prompt que o SDXL numa amostra: gorro estampado em vez de vermelho). Licença Apache 2.0. ~19 GB em disco (UNET 11,5 + text encoder 7,5 + VAE).
- Defaults SDXL (quando o SDXL está selecionado; decididos pelo Rafa após o benchmark): 1024×1024 (ou buckets equivalentes), **steps 15**, **cfg 7**, sampler `dpmpp_2m`, scheduler `karras` (provisório: `euler_ancestral` como opção, não testado com várias seeds). Tempo medido: ~24 s por imagem com 15 steps em 1024² (~32 s com 25).
- Denoise (provisório): img2img 0,8; inpaint 0,9.
- **Checkpoints SDXL instalados:** `sd_xl_base_1.0` e RealVisXL V5.0 (lista via `/object_info/CheckpointLoaderSimple`); quando o SDXL está selecionado, o padrão é o SDXL base. Tempo da troca entre dois modelos de imagem ainda não medido. Não alternar modelos automaticamente entre modos.
- Viés a lembrar: no teste de img2img/inpaint a imagem de entrada foi gerada pelo RealVisXL, o que pode ter favorecido esse modelo; a escolha do denoise 0,8 e 0,9 vale para essa entrada.
- **Valores editáveis, com linguagem clara (decisão do Rafa):** seed e denoise ficam sempre editáveis; steps, cfg, sampler e prompt negativo só aparecem com o SDXL (o Z-Image tem esses valores fixos). Mudar qualquer valor gera **outra imagem** (parecida, não igual; medido: cfg, tamanho e sampler mudam a composição mesmo com a mesma seed), então o botão de confirmação se chama **"Recriar imagem"**, nunca "Aplicar" ou "Atualizar". A seed fica travada por padrão (maximiza a semelhança) e cada resultado mostra os valores usados. Para refinar a mesma imagem sem refazê-la, o caminho é "continuar a partir desta" (img2img).
- **Tamanho fixo em 1024 (decisão do Rafa):** mudar o tamanho com a mesma seed muda a composição inteira da imagem (medido em 768/896/1024), então não há "rascunho rápido" que preveja a imagem final. Não oferecer tamanhos menores como prévia.
- Máscara: canvas com pincel sobre a imagem, exportada como PNG.
- Qualquer resultado pode virar a entrada da próxima geração ("continuar a partir desta").
- **Presets de estilo**: botões que acrescentam blocos prontos ao prompt e, no SDXL, um negativo padrão (o Z-Image não usa negativo). Custo zero de hardware.
- Limitações a comunicar na UI: o CLIP entende descrições (não instruções), não tem memória entre envios e funciona muito melhor em inglês.

## Modo chat (Ollama)

- Modelo pequeno (3–4B; definir nos testes). Streaming via `/api/chat`.
- Uso principal: transformar pedidos em português no melhor prompt SDXL em inglês (descritivo, separado por vírgulas) + negativo.
- Botão **"usar como prompt"**: copia o texto para o campo de imagem e troca o modo para image.
- Nunca empilhar LLM e SDXL na mesma operação.

## Métricas (para comparar setups no teste prático)

- Imagem: tempo total de render, checkpoint, steps, cfg, sampler, seed, tamanho, denoise — exibidos em cada resultado.
- Chat: tokens/s (`eval_count / eval_duration` da resposta do Ollama) e tempo de carga do modelo.
- Troca de modo: tempo medido.

## Fora do MVP (não implementar sem pedido)

LLM empilhado na geração · IP-Adapter · modelo dedicado de inpainting · Qwen-Image-Edit / edição por instrução · acesso pela rede interna · autenticação · persistência de histórico além da sessão.

## Pré-requisitos a validar antes de codar

1. ComfyUI Desktop gera uma imagem SDXL pelo template padrão; anotar o tempo.
2. Log do ComfyUI mostra `cuda:0 NVIDIA GeForce RTX 3050` e `Total VRAM 6144 MB`.
3. Porta da API do ComfyUI Desktop (padrão 8000; conferir em Settings > Server-Config).
4. Nome exato do checkpoint SDXL em `models/checkpoints`.
5. `node -v` (≥ 20) e `git --version`.
6. Ollama instalado + um modelo de 3–4B baixado; medir tokens/s.
7. ~~Criar o repositório público `localia`~~ — feito.

## Fases

1. **Validação** — itens acima, com tempos anotados.
2. **MVP** — server.js + proxy, modo imagem (3 workflows), toggle, chat, presets, métricas.
3. **Ajuste** — comparar checkpoints e modelos de chat pelas métricas. Candidatos: `qwen3.5:4b` (chat, existe na biblioteca do Ollama; o `qwen3.6`/`qwen3.8` só têm 27B) e **Z-Image Turbo** (imagem). Z-Image medido em 2026-10-23 (`bench/zimage.js`, workflow em `bench/zimage.json`): roda nos 6 GB (pico ~5,4 GB, com offload), 8 steps, cfg 1, 1024²; ~36 s quente e ~52 s na primeira imagem (SDXL: ~24 s com 15 steps). Qualidade muito boa (pessoas, kana legível). Custos: ~19 GB em disco (UNET 11,5 + text encoder Qwen3-4B 7,5 + VAE), sem cfg nem negativo (modelo destilado), img2img, inpaint e troca de VRAM testados depois (`bench/zimage-full.js`): funcionam. **Virou o padrão do MVP em 2026-10-23** (ver Modo imagem).

## Convenções de trabalho

- Comunicação direta e tecnicamente precisa, em português.
- Validar restrições antes de construir; confirmar antes de mudanças grandes ou fora do escopo acima.
- Perguntar ao Rafa qual nome ele quer antes de sugerir nomes (projetos, repositórios, etc.).
- Atualizar este arquivo quando uma decisão mudar.
- **Testes:** `node --test tests/api.test.mjs` (servidor rodando; o ComfyUI online habilita os testes de proxy, upload e WebSocket). O servidor só aceita `Host`/`Origin` do próprio endereço (o proxy remove o `Origin` do ComfyUI, então essa checagem é nossa proteção contra CSRF e DNS rebinding). Se o ComfyUI cair, o servidor o reinicia sob demanda (a interface consulta `/api/status`).
- **Local do projeto (decisão do Rafa, 2026-10-23):** `C:\dev\localia`, fora do Google Drive. Pasta sincronizada pelo Drive não serve para um repositório git (corrompe o `.git`, sincroniza imagens e logs gerados). O atalho da área de trabalho e o ícone são recriados com `criar-atalho.ps1` a partir daqui.
