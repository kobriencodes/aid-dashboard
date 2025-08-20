from flask import request, abort, current_app

def require_admin():
    token = request.headers.get("X-Admin-Token")
    if not token or token != current_app.config.get("ADMIN_API_TOKEN"):
        abort(401)