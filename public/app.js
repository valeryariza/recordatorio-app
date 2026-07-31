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

// ===== NOTIFICACIONES =====

// Pedir permiso al cargar la página
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Guardamos en el navegador los IDs que ya notificamos, para no repetir
function getNotificados() {
    return JSON.parse(localStorage.getItem('notificados') || '[]');
}

function marcarComoNotificado(id) {
    const notificados = getNotificados();
    notificados.push(id);
    localStorage.setItem('notificados', JSON.stringify(notificados));
}

async function revisarRecordatorios() {
    if (Notification.permission !== 'granted') return;

    const res = await fetch(API_URL);
    const recordatorios = await res.json();
    const notificados = getNotificados();
    const ahora = new Date();

    recordatorios.forEach(r => {
        const fechaRecordatorio = new Date(r.fecha_hora);
        const yaNotificado = notificados.includes(r.id);
        const yaPaso = fechaRecordatorio <= ahora;
        const faltaPoco = fechaRecordatorio - ahora <= 60000; // 1 minuto antes

        if (!r.completado && !yaNotificado && (yaPaso || faltaPoco)) {
            new Notification('⏰ Recordatorio', {
                body: r.titulo,
                icon: '📌'
            });
            marcarComoNotificado(r.id);
        }
    });
}

// Revisar cada 30 segundos
setInterval(revisarRecordatorios, 30000);
revisarRecordatorios(); // revisar también apenas carga