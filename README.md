# localia

Interface local para gerar e editar imagens com IA (ComfyUI), com um chat auxiliar (Ollama). Tudo roda no seu
computador, sem nuvem. Feito para um notebook com GPU de 6 GB (RTX 3050): um modelo por vez na VRAM.

- **Imagem:** Z-Image Turbo (padrão) ou SDXL (SDXL base, RealVisXL). Só texto, texto + imagem de partida (img2img)
  ou com máscara (inpaint).
- **Chat:** `qwen3:4b` no Ollama, para ajudar a escrever o prompt (em construção).

## Instalar

Precisa de: Windows 10/11, GPU NVIDIA, [Node.js 20+](https://nodejs.org), [Comfy Desktop](https://www.comfy.org)
com os modelos abaixo e, para o chat, o [Ollama](https://ollama.com) com `ollama pull qwen3:4b`.

```bash
git clone https://github.com/rafaortman/localia.git C:\dev\localia
```

Depois dê dois cliques em **`instalar.bat`**. Ele confere os pré-requisitos, descobre onde está o ComfyUI, cria o
`config.json` e compila o `localia.exe` nesta máquina. Pode rodar de novo quando quiser.

Com um ComfyUI que não seja o do Comfy Desktop (portátil, por exemplo):

```bash
powershell -ExecutionPolicy Bypass -File instalar.ps1 -ComfyPath C:\caminho\do\ComfyUI
```

Outras opções: `-Recriar` refaz o `config.json` (o antigo vira `config.json.bak`) e `-Atalho` cria um atalho na
área de trabalho.

Evite colocar o projeto numa pasta sincronizada (Google Drive, OneDrive): o `.git` e as imagens geradas não combinam
com a sincronização.

### Modelos esperados (na pasta `models` do ComfyUI)

| Pasta | Arquivo | Uso |
|---|---|---|
| `diffusion_models` | `z_image_turbo_bf16.safetensors` | Z-Image Turbo |
| `text_encoders` | `qwen_3_4b.safetensors` | Z-Image Turbo |
| `vae` | `ae.safetensors` | Z-Image Turbo |
| `checkpoints` | `sd_xl_base_1.0.safetensors` | SDXL base (opcional) |
| `checkpoints` | `RealVisXL_V5.0_fp16.safetensors` | RealVisXL (opcional) |

O instalador avisa quais estão faltando.

## Usar

Dois cliques em **`localia.exe`**. Ele inicia o servidor e o ComfyUI e abre a janela do app. Quando você fecha a
janela, tudo se desliga sozinho depois de ~3 minutos e a GPU fica livre.

Sem o `.exe`: `node server.js` e abra `http://localhost:3000`.

## Testes

```bash
node --test tests/api.test.mjs
```

Precisa do servidor rodando; com o ComfyUI online, também testa proxy, upload e WebSocket.

## Mais detalhes

`CLAUDE.md` tem a arquitetura, as medições feitas neste hardware e as decisões tomadas.
