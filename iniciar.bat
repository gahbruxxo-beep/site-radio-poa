@echo off
chcp 65001 >nul
title Site da Radio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js ainda nao esta instalado neste computador.
  echo  1. Abra o site https://nodejs.org
  echo  2. Baixe a versao "LTS" e instale, clicando em Avancar ate o fim.
  echo  3. Depois de instalar, de dois cliques neste arquivo de novo.
  echo.
  pause
  exit /b
)
node server.js
echo.
echo  O site foi desligado. Se apareceu algum erro acima, mande uma foto dele para o Claude.
pause
