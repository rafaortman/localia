# Abre o localia como aplicativo: inicia o servidor (se preciso), espera a porta e abre a janela.
# O servidor inicia o ComfyUI sozinho e encerra os dois quando a janela fica fechada por alguns minutos.
$root = $PSScriptRoot
$config = Get-Content (Join-Path $root 'config.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
$port = if ($config.port) { $config.port } else { 3000 }
$url = "http://localhost:$port"

function Test-Port($p) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { return $false }
}
function Show-Error($text) {
  Add-Type -AssemblyName PresentationFramework
  [void][Windows.MessageBox]::Show($text, 'localia', 'OK', 'Error')
}

if (-not (Test-Port $port)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { Show-Error 'O Node.js não foi encontrado. Instale o Node 20 ou superior.'; exit 1 }
  $env:LOCALIA_IDLE_EXIT_MIN = '3'
  Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root 'localia.log') -RedirectStandardError (Join-Path $root 'localia.err.log')
  for ($i = 0; $i -lt 40 -and -not (Test-Port $port); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Port $port)) { Show-Error "O servidor não iniciou. Veja o arquivo localia.err.log em $root."; exit 1 }
}

$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) { Start-Process -FilePath $browser -ArgumentList "--app=$url" } else { Start-Process $url }
