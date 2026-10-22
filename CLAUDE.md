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
│  ├─ txt2img.json
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

- **→ image**: descarrega o Ollama (`POST /api/generate {"model": <modelo>, "keep_alive": 0}`). O SDXL fica residente.
- **→ chat**: libera o ComfyUI (`POST /free {"unload_models": true, "free_memory": true}`). O LLM fica residente.
- Mostrar indicador de "carregando modelo" durante a troca. Medido (`bench/swap.js`, arquivos já no cache de RAM do Windows): ~4 s para o chat, ~2 s para a imagem. Com cache frio (primeira vez após boot) medimos 25 s no Ollama e +7 s no SDXL.
- Bloquear envio de imagem em modo chat e vice-versa.

## Modo imagem (ComfyUI, um único checkpoint SDXL para tudo)

A interface é uma caixa de prompt + imagem opcional + máscara opcional. O modo é inferido:

| Entrada | Workflow | Nós principais |
|---|---|---|
| só prompt | txt2img | CheckpointLoaderSimple → CLIPTextEncode ×2 → EmptyLatentImage → KSampler → VAEDecode → SaveImage |
| prompt + imagem | img2img | LoadImage → VAEEncode → KSampler (denoise < 1) |
| prompt + imagem + máscara | inpaint | LoadImage + LoadImageMask → VAEEncode → SetLatentNoiseMask → KSampler (denoise ~0.75) |

- Workflows escritos diretamente em formato API; o front preenche prompt, negativo, seed, steps, cfg, tamanho, denoise, nomes de arquivo.
- Fluxo da API do ComfyUI: `POST /upload/image` (imagem e máscara) → `POST /prompt {prompt, client_id}` → WebSocket `/ws?clientId=` (`progress`, `executing` com node `null` = fim, `execution_success`/`execution_error`) → `GET /history/{prompt_id}` → `GET /view?filename=&subfolder=&type=output`.
- `GET /object_info/CheckpointLoaderSimple` para listar checkpoints instalados.
- `POST /interrupt` para cancelar.
- Redimensionar imagens enviadas no front para ~1 MP com lados múltiplos de 64 antes do upload (evita estourar VRAM).
- Defaults SDXL (decididos pelo Rafa após o benchmark): 1024×1024 (ou buckets equivalentes), **steps 15**, **cfg 7**, sampler `dpmpp_2m`, scheduler `karras` (provisório: `euler_ancestral` como opção, não testado com várias seeds). Tempo medido: ~24 s por imagem com 15 steps em 1024² (~32 s com 25).
- Denoise (provisório): img2img 0,8; inpaint 0,9.
- **Checkpoint (decisão do Rafa):** padrão `sd_xl_base_1.0`, para todos os modos. A interface permite **trocar manualmente** por outro checkpoint instalado (lista via `/object_info/CheckpointLoaderSimple`, hoje: SDXL base e RealVisXL V5.0). A troca vale para a sessão inteira, não por modo, e mostra o indicador "carregando modelo" (tempo da troca entre dois checkpoints ainda não medido; estimativa 2–7 s). Não alternar checkpoints automaticamente entre modos.
- Viés a lembrar: no teste de img2img/inpaint a imagem de entrada foi gerada pelo RealVisXL, o que pode ter favorecido esse modelo; a escolha do denoise 0,8 e 0,9 vale para essa entrada.
- **Valores editáveis, com linguagem clara (decisão do Rafa):** steps, cfg, sampler, denoise e seed ficam editáveis na interface. Mudar qualquer valor gera **outra imagem** (parecida, não igual; medido: cfg, tamanho e sampler mudam a composição mesmo com a mesma seed), então o botão de confirmação se chama **"Recriar imagem"**, nunca "Aplicar" ou "Atualizar". A seed fica travada por padrão (maximiza a semelhança) e cada resultado mostra os valores usados. Para refinar a mesma imagem sem refazê-la, o caminho é "continuar a partir desta" (img2img).
- **Tamanho fixo em 1024 (decisão do Rafa):** mudar o tamanho com a mesma seed muda a composição inteira da imagem (medido em 768/896/1024), então não há "rascunho rápido" que preveja a imagem final. Não oferecer tamanhos menores como prévia.
- Máscara: canvas com pincel sobre a imagem, exportada como PNG.
- Qualquer resultado pode virar a entrada da próxima geração ("continuar a partir desta").
- **Presets de estilo**: botões que acrescentam blocos prontos ao prompt e um negativo padrão. Custo zero de hardware.
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
3. **Ajuste** — comparar checkpoints e modelos de chat pelas métricas.

## Convenções de trabalho

- Comunicação direta e tecnicamente precisa, em português.
- Validar restrições antes de construir; confirmar antes de mudanças grandes ou fora do escopo acima.
- Perguntar ao Rafa qual nome ele quer antes de sugerir nomes (projetos, repositórios, etc.).
- Atualizar este arquivo quando uma decisão mudar.
