# -*- coding: utf-8 -*-
"""
Serveur local ANTI-CACHE + auto-port + ouverture du navigateur.
----------------------------------------------------------------------------
Pourquoi ce serveur ?
  * `python -m http.server` laisse le navigateur garder l'ancien CSS/JS en
    cache : on voit alors une VIEILLE version du site apres une modification.
  * Si un ancien serveur tourne encore sur le port, on tombe dessus (vieux
    fichiers) sans s'en rendre compte.

Ce serveur resout les deux :
  1. Il envoie « ne pas mettre en cache » sur CHAQUE fichier -> toujours la
     derniere version, sans Ctrl+F5.
  2. Il choisit AUTOMATIQUEMENT un port libre (8765, sinon 8766, 8767...) ->
     jamais de conflit avec un ancien serveur.
  3. Il OUVRE lui-meme le navigateur a la bonne adresse.

Utilise par run.bat. Lancement manuel : python serve.py
"""
import http.server
import os
import socketserver
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
START_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        # force le navigateur a toujours recharger la derniere version
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # sortie silencieuse


def find_free_port(start, tries=15):
    """Renvoie le premier port libre a partir de `start`."""
    import socket
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:  # rien n'ecoute -> libre
                return port
    return start


def main():
    port = find_free_port(START_PORT)
    url = f"http://localhost:{port}/"
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", port), NoCacheHandler) as httpd:
            print("=" * 56)
            print(f"  Site (anti-cache) : {url}")
            print("  (ouverture automatique du navigateur...)")
            print("  Laissez cette fenetre ouverte. Ctrl+C pour arreter.")
            print("=" * 56)
            # ouvre le navigateur une fois le serveur pret
            threading.Timer(1.0, lambda: webbrowser.open(url)).start()
            httpd.serve_forever()
    except OSError as e:
        print(f"  [!] Impossible de demarrer : {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n  Serveur arrete.")


if __name__ == "__main__":
    main()
