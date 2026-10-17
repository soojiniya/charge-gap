from pathlib import Path
import sys
import pandas as pd
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from chargegap_api import create_app


@pytest.fixture(scope='session')
def app():
    return create_app({'TESTING':True})


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture(scope='session')
def truth():
    path=Path(__file__).resolve().parents[2]/'data/processed/charger_info_clean.csv'
    return pd.read_csv(path,usecols=['statId','chgerId','zcode','chgerType','busiId','busiNm','delYn','output'],dtype=str,keep_default_na=False)
