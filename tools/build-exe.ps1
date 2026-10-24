# Gera localia.exe na raiz do projeto, com o ícone de public\localia.ico:
#   powershell -ExecutionPolicy Bypass -File tools\build-exe.ps1
# Usa o compilador C# que já vem com o Windows (.NET Framework 4); não precisa instalar nada.
$root = Split-Path $PSScriptRoot -Parent
$csc = @("$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe", "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { Write-Error 'Compilador C# do .NET Framework não encontrado.'; exit 1 }

& $csc /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll `
  "/win32icon:$root\public\localia.ico" "/out:$root\localia.exe" "$PSScriptRoot\localia.cs"
if ($LASTEXITCODE -ne 0) { Write-Error 'A compilação falhou.'; exit 1 }
Write-Output "Criado: $root\localia.exe"
