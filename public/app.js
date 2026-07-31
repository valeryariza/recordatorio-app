const API_URL = '/api/recordatorios';

const form = document.getElementById('formRecordatorio');
const lista = document.getElementById('listaRecordatorios');

async function cargarRecordatorios() {
    const res = await fetch(API_URL);
    const recordatorios = await res.json();
    lista.innerHTML = '';

    recordatorios.forEach(r => {
        const li = document.createElement('li');
        if (r.completado) li.classList.add('completado');

        li.innerHTML = `
            <h3>${r.titulo}</h3>
            <p>${r.descripcion || ''}</p>
            <small>${new Date(r.fecha_hora).toLocaleString()}</small>
            <div class="acciones">
                <button onclick="marcarCompletado(${r.id}, ${!r.completado})">
                    ${r.completado ? 'Desmarcar' : 'Completar'}
                </button>
                <button class="btn-borrar" onclick="borrarRecordatorio(${r.id})">Borrar</button>
            </div>
        `;
        lista.appendChild(li);
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titulo = document.getElementById('titulo').value;
    const descripcion = document.getElementById('descripcion').value;
    const fecha_hora = document.getElementById('fecha_hora').value;

    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, descripcion, fecha_hora })
    });

    form.reset();
    cargarRecordatorios();
});

async function marcarCompletado(id, nuevoEstado) {
    const res = await fetch(API_URL);
    const recordatorios = await res.json();
    const r = recordatorios.find(x => x.id === id);

    await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...r, completado: nuevoEstado })
    });

    cargarRecordatorios();
}

async function borrarRecordatorio(id) {
    await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    cargarRecordatorios();
}

cargarRecordatorios();

// ===== NOTIFICACIONES PUSH (funcionan en iPhone tambien) =====

async function registrarServiceWorker() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push no soportado en este navegador');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') {
            console.log('Permiso de notificaciones denegado');
            return;
        }

        // Traer la clave publica VAPID del servidor
        const res = await fetch('/api/vapid-public-key');
        const { publicKey } = await res.json();

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // Enviar la suscripcion al backend para guardarla
        await fetch('/api/suscripciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });

        console.log('Suscripcion push registrada correctamente');
    } catch (error) {
        console.error('Error registrando push:', error);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

registrarServiceWorker();