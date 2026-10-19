"""Deployment-only launcher; download process is replaced before pandas loads."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit


class RuntimeConfigurationError(ValueError):
    """Only fixed diagnostics; never include an environment value."""


def runtime_settings(env):
    try:
        port=int(env.get('PORT','10000'))
    except (TypeError, ValueError):
        raise RuntimeConfigurationError('PORT must be an integer from 1 to 65535') from None
    if not 1 <= port <= 65535:
        raise RuntimeConfigurationError('PORT must be an integer from 1 to 65535')
    origins=[v.strip() for v in env.get('CHARGE_GAP_CORS_ORIGINS','').split(',') if v.strip()]
    if not origins:
        raise RuntimeConfigurationError('CHARGE_GAP_CORS_ORIGINS is required; set the exact HTTPS frontend origin')
    for value in origins:
        try:
            p=urlsplit(value)
            p.port  # Validate malformed/out-of-range ports without logging the input.
        except ValueError:
            raise RuntimeConfigurationError('CHARGE_GAP_CORS_ORIGINS must contain valid HTTPS origins') from None
        if (p.scheme!='https' or not p.hostname or p.username or p.password
                or p.path or p.query or p.fragment):
            raise RuntimeConfigurationError('CHARGE_GAP_CORS_ORIGINS requires exact HTTPS origins without path, trailing slash, credentials, query or fragment')
    return port,','.join(origins)


def main():
    stage='runtime_configuration'
    try:
        port,origins=runtime_settings(os.environ)
        stage='data_bootstrap'
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
        stage='wsgi_exec'
        os.execvpe('waitress-serve',['waitress-serve','--host=0.0.0.0',f'--port={port}',
                   '--threads=1','--call','chargegap_api:create_app'],env)
    except RuntimeConfigurationError as exc:
        print('Deployment startup failed [runtime_configuration]: '+str(exc),flush=True)
        raise SystemExit(1) from None
    except subprocess.CalledProcessError as exc:
        code=exc.returncode if type(exc.returncode) is int else 'unknown'
        print(f'Deployment startup failed [{stage}]: CalledProcessError; child_exit={code}',flush=True)
        raise SystemExit(1) from None
    except Exception as exc:
        print(f'Deployment startup failed [{stage}]: '+type(exc).__name__,flush=True)
        raise SystemExit(1) from None


if __name__=='__main__':
    main()
