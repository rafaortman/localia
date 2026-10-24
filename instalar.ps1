# Instalador do localia: confere os pré-requisitos, descobre o ComfyUI, gera o config.json e compila o localia.exe
# nesta máquina. Pode ser rodado de novo sem problema.
#   powershell -ExecutionPolicy Bypass -File instalar.ps1 [-ComfyPath <pasta>] [-Recriar] [-Atalho]
#   -ComfyPath  pasta de um ComfyUI que não seja o do Comfy Desktop (portátil, clone do GitHub...)
#   -Recriar    refaz o config.json mesmo que ele já exista (o antigo vira config.json.bak)
#   -Atalho     cria também um atalho "localia" na área de trabalho
param([string]$ComfyPath, [switch]$Recriar, [switch]$Atalho)

$root = $PSScriptRoot
$ok = 0; $avisos = @()
function Passo($msg)  { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Bom($msg)    { Write-Host "  [ok]    $msg" -ForegroundColor Green; $script:ok++ }
function Aviso($msg)  { Write-Host "  [aviso] $msg" -ForegroundColor Yellow; $script:avisos += $msg }
function Falha($msg)  { Write-Host "  [erro]  $msg" -ForegroundColor Red; Write-Host "`nInstalação interrompida." -ForegroundColor Red; exit 1 }

# ---------- 1. Node ----------
Passo 'Node.js'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Falha 'Node.js não encontrado. Instale o Node 20 ou mais novo (https://nodejs.org) e rode de novo.' }
$versao = [version]((& $node -v).TrimStart('v'))
if ($versao.Major -lt 20) { Falha "Node $versao é antigo demais. Precisa do 20 ou mais novo." }
Bom "Node $versao"

# ---------- 2. Ollama ----------
Passo 'Ollama (chat)'
try {
  $tags = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
  Bom 'Ollama respondendo'
  if ($tags.models.name -match '^qwen3') { Bom "modelo de chat instalado: $(($tags.models.name | Where-Object { $_ -match '^qwen3' } | Select-Object -First 1))" }
  else { Aviso 'Nenhum modelo qwen3 no Ollama. Para o chat: ollama pull qwen3:4b' }
} catch { Aviso 'Ollama não está respondendo (instale em https://ollama.com e rode: ollama pull qwen3:4b). Só o modo chat depende dele.' }

# ---------- 3. ComfyUI ----------
Passo 'ComfyUI'
$comfy = $null
function Primeiro-Python($pastas) {
  foreach ($p in $pastas) {
    if (-not (Test-Path $p)) { continue }
    & $p -c 'import torch' 2>$null
    if ($LASTEXITCODE -eq 0) { return $p }
  }
}

