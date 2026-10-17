import math
from urllib.parse import urlencode
import pandas as pd
import pytest
from chargegap_api.data import DataStore


def linear(values, p):
    values=sorted(values); h=(len(values)-1)*p; lo=math.floor(h); hi=math.ceil(h)
    return values[lo]+(values[hi]-values[lo])*(h-lo)


@pytest.mark.parametrize('query', [
    {}, {'deletion':'not_deleted'}, {'deletion':'deleted'}, {'region_code':'12'},
    {'region_code':'41','charger_type':'02','deletion':'not_deleted','operator_id':'PI'},
    {'region_code':'11','charger_type':'04','deletion':'deleted','operator_id':'ME'},
    {'charger_type':'09'}, {'operator_id':'PI','deletion':'deleted'},
])
def test_real_filters(client,truth,query):
    response=client.get('/api/station-size-distribution?'+urlencode(query))
    assert response.status_code==200
    result=response.json; frame=truth.copy()
    for parameter,column in [('region_code','zcode'),('charger_type','chgerType'),('operator_id','busiId')]:
        if parameter in query: frame=frame.loc[frame[column].str.strip().eq(query[parameter])]
    deletion=query.get('deletion','all')
    if deletion!='all':frame=frame.loc[frame.delYn.eq('N' if deletion=='not_deleted' else 'Y')]
    assert result['meta']['matched']['charger_count']==len(frame)
    sizes=frame.groupby(['zcode','statId']).chgerId.nunique()
    assert sum(r['sample_count'] for r in result['data'])==len(sizes)
    assert sum(r['charger_count'] for r in result['data'])==len(frame)
    for row in result['data']:
        values=list(sizes.loc[row['region_code']])
        q1,med,q3=[linear(values,p) for p in [.25,.5,.75]]
        assert [row['q1'],row['median'],row['q3']]==[q1,med,q3]
        inside=[v for v in values if q1-1.5*(q3-q1)<=v<=q3+1.5*(q3-q1)]
        assert (row['whisker_low'],row['whisker_high'])==(min(inside),max(inside))
        assert row['outlier_count']==len(values)-len(inside)
        assert sum(x['station_count'] for x in row['outlier_distribution'])==row['outlier_count']
        assert row['sample_count']==row['station_count']==len(values)
        assert row['mean']==pytest.approx(sum(values)/len(values))
    if not len(frame):assert result['data']==[] and result['meta']['sample_count']==0


@pytest.mark.parametrize('query',['region_code=29','region_code=','charger_type=99','operator_id=NOT_REAL',
    'deletion=N','unknown=1','region_code=11&region_code=41','limit=10'])
def test_invalid(client,query):
    response=client.get('/api/station-size-distribution?'+query)
    assert response.status_code==400
    assert response.json['error']['code']=='INVALID_PARAMETER'


@pytest.mark.parametrize('values',[[1],[2,2,2,2,9],[1,2,3,4],[1,1,2,3,6],[1,2,3,4,100]])
def test_edge_cases(values):
    rows=[{'zcode':'11','statId':str(i),'chgerId':str(j)} for i,n in enumerate(values) for j in range(n)]
    # Duplicate input charger IDs must not inflate station sizes.
    rows.append(rows[0].copy())
    result=DataStore.station_size_distribution(pd.DataFrame(rows))[0]
    q1,med,q3=[linear(values,p) for p in [.25,.5,.75]]
    assert (result['q1'],result['median'],result['q3'])==(q1,med,q3)
    inside=[v for v in values if q1-1.5*(q3-q1)<=v<=q3+1.5*(q3-q1)]
    assert result['charger_count']==sum(values)
    assert result['whisker_low']==min(inside) and result['whisker_high']==max(inside)
    assert result['outlier_count']==len(values)-len(inside)


def test_methods(client):
    assert client.post('/api/station-size-distribution').status_code==405
