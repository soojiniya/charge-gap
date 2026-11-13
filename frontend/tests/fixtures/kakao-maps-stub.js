/* 브라우저 회귀 검사 전용 카카오맵 SDK 대역(stub).
 * 실제 SDK(https://dapi.kakao.com/v2/maps/sdk.js)는 등록 도메인·네트워크가 필요해 자동 검사에서 쓸 수 없으므로,
 * 검사 중에만 같은 주소의 응답을 이 파일로 바꿔 끼웁니다(앱 코드는 실제 SDK와 같은 API만 호출).
 * 구현 범위: Map(레벨·중심·영역·투영·끌기·휠 확대·클릭/마우스 이동 이벤트), LatLng, LatLngBounds, Point, event, load.
 * 좌표 변환은 카카오 좌표계 축척(레벨 L = 2^(L−3) m/px)의 단순 근사이고, 지도 그림(타일)은 그리지 않습니다. */
(function () {
  'use strict';
  // 카카오 지도 좌표계(중부원점 TM, 127°E·38°N 기준)를 단순화한 근사: 레벨 L의 해상도 = 2^(L−3) m/px
  // (실제 SDK 측정: 레벨 12에서 서울–전남 원 사이 567px / 290.6km ≈ 512.6 m/px). 화면 크기 검사가 실제와 같은 축척이 되도록 함.
  var M_PER_DEG_LAT = 110950;
  var M_PER_DEG_LNG_EQ = 111320;
  var res = function (level) { return Math.pow(2, level - 3); };
  function project(lat, lng, level) {
    var r = res(level);
    return { x: ((lng - 127) * M_PER_DEG_LNG_EQ * Math.cos((lat * Math.PI) / 180)) / r, y: (-(lat - 38) * M_PER_DEG_LAT) / r };
  }
  function unproject(x, y, level) {
    var r = res(level);
    var lat = 38 - (y * r) / M_PER_DEG_LAT;
    return { lat: lat, lng: 127 + (x * r) / (M_PER_DEG_LNG_EQ * Math.cos((lat * Math.PI) / 180)) };
  }
  function LatLng(lat, lng) { this.lat_ = lat; this.lng_ = lng; }
  LatLng.prototype.getLat = function () { return this.lat_; };
  LatLng.prototype.getLng = function () { return this.lng_; };
  function Point(x, y) { this.x = x; this.y = y; }
  function LatLngBounds(sw, ne) { this.sw = sw || null; this.ne = ne || null; }
  LatLngBounds.prototype.getSouthWest = function () { return this.sw; };
  LatLngBounds.prototype.getNorthEast = function () { return this.ne; };
  LatLngBounds.prototype.extend = function (l) {
    if (!this.sw) { this.sw = new LatLng(l.getLat(), l.getLng()); this.ne = new LatLng(l.getLat(), l.getLng()); return; }
    this.sw = new LatLng(Math.min(this.sw.getLat(), l.getLat()), Math.min(this.sw.getLng(), l.getLng()));
    this.ne = new LatLng(Math.max(this.ne.getLat(), l.getLat()), Math.max(this.ne.getLng(), l.getLng()));
  };

  var registry = [];
  var event = {
    addListener: function (target, type, fn) { registry.push({ target: target, type: type, fn: fn }); },
    removeListener: function (target, type, fn) {
      registry = registry.filter(function (r) { return !(r.target === target && r.type === type && r.fn === fn); });
    },
    trigger: function (target, type, arg) {
      registry.filter(function (r) { return r.target === target && r.type === type; }).forEach(function (r) { r.fn(arg); });
    },
  };

  function KMap(el, opts) {
    var self = this;
    this.el = el;
    this.c = opts.center;
    this.level = opts.level;
    this.minL = 1;
    this.maxL = 14;
    this.idleTimer = 0;
    var pane = document.createElement('div');
    pane.className = 'kakao-stub-pane';
    pane.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#d8d8d8';
    el.appendChild(pane);
    var down = null;
    var rel = function (e) { var r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    pane.addEventListener('mousedown', function (e) { down = { p: rel(e), c: self.cpx(), moved: false }; });
    window.addEventListener('mouseup', function (e) {
      if (!down) return;
      var d = down;
      down = null;
      if (!d.moved && e.target && el.contains(e.target)) {
        var p = rel(e);
        event.trigger(self, 'click', { latLng: self.getProjection().coordsFromContainerPoint(new Point(p.x, p.y)), point: new Point(p.x, p.y) });
      }
      if (d.moved) self.changed(false);
    });
    pane.addEventListener('mousemove', function (e) {
      var p = rel(e);
      if (down) {
        var dx = p.x - down.p.x;
        var dy = p.y - down.p.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) down.moved = true;
        if (down.moved) {
          var ll = unproject(down.c.x - dx, down.c.y - dy, self.level);
          self.c = new LatLng(ll.lat, ll.lng);
          event.trigger(self, 'bounds_changed');
          event.trigger(self, 'center_changed');
        }
        return;
      }
      event.trigger(self, 'mousemove', { latLng: self.getProjection().coordsFromContainerPoint(new Point(p.x, p.y)), point: new Point(p.x, p.y) });
    });
    pane.addEventListener('wheel', function (e) { e.preventDefault(); self.setLevel(self.level + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  }
  KMap.prototype.size = function () { return { w: this.el.clientWidth, h: this.el.clientHeight }; };
  KMap.prototype.cpx = function () { return project(this.c.getLat(), this.c.getLng(), this.level); };
  KMap.prototype.getProjection = function () {
    var self = this;
    return {
      containerPointFromCoords: function (l) {
        var z = self.level, c = self.cpx(), p = project(l.getLat(), l.getLng(), z), s = self.size();
        return new Point(p.x - c.x + s.w / 2, p.y - c.y + s.h / 2);
      },
      coordsFromContainerPoint: function (pt) {
        var z = self.level, c = self.cpx(), s = self.size();
        var ll = unproject(c.x + pt.x - s.w / 2, c.y + pt.y - s.h / 2, z);
        return new LatLng(ll.lat, ll.lng);
      },
      pointFromCoords: function (l) { var p = project(l.getLat(), l.getLng(), self.level); return new Point(p.x, p.y); },
    };
  };
  KMap.prototype.getBounds = function () {
    var pr = this.getProjection(), s = this.size();
    var sw = pr.coordsFromContainerPoint(new Point(0, s.h)), ne = pr.coordsFromContainerPoint(new Point(s.w, 0));
    return new LatLngBounds(sw, ne);
  };
  KMap.prototype.setBounds = function (b, pt, pr, pb, pl) {
    pt = pt || 0; pr = pr || 0; pb = pb || 0; pl = pl || 0;
    var s = this.size(), aw = Math.max(1, s.w - pl - pr), ah = Math.max(1, s.h - pt - pb);
    var level = this.maxL;
    for (var L = this.minL; L <= this.maxL; L += 1) {
      var z = L, a = project(b.getNorthEast().getLat(), b.getSouthWest().getLng(), z), c = project(b.getSouthWest().getLat(), b.getNorthEast().getLng(), z);
      if (c.x - a.x <= aw && c.y - a.y <= ah) { level = L; break; }
    }
    var zz = level;
    var nw = project(b.getNorthEast().getLat(), b.getSouthWest().getLng(), zz), se = project(b.getSouthWest().getLat(), b.getNorthEast().getLng(), zz);
    var midX = (nw.x + se.x) / 2, midY = (nw.y + se.y) / 2;
    // 여백 영역의 가운데에 범위 가운데가 오도록 지도 중심을 옮김
    var cx = midX - (pl + aw / 2 - s.w / 2), cy = midY - (pt + ah / 2 - s.h / 2);
    var ll = unproject(cx, cy, zz);
    var zoomChanged = level !== this.level;
    this.level = level;
    this.c = new LatLng(ll.lat, ll.lng);
    this.changed(zoomChanged);
  };
  KMap.prototype.getLevel = function () { return this.level; };
  KMap.prototype.setLevel = function (l, opts) {
    l = Math.max(this.minL, Math.min(this.maxL, Math.round(l)));
    if (l === this.level) return;
    // 실제 SDK 동작 재현: 애니메이션 확대 중에는 panTo가 무시됨(아래 panTo 참고)
    if (opts && opts.animate) this.animUntil = Date.now() + ((opts.animate && opts.animate.duration) || 300);
    if (opts && opts.anchor) {
      var before = this.getProjection().containerPointFromCoords(opts.anchor);
      this.level = l;
      var after = this.getProjection().containerPointFromCoords(opts.anchor), c = this.cpx();
      var ll = unproject(c.x + (after.x - before.x), c.y + (after.y - before.y), l);
      this.c = new LatLng(ll.lat, ll.lng);
    } else this.level = l;
    this.changed(true);
  };
  KMap.prototype.getCenter = function () { return this.c; };
  KMap.prototype.setCenter = function (l) { this.c = new LatLng(l.getLat(), l.getLng()); this.changed(false); };
  KMap.prototype.panTo = function (l) {
    // 실제 카카오 SDK 실측: setLevel(…, {animate}) 직후 panTo를 부르면 이동이 취소되어 중심이 그대로 남음
    if (this.animUntil && Date.now() < this.animUntil) return;
    this.setCenter(l);
  };
  KMap.prototype.relayout = function () { this.changed(false); };
  KMap.prototype.setMinLevel = function (l) { this.minL = l; };
  KMap.prototype.setMaxLevel = function (l) { this.maxL = l; };
  KMap.prototype.setCursor = function () {};
  KMap.prototype.changed = function (zoom) {
    var self = this;
    event.trigger(this, 'bounds_changed');
    event.trigger(this, 'center_changed');
    if (zoom) event.trigger(this, 'zoom_changed');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(function () { event.trigger(self, 'idle'); }, 30);
  };

  window.kakao = window.kakao || {};
  window.kakao.maps = {
    Map: KMap,
    LatLng: LatLng,
    LatLngBounds: LatLngBounds,
    Point: Point,
    event: event,
    load: function (cb) { setTimeout(cb, 0); },
    __stub: true,
  };
})();
