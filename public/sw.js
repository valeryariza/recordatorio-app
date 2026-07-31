// Escuchar cuando llega una notificación push del servidor
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};

    const title = data.title || 'Recordatorio';
    const options = {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Al hacer clic en la notificación, abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow('/');
        })
    );
});