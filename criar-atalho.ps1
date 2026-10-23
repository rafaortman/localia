# Cria o atalho "localia" na área de trabalho: powershell -ExecutionPolicy Bypass -File criar-atalho.ps1
# O ícone é copiado para uma pasta local porque o Explorer nem sempre carrega ícones de uma unidade virtual (Google Drive).
$localDir = Join-Path $env:LOCALAPPDATA 'localia'
New-Item -ItemType Directory -Force $localDir | Out-Null
$icon = Join-Path $localDir 'localia.ico'
Copy-Item (Join-Path $PSScriptRoot 'public\localia.ico') $icon -Force

$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'localia.lnk'))
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\launcher.ps1`""
$link.WorkingDirectory = $PSScriptRoot
$link.Description = 'Abre o localia'
$link.IconLocation = "$icon,0"
$link.Save()
Write-Output "Atalho criado: $($link.FullName) (ícone: $icon)"
