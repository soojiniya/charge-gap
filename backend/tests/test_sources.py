"""Source metadata: provider/author/dataset/basis/saved date/licence are separated in every response,
공공누리 제1유형 is claimed only for the officially confirmed charger API, and the existing fields stay unchanged."""
import pytest

PATHS = {
    'ev_registration': ['/api/ev-registration', '/api/overview'],
    'chargers': ['/api/overview', '/api/charger-regions', '/api/charger-types', '/api/charger-output',
                 '/api/operators', '/api/station-size-distribution', '/api/locations?limit=1'],
    'growth': ['/api/growth'],
}
COMMON = ['provider', 'author', 'dataset', 'reference_basis', 'license', 'license_confirmed', 'source_url']


@pytest.mark.parametrize('key,path', [(k, p) for k, ps in PATHS.items() for p in ps])
def test_every_response_carries_separated_source_fields(client, key, path):
    src = client.get(path).get_json()['meta']['sources'][key]
    for field in COMMON:
        assert field in src and src[field] not in ('', None), (path, field)


def test_registration_source_names_statistics_db_and_author(client):
    src = client.get('/api/ev-registration').get_json()['meta']['sources']['ev_registration']
    assert src['provider'] == '국토교통부 통계누리' and src['author'] == '국토교통부'
    assert '자동차 등록자료 통계' in src['dataset'] and '10.연료별_등록현황' in src['dataset']
    assert src['reference_basis'] == '2026년 9월 말 등록 기준' and src['file_saved_date'] == '2026-10-20'
    assert src['license_confirmed'] is False and src['license'].startswith('확인 중')
    assert '제1유형' not in src['license']
    # existing fields unchanged
    assert src['file'] == 'ev_registration_by_region_2026_09.csv' and src['reference_month'] == '2026-09'
    assert src['source'] == '2026년 9월 자동차 등록자료 / 10.연료별_등록현황'


def test_charger_source_is_the_only_confirmed_type1(client):
    src = client.get('/api/charger-regions').get_json()['meta']['sources']['chargers']
    assert src['provider'] == '한국환경공단' and src['platform'] == '공공데이터포털'
    assert src['license_confirmed'] is True and src['license'] == '공공누리 제1유형 (출처표시)'
    assert src['source_url'] == 'https://www.data.go.kr/data/15076352/openapi.do'
    assert src['snapshot_date'] == '2026-10-15' and src['snapshot_start_at'] and src['snapshot_end_at']
    assert src['source'] == '한국환경공단 getChargerInfo'


def test_growth_source_separates_official_label_saved_date_and_revision(client):
    src = client.get('/api/growth').get_json()['meta']['sources']['growth']
    assert src['provider'] == '무공해차 통합누리집'
    assert src['official_update_label_at_collection'] == '2026-09-30' and src['file_saved_date'] == '2026-10-15'
    assert src['license_confirmed'] is False and '제1유형' not in src['license']
    note = src['revision_note']
    assert '현재 공식 최신값이 아닙니다' in note and '2026-10-31' in note and '공식적으로 확인되지 않았습니다' in note
    for word in ('철거', '삭제된', '정정되'):
        assert word not in note
    # existing fields unchanged
    assert src['source'] == '충전기 설치 성장 추세_2026-10-15.xlsx' and src['source_filename_date'] == '2026-10-15'
    assert src['measurement_cutoff_date'] is None and src['partial_year'] == 2026


def test_static_chart_warning_explains_png_and_web_basis(client):
    warning = client.get('/api/charts').get_json()['meta']['static_chart_warning']
    for part in ('2025-12', '17개 시도', '2026-09', '16개 지역'):
        assert part in warning
