from pathlib import Path
import os
from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException
from .cache import ByteLRU
from .data import DataStore
from .routes import create_blueprint
from .validation import APIError


def create_app(config=None):
    app=Flask(__name__,static_folder=None)
    app.json.ensure_ascii=False
    app.config.from_mapping(PROJECT_ROOT=Path(__file__).resolve().parents[2],VERIFY_SNAPSHOT_COUNTS=True,
        CORS_ORIGINS=[s.strip() for s in os.environ.get('CHARGE_GAP_CORS_ORIGINS',
            'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000').split(',') if s.strip()])
    # Byte budgets for the per-process caches (0 disables). Sized for Render Free's 512 MiB.
    app.config.update(RESPONSE_CACHE_BYTES=16*1024*1024,LOCATIONS_CACHE_BYTES=48*1024*1024)
    if config:app.config.update(config)
    store=app.config.get('DATA_STORE') or DataStore(app.config['PROJECT_ROOT'],app.config['VERIFY_SNAPSHOT_COUNTS'])
    app.extensions['chargegap_data']=store
    response_cache=ByteLRU(app.config['RESPONSE_CACHE_BYTES'],'responses')
    locations_cache=ByteLRU(app.config['LOCATIONS_CACHE_BYTES'],'locations')
    app.extensions['chargegap_caches']={'responses':response_cache,'locations':locations_cache}
    app.extensions['chargegap_cache_stats']=lambda:[response_cache.stats(),locations_cache.stats()]
    app.register_blueprint(create_blueprint(store,response_cache,locations_cache))

    @app.errorhandler(APIError)
    def api_error(error):
        return jsonify({'error':{'code':error.code,'message':error.message,'parameter':error.parameter},
            'meta':{'api_version':'1.0'}}),error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        response=error.get_response()
        response.data=app.json.dumps({'error':{'code':error.name.upper().replace(' ','_'),
            'message':'요청 경로 또는 HTTP 메서드를 확인하세요.','parameter':None},'meta':{'api_version':'1.0'}})
        response.content_type='application/json'
        return response

    @app.errorhandler(Exception)
    def server_error(error):
        # Do not expose environment variables, filesystem paths or exception text.
        app.logger.error('API internal error: %s',type(error).__name__)
        return jsonify({'error':{'code':'INTERNAL_ERROR','message':'요청을 처리하지 못했습니다.','parameter':None},
            'meta':{'api_version':'1.0'}}),500

    @app.after_request
    def response_headers(response):
        response.headers['X-Content-Type-Options']='nosniff'
        origin=request.headers.get('Origin')
        if origin in app.config['CORS_ORIGINS']:
            response.headers['Access-Control-Allow-Origin']=origin
            response.headers['Access-Control-Allow-Methods']='GET, HEAD, OPTIONS'
            response.headers['Access-Control-Allow-Headers']='Content-Type'
            response.headers['Access-Control-Max-Age']='600'
            response.vary.add('Origin')
        return response

    return app
