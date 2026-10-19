"""Deployment-only launcher; download process is replaced before pandas loads."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit


def runtime_settings(env):
    port=int(env.get('PORT','10000'))
    if not 1 <= port <= 65535:
        raise ValueError('Invalid PORT')
    origins=[v.strip() for v in env.get('CHARGE_GAP_CORS_ORIGINS','').split(',') if v.strip()]
    if not origins:
        raise ValueError('Set the HTTPS frontend origin')
    for value in origins:
        p=urlsplit(value)
        if (p.scheme!='https' or not p.hostname or p.username or p.password
                or p.path or p.query or p.fragment):
            raise ValueError('CORS requires exact HTTPS origins without trailing slash')
    return port,','.join(origins)


def main():
    try:
        port,origins=runtime_settings(os.environ)
        subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('download_data.py'))],check=True)
        env=os.environ.copy()
        # Read credentials are not needed by the public application after boot.
        for key in list(env):
            if key.startswith('CHARGE_GAP_S3_'):
                del env[key]
        env['CHARGE_GAP_CORS_ORIGINS']=origins
        for key in ['OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS',
                    'NUMEXPR_NUM_THREADS','VECLIB_MAXIMUM_THREADS','BLIS_NUM_THREADS']:
            env[key]='1'
        os.execvpe('waitress-serve',['waitress-serve','--host=0.0.0.0',f'--port={port}',
                   '--threads=1','--call','chargegap_api:create_app'],env)
    except Exception as exc:
        print('Deployment startup failed: '+type(exc).__name__,flush=True)
        raise SystemExit(1) from None


if __name__=='__main__':
    main()
