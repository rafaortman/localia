# Cria o atalho "localia" na área de trabalho: powershell -ExecutionPolicy Bypass -File criar-atalho.ps1
# O ícone é copiado para uma pasta local com o hash no nome: o Explorer não carrega ícones de unidade virtual
# (Google Drive) e guarda ícones em cache pelo caminho, então um nome novo força a atualização.
$localDir = Join-Path $env:LOCALAPPDATA 'localia'
New-Item -ItemType Directory -Force $localDir | Out-Null
$source = Join-Path $PSScriptRoot 'public\localia.ico'
$hash = (Get-FileHash $source -Algorithm MD5).Hash.Substring(0, 8).ToLower()
$icon = Join-Path $localDir "localia-$hash.ico"
Copy-Item $source $icon -Force
Get-ChildItem $localDir -Filter 'localia*.ico' | Where-Object { $_.FullName -ne $icon } | Remove-Item -Force

$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'localia.lnk'))
$link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\launcher.ps1`""
$link.WorkingDirectory = $PSScriptRoot
$link.Description = 'Abre o localia'
$link.IconLocation = "$icon,0"
$link.Save()
Write-Output "Atalho criado: $($link.FullName) (ícone: $icon)"
