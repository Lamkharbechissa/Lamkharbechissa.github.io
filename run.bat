@echo off
REM ============================================================
REM  LANCEUR UNIQUE — Portfolio Issa Lamkharbech + chatbot Jesus
REM  Double-cliquez sur ce fichier (ou tapez:  run.bat)
REM  1. Regenere la base de connaissances du site (kb.js)
REM  2. Demarre le serveur local
REM  3. Ouvre le site dans votre navigateur
REM ============================================================
cd /d "%~dp0"

echo [1/3] Regeneration de la base de connaissances...
python chatbot\jesus_chatbot.py --export

echo [2/3] Ouverture du navigateur...
start "" http://localhost:8765

echo [3/3] Serveur demarre sur http://localhost:8765  (Ctrl+C pour arreter)
python -m http.server 8765
