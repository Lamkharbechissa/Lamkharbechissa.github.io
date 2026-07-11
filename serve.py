# -*- coding: utf-8 -*-
"""
Serveur local ANTI-CACHE pour tester le portfolio.
----------------------------------------------------------------------------
Le serveur intégré de Python (`python -m http.server`) laisse le navigateur
garder en cache le CSS/JS : quand on ajoute des fonctionnalités, on continue de
voir l'ANCIENNE version tant qu'on ne force pas le rafraîchissement (Ctrl+F5).

Ce serveur envoie des en-têtes « ne pas mettre en cache » sur CHAQUE fichier :
à chaque lancement (et à chaque rechargement), le navigateur reçoit toujours la
toute dernière version du site. Plus besoin de vider le cache manuellement.

Utilisé automatiquement par run.bat. Lancement manuel : python serve.py
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
HERE = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        # force le navigateur à toujours recharger la dernière version
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # sortie silencieuse


def main():
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
            print(f"  -> Site (anti-cache) : http://localhost:{PORT}")
            print("     Ctrl+C pour arreter.")
            httpd.serve_forever()
    except OSError as e:
        print(f"  [!] Impossible de demarrer sur le port {PORT} : {e}")
        print(f"      Le port est peut-etre deja utilise. Fermez l'autre fenetre,")
        print(f"      ou lancez :  python serve.py 8770")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n  Serveur arrete.")


if __name__ == "__main__":
    main()
