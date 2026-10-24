@echo off
rem Duplo clique: roda o instalador do localia e deixa a janela aberta para ler o resultado.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
echo.
pause
