"""
NetSim Application Entry Point
Flask web server and API application factory.
"""

import os
from flask import Flask, jsonify, render_template
from config import get_config
from backend.database import init_db
from backend.routes import api_bp


def create_app(config_name=None) -> Flask:
    """Application factory for creating and configuring the NetSim Flask instance."""
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static",
    )

    # Load configuration
    cfg = get_config(config_name)
    app.config.from_object(cfg)

    # Initialize SQLite database
    init_db(app.config["DATABASE_PATH"])

    # Register API blueprint
    app.register_blueprint(api_bp, url_prefix="/api")

    # Frontend route
    @app.route("/")
    def index():
        return render_template("index.html")

    # Global JSON error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        return jsonify({
            "success": False,
            "error": "The requested resource was not found on this server.",
            "status_code": 404,
        }), 404

    @app.errorhandler(405)
    def method_not_allowed_error(error):
        return jsonify({
            "success": False,
            "error": "Method not allowed for the requested URL.",
            "status_code": 405,
        }), 405

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "success": False,
            "error": "Payload too large. Maximum allowed size is 5MB.",
            "status_code": 413,
        }), 413

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({
            "success": False,
            "error": "An internal server error occurred.",
            "status_code": 500,
        }), 500

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # Run development server
    print(f"Starting NetSim on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=True)
