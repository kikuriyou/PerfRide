function buildRespondUrl(respondPath, data, action) {
  const base = new URL(respondPath || '/dashboard', self.location.origin);
  const params = new URLSearchParams(base.search);
  Object.keys(data || {}).forEach(function (key) {
    const value = data[key];
    if (
      key === 'respond_path' ||
      key === 'respond_url' ||
      value === undefined ||
      value === null ||
      typeof value === 'object'
    ) {
      return;
    }
    params.set(key, String(value));
  });
  const effectiveAction = action || (data && data.kind === 'weekly_review' ? 'open_review' : '');
  if (effectiveAction) {
    params.set('action', effectiveAction);
  }
  const search = params.toString();
  return base.pathname + (search ? '?' + search : '');
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'PerfRide';
  var actions = (data.actions || []).map(function (a) {
    return { action: a.id || a.action, title: a.label || a.title };
  });
  var options = {
    body: data.body || '',
    data: data.data || {},
    actions: actions,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const url = buildRespondUrl(data.respond_path || data.respond_url, data, action);
  event.waitUntil(clients.openWindow(url));
});
