@echo off
REM ============================================================
REM  LANCEUR UNIQUE — Portfolio Issa Lamkharbech + chatbot ISSA
REM  Double-cliquez sur ce fichier (ou tapez:  run.bat)
REM  1. Regenere la base de connaissances du site (kb.js)
REM  2. Demarre un serveur ANTI-CACHE (port libre auto) qui ouvre
REM     lui-meme votre navigateur sur la DERNIERE version du site.
REM ============================================================
cd /d "%~dp0"

echo [1/2] Regeneration de la base de connaissances...
python chatbot\jesus_chatbot.py --export

echo [2/2] Demarrage du serveur et ouverture du navigateur...
python serve.py
