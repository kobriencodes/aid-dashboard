from __future__ import annotations

from flask import Flask, redirect
from flask_caching import Cache
from flask_cors import CORS

from .config import Config

cache = Cache()


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app, resources={r"*": {"origins": app.config["CORS_ALLOWED_ORIGINS"]}})
    cache.init_app(app)

    # Blueprints
    from .routes.borders import bp as borders_bp
    from .routes.checkpoints import bp as checkpoints_bp
    from .routes.datasets import bp as datasets_bp
    from .routes.health import bp as health_bp
    from .routes.healthcheck import bp as healthcheck_bp
    from .routes.admin_updates import bp as admin_updates_bp

    app.register_blueprint(health_bp, url_prefix="/api/v1/health_centers")
    app.register_blueprint(checkpoints_bp, url_prefix="/api/v1")
    app.register_blueprint(borders_bp, url_prefix="/api/v1/border_crossings")
    app.register_blueprint(healthcheck_bp)
    app.register_blueprint(datasets_bp, url_prefix="/api/v1/datasets")
    app.register_blueprint(admin_updates_bp, url_prefix="/api/v1/admin")

    @app.get("/data/health_centers")
    def legacy_health_centers():
        return redirect("/api/v1/health_centers", code=307)

    @app.get("/data/checkpoints")
    def legacy_checkpoints():
        return redirect("/api/v1/checkpoints", code=307)

    @app.get("/data/roads")
    def legacy_roads():
        return redirect("/api/v1/roads", code=307)

    @app.get("/data/border_crossings")
    def legacy_borders():
        return redirect("/api/v1/border_crossings", code=307)

    return app
