"""Deployment-only launcher; download process is replaced before pandas loads.

Every boot stage is logged ("Boot: ...") so a missing line shows where startup stopped:
no "start.py started" means the container never ran this file. Logs never contain
environment values other than the port and non-secret download limits.
"""
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit

from download_data import ConfigurationError as DownloadConfigurationError, DownloadLimits

# The download process stops itself at its deadline; this margin only covers a child that cannot.
GUARD_MARGIN_S=120


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


def boot_log(message):
    print('Boot: '+message,flush=True)


def main():
    stage='runtime_configuration'
    guard=None
    boot_log(f'start.py started (pid {os.getpid()})')
    try:
        port,origins=runtime_settings(os.environ)
        try:
            limits=DownloadLimits.from_env(os.environ)
        except DownloadConfigurationError:
            raise RuntimeConfigurationError('CHARGE_GAP_DOWNLOAD_* limits must be whole numbers within the documented ranges') from None
        boot_log(f'runtime configuration ok (port {port}, {len(origins.split(","))} CORS origin(s); '
                 f'download {limits.describe()})')
        stage='data_bootstrap'
        guard=limits.deadline_s+GUARD_MARGIN_S
        boot_log(f'data bootstrap started (download stops itself after {limits.deadline_s}s; launcher guard {guard}s)')
        started=time.monotonic()
        subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('download_data.py'))],check=True,timeout=guard)
        boot_log(f'data bootstrap finished in {time.monotonic()-started:.0f}s')
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
        boot_log('starting waitress (1 thread); the data snapshot loads before the port opens and "Serving on" is logged')
        os.execvpe('waitress-serve',['waitress-serve','--host=0.0.0.0',f'--port={port}',
                   '--threads=1','--call','chargegap_api:create_app'],env)
    except RuntimeConfigurationError as exc:
        print('Deployment startup failed [runtime_configuration]: '+str(exc),flush=True)
        raise SystemExit(1) from None
    except subprocess.TimeoutExpired:
        print(f'Deployment startup failed [{stage}]: TimeoutExpired; guard={guard}s',flush=True)
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
