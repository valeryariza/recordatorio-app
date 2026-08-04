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
    const fecha_hora_local = document.getElementById('fecha_hora').value;
    const fecha_hora = new Date(fecha_hora_local).toISOString();

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, descripcion, fecha_hora })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            alert('Error al guardar: ' + (errorData.error || `Codigo ${res.status}`));
            return; // no limpiar el formulario si hubo error
        }

        form.reset();
        cargarRecordatorios();
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('Error registrando SW:', err));
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function activarNotificaciones() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Este navegador no soporta notificaciones push');
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        const permiso = await Notification.requestPermission();
        if (permiso !== 'granted') {
            alert('No se concedio el permiso de notificaciones');
            return false;
        }

        const res = await fetch('/api/vapid-public-key');
        const { publicKey } = await res.json();

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        await fetch('/api/suscripciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });

        console.log('Suscripcion push registrada correctamente');
        return true;
    } catch (error) {
        console.error('Error registrando push:', error);
        alert('Hubo un error activando las notificaciones: ' + error.message);
        return false;
    }
}

const btnActivar = document.getElementById('btnActivarNotificaciones');
if (btnActivar) {
    btnActivar.addEventListener('click', async () => {
        btnActivar.textContent = 'Activando...';
        const exito = await activarNotificaciones();
        if (exito) {
            btnActivar.textContent = '✅ Notificaciones activadas';
            btnActivar.disabled = true;
        } else {
            btnActivar.textContent = '🔔 Activar notificaciones';
        }
    });
}