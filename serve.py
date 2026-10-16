# -*- coding: utf-8 -*-
"""
Serveur local ANTI-CACHE + relais LLM/RAG de développement (même origine).
----------------------------------------------------------------------------
1. Fichiers statiques du site, envoyés avec « ne pas mettre en cache » (toujours
   la dernière version, sans Ctrl+F5), port libre automatique (8791, 8792...),
   ouverture du navigateur.
2. Relais de développement, IDENTIQUE à l'API du Cloudflare Worker
   (worker/jesus-worker.js) mais servi sur la même origine, sous /api :
     POST /api/chat    {"question", "history", "lang"} -> text/event-stream
                       (event: meta {sources, model, retrieval} puis
                        data: {"delta": "..."} ... puis data: [DONE])
                       échec -> HTTP 429/502/503 JSON {"error"} (le site bascule
                       alors sur son moteur local)
     GET  /api/health  {"ok", "chunks", "embedded", "embedModel", "models", ...}
     POST /api/embed   {"texts": [...], "kind": "auto"|"query"|"document"}
                       -> {"vectors": [[...]]}  (utilisé par dev/worker_harness.html ; « auto » :
                       texte d'un passage -> vecteur « document » en cache, sinon requête)
     POST /api/retrieve (dev) {"question", "history", "lang", "mode"} -> {"ids", "info"}
                       sélection Python, comparée à celle du Worker par le banc d'essai
     POST /api/groq    (dev) corps Groq tel quel -> réponse Groq relayée, la clé étant ajoutée
                       CÔTÉ SERVEUR (le banc d'essai du Worker n'a jamais la clé)
   Retrieval hybride (BM25 + embeddings Ollama nomic-embed-text, fusion RRF)
   et génération Groq en cascade : implémentés dans chatbot/jesus_rag.py.
   La clé Groq de TEST est lue côté serveur (variable GROQ_API_KEY, sinon
   js/config.local.js, git-ignoré) ; elle n'est jamais affichée, journalisée ni
   envoyée au navigateur : GET /js/config.local.js renvoie une version générée
   qui ne contient que apiUrl = "/api".

Sécurité locale : écoute sur 127.0.0.1 uniquement (--host autre que loopback refusé
sans --unsafe-lan) ; en-tête Host limité à localhost / 127.0.0.1 / [::1] sur le port
servi (anti DNS rebinding) ; Origin des POST vérifiée ; dossiers privés (.git, docs,
.claude, chatbot, supabase, fichiers cachés) jamais servis ; pas de listing de dossier.

Utilisé par run.bat. Lancement manuel :
    python serve.py [--port 8791] [--no-browser] [--host 127.0.0.1]
Importable (tests) : import serve ; serve.get_index().retrieve("question")
"""
import argparse
import json
import os
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "chatbot"))

import jesus_rag as rag  # noqa: E402  (retrieval + génération partagés)

DEFAULT_PORT = 8791
MAX_BODY = 32 * 1024
MAX_EMBED_TEXTS = 256
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
PRIVATE_TOP = {".git", "docs", ".claude", "chatbot", "supabase", "__pycache__", ".venv"}
# servi à la place du vrai js/config.local.js (qui peut contenir la clé de test)
SAFE_LOCAL_CONFIG = ("/* genere par serve.py : relais local sur la meme origine (la cle Groq reste cote serveur) */\n"
                     "window.JESUS_CONFIG && (window.JESUS_CONFIG.apiUrl = \"/api\");\n").encode("utf-8")

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


# ------------------------------------------------------------------------------
# Index RAG (rechargé si js/rag-chunks.json ou js/rag-prompt.json changent)
# ------------------------------------------------------------------------------
class _State:
    lock = threading.Lock()
    index = None
    mtimes = None
    embedder = None
    warm_thread = None
    last_warm = 0.0
    warm_error = ""


def _asset_mtimes():
    return tuple(os.path.getmtime(p) if os.path.exists(p) else 0 for p in (rag.CHUNKS_PATH, rag.PROMPT_PATH))


def get_index(warm=True):
    """Index courant (BM25 prêt immédiatement ; vecteurs denses calculés en tâche de fond)."""
    with _State.lock:
        mt = _asset_mtimes()
        if _State.index is None or mt != _State.mtimes:
            if not all(mt):
                rag.export_assets(verbose=False)
                mt = _asset_mtimes()
            chunks_doc, prompt_doc = rag.load_assets()
            if _State.embedder is None:
                _State.embedder = rag.OllamaEmbedder()
            _State.index = rag.RagIndex(chunks_doc, prompt_doc, _State.embedder)
            _State.mtimes = mt
            _State.last_warm = 0.0
            log(f"[relay] {len(chunks_doc['chunks'])} passages chargés (version {chunks_doc['version']})")
        idx = _State.index
    if warm:
        _maybe_warm(idx)
    return idx


