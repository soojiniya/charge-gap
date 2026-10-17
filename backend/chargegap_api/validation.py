import math
import re
from flask import request
from .data import REGIONS_2026, TYPE_DEFINITIONS


class APIError(Exception):
    def __init__(self, message, parameter=None, status=400, code='INVALID_PARAMETER'):
        self.message,self.parameter,self.status,self.code = message,parameter,status,code


def allowed_parameters(names):
    for key in request.args:
        if key not in names:
            raise APIError('지원하지 않는 요청변수입니다.',key)
        if len(request.args.getlist(key)) != 1:
            raise APIError('동일 요청변수는 한 번만 전달하세요.',key)
        if not request.args[key].strip():
            raise APIError('빈 요청변수는 허용하지 않습니다.',key)


def choice(name, choices, default=None):
    value = request.args.get(name,default)
    if value is not None and value not in choices:
        raise APIError('허용된 값 또는 해당 자료의 지역 체계를 확인하세요.',name)
    return value


def integer(name,default,minimum,maximum):
    raw = request.args.get(name,str(default))
    if not re.fullmatch(r'[0-9]{1,9}',raw):
        raise APIError('정수 형식이 필요합니다.',name)
    value = int(raw)
    if not minimum <= value <= maximum:
        raise APIError(f'{minimum}~{maximum} 범위가 필요합니다.',name)
    return value


def charger_filters(store):
    return {'region_code':choice('region_code',REGIONS_2026),
        'charger_type':choice('charger_type',TYPE_DEFINITIONS),
        'deletion':choice('deletion',{'all','not_deleted','deleted'},'all'),
        'operator_id':choice('operator_id',store.operator_ids)}


def bounding_box():
    if 'bbox' not in request.args:
        return None
    try:
        coordinates = [float(x) for x in request.args['bbox'].split(',')]
    except ValueError:
        raise APIError('bbox는 서경도,남위도,동경도,북위도의 숫자 4개입니다.','bbox') from None
    if len(coordinates)!=4 or not all(math.isfinite(x) for x in coordinates):
        raise APIError('bbox는 유한한 숫자 4개가 필요합니다.','bbox')
    west,south,east,north=coordinates
    if not (-180<=west<=east<=180 and -90<=south<=north<=90):
        raise APIError('bbox 좌표 범위 또는 최소/최대 순서를 확인하세요.','bbox')
    return tuple(coordinates)
