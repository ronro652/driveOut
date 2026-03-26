import os

from flask import Flask

from routes import register_routes

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
TEMPLATES_DIR = os.path.join(PROJECT_ROOT, "templates")

app = Flask(__name__, template_folder=TEMPLATES_DIR)
register_routes(app)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
