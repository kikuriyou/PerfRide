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
  const data = event.notification.data;
  const url =
    action && data.respond_url ? `${data.respond_url}?action=${action}` : '/dashboard';
  event.waitUntil(clients.openWindow(url));
});
