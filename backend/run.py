"""Local read-only server. No API credentials or .env loading."""
from chargegap_api import create_app

if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)
