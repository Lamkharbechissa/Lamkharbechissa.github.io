@echo off
REM ============================================================
REM  LANCEUR UNIQUE — Portfolio Issa Lamkharbech + chatbot ISSA
REM  Double-cliquez sur ce fichier (ou tapez:  run.bat)
REM  1. Regenere la base de connaissances du site (kb.js)
REM  2. Demarre un serveur local ANTI-CACHE (toujours la derniere version)
REM  3. Ouvre le site dans votre navigateur
REM ============================================================
cd /d "%~dp0"

echo [1/3] Regeneration de la base de connaissances...
python chatbot\jesus_chatbot.py --export

echo [2/3] Ouverture du navigateur...
start "" http://localhost:8765

echo [3/3] Demarrage du serveur (anti-cache)...
python serve.py 8765