def _maybe_warm(idx):
    """Calcule les vecteurs des passages en arrière-plan (cache disque dev/.emb_cache.json) ;
    nouvelle tentative au plus toutes les 60 s si Ollama était indisponible."""
    if idx.vectors is not None:
        return
    with _State.lock:
        busy = _State.warm_thread is not None and _State.warm_thread.is_alive()
        if busy or time.time() - _State.last_warm < 60:
            return
        _State.last_warm = time.time()

        def run():
            t0 = time.time()
            if idx.ensure_vectors():
                _State.warm_error = ""
                log(f"[relay] embeddings des passages prêts ({time.time() - t0:.1f}s)")
            else:
                _State.warm_error = "ollama indisponible"
        _State.warm_thread = threading.Thread(target=run, daemon=True)
        _State.warm_thread.start()


def retrieve(question, history=None, lang="fr"):
    """Retrieval tel qu'utilisé par /api/chat (hybride si les vecteurs sont prêts, sinon BM25)."""
    idx = get_index()
    mode = "hybrid" if idx.vectors is not None else "bm25"
    return idx.retrieve(question, history or [], lang, mode=mode)


# ------------------------------------------------------------------------------
# Validation des requêtes (mêmes règles que le Worker)
# ------------------------------------------------------------------------------
class BadRequest(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def validate_chat(body, gen_cfg):
    if not isinstance(body, dict):
        raise BadRequest(400, "JSON objet attendu")
    q = body.get("question")
    if not isinstance(q, str) or not q.strip():
        raise BadRequest(400, "question manquante")
    q = q.strip()
    if len(q) > gen_cfg["question_max_chars"]:
        raise BadRequest(413, "question trop longue")
    lang = body.get("lang") if body.get("lang") in ("fr", "en") else "fr"
    hist = body.get("history") or []
    if not isinstance(hist, list):
        raise BadRequest(400, "history doit être une liste")
    history = [{"role": m.get("role"), "content": str(m.get("content") or "")[:4000]}
               for m in hist[-gen_cfg["history_messages"]:]
               if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
    # tronqué / borné UNE fois (comme le Worker) : le même historique sert au retrieval et aux messages
    return q, rag.clean_history(history, gen_cfg), lang


# ------------------------------------------------------------------------------
# Handler HTTP
# ------------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    server_version = "IssaDev/2.0"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # sortie silencieuse (les appels /api sont résumés par log())

    # -- utilitaires --
    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0:
            raise BadRequest(400, "corps JSON manquant")
        if n > MAX_BODY:
            raise BadRequest(413, "requête trop volumineuse")
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise BadRequest(400, "JSON invalide")

    def _host_ok(self):
        """Anti DNS rebinding : seuls localhost / 127.0.0.1 / [::1] sur le port servi sont acceptés."""
        return self.headers.get("Host", "").strip().lower() in self.server.allowed_hosts

    def _same_origin_ok(self):
        """Refuse les appels /api venant d'une autre origine (une page web tierce ouverte
        dans le navigateur ne doit pas pouvoir consommer la clé de test)."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return origin.lower() in {"http://" + h for h in self.server.allowed_hosts}

    def _rel(self, path):
        try:
            return os.path.relpath(self.translate_path(path), HERE).replace(os.sep, "/")
        except ValueError:
            return ".."

    def _private(self, path):
        """Chemins jamais servis (après décodage) : dossiers privés, fichiers cachés."""
        parts = [p for p in self._rel(path).split("/") if p not in ("", ".")]
        if not parts:
            return False
        if parts[0] == ".." or parts[0] in PRIVATE_TOP:
            return True
        return any(p.startswith(".") for p in parts)

    def list_directory(self, path):  # pas de listing de dossier
        self.send_error(404, "introuvable")
        return None

    # -- routes --
    def do_GET(self):
        if not self._host_ok():
            return self._json(421, {"error": "hôte non autorisé"})
        path = self.path.split("?", 1)[0]
        if path in ("/api/health", "/api/health/"):
            idx = get_index()
            return self._json(200, {
                "ok": True, "chunks": len(idx.chunks), "embedded": idx.vectors is not None,
                "embedModel": f"ollama/{idx.embedder.model}" if idx.embedder else None,
                "models": idx.prompt["generation"]["models"], "version": idx.version,
                "groqKey": bool(rag.read_local_groq_key()), "relay": "dev (serve.py)",
                "embedError": _State.warm_error or None})
        if path.startswith("/api/"):
            return self._json(404, {"error": "route inconnue"})
        if self._private(path):
            return self._json(404, {"error": "introuvable"})
        if self._rel(path) == "js/config.local.js":
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(SAFE_LOCAL_CONFIG)))
            self.end_headers()
            self.wfile.write(SAFE_LOCAL_CONFIG)
            return None
        return super().do_GET()

    def do_HEAD(self):
        path = self.path.split("?", 1)[0]
        if not self._host_ok() or path.startswith("/api/") or self._private(path) \
                or self._rel(path) == "js/config.local.js":
            self.send_response(421 if not self._host_ok() else (405 if path.startswith("/api/") else 404))
            self.end_headers()
            return
        return super().do_HEAD()

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        try:
            if not self._host_ok():
                return self._json(421, {"error": "hôte non autorisé"})
            if not self._same_origin_ok():
                return self._json(403, {"error": "origine non autorisée"})
            if path == "/api/chat":
                return self._chat()
            if path == "/api/embed":
                return self._embed()
            if path == "/api/retrieve":
                return self._retrieve()
            if path == "/api/groq":
                return self._groq_proxy()
            return self._json(404, {"error": "route inconnue"})
        except BadRequest as exc:
            return self._json(exc.status, {"error": str(exc)})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return None
        except Exception as exc:  # pragma: no cover
            log(f"[relay] erreur interne : {exc.__class__.__name__}")
            try:
                return self._json(500, {"error": "erreur interne"})
            except Exception:
                return None

    def _retrieve(self):
        """(dev) Sélection Python des passages, pour comparer avec le Worker dans le banc d'essai."""
        body = self._read_json()
        idx = get_index()
        question, history, lang = validate_chat(body, idx.prompt["generation"])
        mode = body.get("mode") if body.get("mode") in ("bm25", "hybrid") else "hybrid"
        if mode == "hybrid" and idx.vectors is None:
            mode = "bm25"
        sel, info = idx.retrieve(question, history, lang, mode=mode)
        return self._json(200, {"ids": [c["id"] for c in sel], "info": info})

    def _groq_proxy(self):
        """(dev) Relaie un appel Groq du banc d'essai du Worker en ajoutant la clé côté serveur."""
        import http.client
        import ssl
        import urllib.parse
        body = self._read_json()
        idx = get_index()
        if not isinstance(body, dict) or body.get("model") not in idx.prompt["generation"]["models"] \
                or not isinstance(body.get("messages"), list):
            raise BadRequest(400, "corps Groq attendu (modèle de la cascade)")
        key = rag.read_local_groq_key()
        if not key:
            return self._json(503, {"error": "clé Groq locale absente"})
        u = urllib.parse.urlparse(rag.GROQ_URL)
        conn = http.client.HTTPSConnection(u.netloc, timeout=30, context=ssl.create_default_context())
        try:
            conn.request("POST", u.path, body=json.dumps(body).encode("utf-8"), headers={
                "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                "Accept": "text/event-stream", "User-Agent": "issa-dev-relay/1.0"})
            resp = conn.getresponse()
            self.send_response(resp.status)
            for h in ("Content-Type", "Retry-After", "x-ratelimit-remaining-tokens", "x-ratelimit-remaining-requests"):
                if resp.getheader(h):
                    self.send_header(h, resp.getheader(h))
            self.send_header("Connection", "close")
            self.end_headers()
            while True:
                chunk = resp.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        finally:
            conn.close()
        return None

    def _embed(self):
        body = self._read_json()
        texts = body.get("texts") if isinstance(body, dict) else None
        if not isinstance(texts, list) or not texts or len(texts) > MAX_EMBED_TEXTS \
                or not all(isinstance(t, str) and len(t) <= 8000 for t in texts):
            raise BadRequest(400, f"texts : liste de 1 à {MAX_EMBED_TEXTS} chaînes")
        kind = body.get("kind", "auto")
        idx = get_index()
        emb = idx.embedder
        try:
            if kind == "auto":
                # textes des passages -> vecteurs « document » (cache disque) ; le reste = requêtes
                doc_map = {}
                if idx.ensure_vectors():
                    for c, (vf, ve) in zip(idx.chunks, idx.vectors):
                        doc_map[rag.chunk_doc_text(c, "fr")] = vf
                        doc_map[rag.chunk_doc_text(c, "en")] = ve
                vectors = []
                for t in texts:
                    vectors.append(doc_map[t] if t in doc_map else emb.embed_query(t))
            elif kind in ("query", "document"):
                vectors = emb.embed(texts, kind)
            else:
                raise BadRequest(400, "kind : auto | query | document")
        except BadRequest:
            raise
        except Exception as exc:
            log(f"[relay] embeddings indisponibles : {exc.__class__.__name__}")
            return self._json(503, {"error": "embeddings indisponibles"})
        return self._json(200, {"vectors": vectors, "model": f"ollama/{emb.model}"})

    def _chat(self):
        t0 = time.time()
        idx = get_index()
        gen = idx.prompt["generation"]
        question, history, lang = validate_chat(self._read_json(), gen)
        key = rag.read_local_groq_key()
        if not key:
            return self._json(503, {"error": "clé Groq locale absente (js/config.local.js)"})
        selected, info = retrieve(question, history, lang)
        # budget du premier token compté APRÈS la recherche (l'embedding local peut être lent à froid)
        deadline = time.time() + gen.get("first_token_budget_ms", 10000) / 1000.0
        messages = rag.build_messages(question, history, lang, selected, info, idx.prompt)
        models = [m.strip() for m in os.environ.get("JESUS_MODELS", "").split(",") if m.strip()] or None
        stream = rag.stream_groq(messages, key, gen, info["long"], models=models, log=log, careful=info["careful"],
                                 deadline=deadline, refusal=idx.prompt[lang]["refusal"])
        try:
            kind, model = next(stream)  # attend le premier token AVANT d'envoyer les en-têtes
        except rag.UpstreamError as exc:
            status = exc.status if exc.status in (429, 502, 503) else 502
            log(f"[relay] échec LLM ({status}) -> le client bascule sur le moteur local")
            return self._json(status, {"error": "LLM indisponible", "retryable": status in (429, 503)})
        except StopIteration:
            return self._json(502, {"error": "réponse vide"})
        ttft = time.time() - t0
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        meta = {"sources": [{"id": c["id"], "entity": c["entity"], "title": c["title_" + lang]} for c in selected],
                "model": model, "retrieval": info["retrieval"]}
        self.wfile.write(f"event: meta\ndata: {json.dumps(meta, ensure_ascii=False)}\n\n".encode("utf-8"))
        self.wfile.flush()
        n_chars = 0
        cut = False
        try:
            for kind, val in stream:
                if kind == "delta":
                    n_chars += len(val)
                    self.wfile.write(f"data: {json.dumps({'delta': val}, ensure_ascii=False)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                elif kind == "cut":
                    cut = True
        except rag.UpstreamError:
            cut = True
        if cut:  # le navigateur garde la réponse partielle avec la mention « réponse interrompue »
            self.wfile.write(b'data: {"error": "interrupted"}\n\n')
            log("[relay] flux coupé en route -> error: interrupted")
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()
        log(f"[relay] {lang} q={len(question)}c hist={len(history)} {info['retrieval']} {info['mode']} "
            f"[{', '.join(c['id'] for c in selected)}] ~{info['tokens']}tok ctx -> {model} "
            f"1er token {ttft:.2f}s, total {time.time() - t0:.2f}s, {n_chars}c")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False  # Windows : évite de partager un port déjà pris


def find_free_port(start, host="127.0.0.1", tries=15):
    import socket
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex((host, port)) != 0:
                return port
    return start


def main(argv=None):
    ap = argparse.ArgumentParser(description="Serveur local anti-cache + relais LLM/RAG de développement")
    ap.add_argument("port_pos", nargs="?", type=int, help=argparse.SUPPRESS)  # compat : python serve.py 8765
    ap.add_argument("--port", type=int, default=None, help=f"premier port essayé (défaut {DEFAULT_PORT})")
    ap.add_argument("--host", default="127.0.0.1", help="interface d'écoute (défaut 127.0.0.1)")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    ap.add_argument("--unsafe-lan", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    if args.host not in LOOPBACK and not args.unsafe_lan:
        print(f"  [!] --host {args.host} refusé : le relais utilise une clé de test et protège des fichiers privés ; "
              "restez sur 127.0.0.1 (ou ajoutez --unsafe-lan en connaissance de cause).")
        sys.exit(2)
    port = find_free_port(args.port or args.port_pos or DEFAULT_PORT, args.host)
    url = f"http://localhost:{port}/"
    try:
        httpd = Server((args.host, port), Handler)
    except OSError as e:
        print(f"  [!] Impossible de démarrer : {e}")
        sys.exit(1)
    httpd.allowed_hosts = {f"localhost:{port}", f"127.0.0.1:{port}", f"[::1]:{port}"}
    idx = get_index()  # charge l'index et lance le calcul des embeddings en arrière-plan
    print("=" * 64)
    print(f"  Site (anti-cache)     : {url}")
    print(f"  Relais LLM/RAG (dev)  : {url}api/health   ({len(idx.chunks)} passages)")
    print(f"  Banc d'essai Worker   : {url}dev/worker_harness.html")
    print(f"  Clé Groq locale       : {'trouvée' if rag.read_local_groq_key() else 'ABSENTE (mode local seul)'}")
    print("  Laissez cette fenêtre ouverte. Ctrl+C pour arrêter.")
    print("=" * 64)
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\n  Arrêt du serveur...")
    finally:
        httpd.server_close()
        print("  Serveur arrêté.")


if __name__ == "__main__":
    main()
