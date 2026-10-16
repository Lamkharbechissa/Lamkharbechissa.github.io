@echo off
REM ============================================================
REM  LANCEUR UNIQUE - Portfolio Issa Lamkharbech + chatbot ISSA
REM  Double-cliquez sur ce fichier (ou tapez:  run.bat)
REM  1. Regenere la base du site (kb.js) et les donnees du RAG
REM     (js/rag-chunks.json + js/rag-prompt.json)
REM  2. Demarre le serveur ANTI-CACHE + relais LLM/RAG local (/api)
REM     sur un port libre (8791, 8792...) et ouvre le navigateur.
REM     - mode LLM : cle Groq de test dans js/config.local.js
REM       (git-ignore) + apiUrl "/api" dans ce meme fichier
REM     - embeddings : Ollama + nomic-embed-text (sinon BM25 seul)
REM ============================================================
cd /d "%~dp0"

echo [1/3] Regeneration de la base de connaissances...
python chatbot\jesus_chatbot.py --export
if errorlevel 1 echo   [!] export kb.js en echec - le site garde l'ancienne version

echo [2/3] Export des donnees du RAG (passages + prompt)...
python chatbot\jesus_rag.py --export-assets
if errorlevel 1 echo   [!] export RAG en echec

echo [3/3] Demarrage du serveur + relais LLM/RAG local...
python serve.py %*