if ($ComfyPath) {
  $main = @("$ComfyPath\main.py", "$ComfyPath\ComfyUI\main.py") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $main) { Falha "Não achei main.py em $ComfyPath (nem em $ComfyPath\ComfyUI)." }
  $dir = Split-Path $main -Parent
  $py = Primeiro-Python @("$dir\.venv\Scripts\python.exe", "$dir\venv\Scripts\python.exe", "$ComfyPath\python_embeded\python.exe", "$dir\..\python_embeded\python.exe")
  if (-not $py) { $py = (Get-Command python -ErrorAction SilentlyContinue).Source }
  if (-not $py) { Falha 'Não achei um Python com PyTorch para esse ComfyUI.' }
  $comfy = @{ origem = "pasta informada ($ComfyPath)"; python = $py; main = $main; cwd = $dir; yaml = $null; modelos = @("$dir\models") }
} else {
  $inst = Join-Path $env:APPDATA 'Comfy Desktop\installations.json'
  if (Test-Path $inst) {
    $lista = Get-Content $inst -Raw | ConvertFrom-Json
    $item = $lista | Where-Object { $_.installPath -and $_.status -eq 'installed' } | Select-Object -First 1
    if ($item) {
      $dir = Join-Path $item.installPath 'ComfyUI'
      $py = Primeiro-Python @("$dir\.venv\Scripts\python.exe", "$($item.installPath)\standalone-env\python.exe")
      $yaml = Join-Path $env:APPDATA "Comfy Desktop\instance-model-paths\$($item.id).yaml"
      $cfgDesk = Get-Content (Join-Path $env:APPDATA 'Comfy Desktop\settings.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
      if ($py -and (Test-Path "$dir\main.py")) {
        $comfy = @{ origem = "Comfy Desktop ($($item.name))"; python = $py; main = "$dir\main.py"; cwd = $dir; yaml = $(if (Test-Path $yaml) { $yaml }); modelos = @($cfgDesk.modelsDirs) + @("$dir\models") }
      }
    }
  }
}
if (-not $comfy) { Falha 'Não encontrei o ComfyUI. Instale o Comfy Desktop, ou rode: instalar.ps1 -ComfyPath <pasta do ComfyUI>' }
Bom "ComfyUI: $($comfy.origem)"
Bom "Python com PyTorch: $($comfy.python)"

# modelos esperados pelos workflows
$modelos = @(
  @{ pasta = 'diffusion_models'; arq = 'z_image_turbo_bf16.safetensors'; uso = 'Z-Image Turbo (padrão)' },
  @{ pasta = 'text_encoders';    arq = 'qwen_3_4b.safetensors';          uso = 'Z-Image Turbo (leitor de texto)' },
  @{ pasta = 'vae';              arq = 'ae.safetensors';                 uso = 'Z-Image Turbo (VAE)' },
  @{ pasta = 'checkpoints';      arq = 'sd_xl_base_1.0.safetensors';     uso = 'SDXL base (opcional)' },
  @{ pasta = 'checkpoints';      arq = 'RealVisXL_V5.0_fp16.safetensors'; uso = 'RealVisXL (opcional)' }
)
foreach ($m in $modelos) {
  $achou = $comfy.modelos | Where-Object { $_ -and (Test-Path (Join-Path $_ "$($m.pasta)\$($m.arq)")) } | Select-Object -First 1
  if ($achou) { Bom "modelo: $($m.arq)" } else { Aviso "falta o modelo $($m.arq) em models\$($m.pasta) ($($m.uso))" }
}

# ---------- 4. config.json ----------
Passo 'config.json'
$destino = Join-Path $root 'config.json'
if ((Test-Path $destino) -and -not $Recriar) {
  Bom 'config.json já existe; mantido (use -Recriar para refazer)'
} else {
  if (Test-Path $destino) { Copy-Item $destino "$destino.bak" -Force; Aviso 'config.json antigo salvo como config.json.bak' }
  $cfg = Get-Content (Join-Path $root 'config.example.json') -Raw | ConvertFrom-Json
  $argv = @($comfy.main, '--port', "$($cfg.comfy.port)", '--listen', $cfg.comfy.host)
  if ($comfy.yaml) { $argv += @('--extra-model-paths-config', $comfy.yaml) }
  $cfg.comfy.autostart = [pscustomobject]@{ command = $comfy.python; args = $argv; cwd = $comfy.cwd }
  # UTF-8 sem BOM: o Node não aceita o BOM no JSON
  [IO.File]::WriteAllText($destino, ($cfg | ConvertTo-Json -Depth 8) + "`n", (New-Object Text.UTF8Encoding $false))
  Bom 'config.json criado'
}

# ---------- 5. localia.exe ----------
Passo 'localia.exe'
try {
  & (Join-Path $root 'tools\build-exe.ps1') | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $root 'localia.exe'))) { throw 'sem localia.exe' }
  Bom 'localia.exe compilado nesta máquina'
} catch {
  if (Test-Path (Join-Path $root 'localia.exe')) { Aviso 'Não foi possível compilar; mantido o localia.exe que veio do repositório.' }
  else { Falha 'Não foi possível compilar o localia.exe (precisa do .NET Framework 4, que já vem com o Windows).' }
}

if ($Atalho) {
  Passo 'Atalho'
  & (Join-Path $root 'criar-atalho.ps1') | Out-Null
  Bom 'atalho criado na área de trabalho'
}

Write-Host "`nPronto: $ok verificações ok, $($avisos.Count) aviso(s)." -ForegroundColor Green
Write-Host "Para abrir o app, dê dois cliques em: $root\localia.exe"
