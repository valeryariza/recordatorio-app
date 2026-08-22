// ===================== NAVEGACION ENTRE PANTALLAS =====================

const pantallas = {
    login: document.getElementById('pantallaLogin'),
    registroSelector: document.getElementById('pantallaRegistroSelector'),
    registroPaciente: document.getElementById('pantallaRegistroPaciente'),
    registroTerapeuta: document.getElementById('pantallaRegistroTerapeuta'),
    verificarEmail: document.getElementById('pantallaVerificarEmail'),
    app: document.getElementById('pantallaApp'),
    perfil: document.getElementById('pantallaPerfil'),
    terapeuta: document.getElementById('pantallaTerapeuta')
};

function mostrarPantalla(nombre) {
    Object.values(pantallas).forEach(p => p.classList.add('oculta'));
    pantallas[nombre].classList.remove('oculta');
}

document.querySelectorAll('[data-ir]').forEach(el => {
    el.addEventListener('click', (e) => {
        e.preventDefault();
        mostrarPantalla(el.dataset.ir);
    });
});

// ===================== SESION =====================

function guardarSesion(token, usuario) {
    localStorage.setItem('comfi_token', token);
    localStorage.setItem('comfi_usuario', JSON.stringify(usuario));
}

function obtenerToken() {
    return localStorage.getItem('comfi_token');
}

function obtenerUsuario() {
    const raw = localStorage.getItem('comfi_usuario');
    return raw ? JSON.parse(raw) : null;
}

function cerrarSesion() {
    detenerRevisionAlarmas();
    ocultarAlarma();
    localStorage.removeItem('comfi_token');
    localStorage.removeItem('comfi_usuario');
    mostrarPantalla('login');
}

document.getElementById('btnCerrarSesion').addEventListener('click', cerrarSesion);
document.getElementById('btnCerrarSesionTerapeuta').addEventListener('click', cerrarSesion);

async function fetchAuth(url, opciones = {}) {
    const token = obtenerToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(opciones.headers || {}),
        'Authorization': `Bearer ${token}`
    };
    return fetch(url, { ...opciones, headers });
}

function iniciarSegunSesion() {
    const usuario = obtenerUsuario();
    if (!usuario) {
        mostrarPantalla('login');
        return;
    }
    if (usuario.rol === 'terapeuta') {
        mostrarPantalla('terapeuta');
        cargarPacientes();
    } else {
        mostrarPantalla('app');
        cargarRecordatorios();
        iniciarRevisionAlarmas();
    }
}

// ===================== VERIFICACION DE EMAIL =====================

let usuarioIdPendiente = null;

function irAVerificarEmail(usuarioId, email) {
    usuarioIdPendiente = usuarioId;
    document.getElementById('emailAVerificar').textContent = email;
    mostrarPantalla('verificarEmail');
}

document.getElementById('formVerificarEmail').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('codigoVerificacion').value.trim();

    try {
        const res = await fetch('/api/auth/verificar-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId: usuarioIdPendiente, codigo })
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'No se pudo verificar el codigo');
            return;
        }

        guardarSesion(data.token, data.usuario);
        iniciarSegunSesion();
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

document.getElementById('btnReenviarCodigo').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
        const res = await fetch('/api/auth/reenviar-codigo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuarioId: usuarioIdPendiente })
        });
        if (res.ok) {
            alert('Te reenviamos el codigo');
        }
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

// ===================== LOGIN =====================

document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.requiereVerificacion) {
                irAVerificarEmail(data.usuarioId, email);
                return;
            }
            alert(data.error || 'No se pudo iniciar sesion');
            return;
        }

        guardarSesion(data.token, data.usuario);
        iniciarSegunSesion();
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

// ===================== REGISTRO PACIENTE (sin codigo) =====================

document.getElementById('formRegistroPaciente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('pacienteNombre').value;
    const email = document.getElementById('pacienteEmail').value;
    const password = document.getElementById('pacientePassword').value;

    try {
        const res = await fetch('/api/auth/registro-paciente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'No se pudo completar el registro');
            return;
        }

        irAVerificarEmail(data.usuarioId, data.email);
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

// ===================== REGISTRO TERAPEUTA =====================

document.getElementById('formRegistroTerapeuta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('terapeutaNombre').value;
    const email = document.getElementById('terapeutaEmail').value;
    const password = document.getElementById('terapeutaPassword').value;

    try {
        const res = await fetch('/api/auth/registro-terapeuta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'No se pudo completar el registro');
            return;
        }

        irAVerificarEmail(data.usuarioId, data.email);
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

// ===================== PERFIL (paciente) =====================

document.getElementById('btnAbrirPerfil').addEventListener('click', () => {
    mostrarPantalla('perfil');
    cargarMisTerapeutas();
});

document.getElementById('btnVolverDePerfil').addEventListener('click', () => {
    mostrarPantalla('app');
    cargarRecordatorios();
});

async function cargarMisTerapeutas() {
    const res = await fetchAuth('/api/perfil/mis-terapeutas');
    const terapeutas = await res.json();
    const cont = document.getElementById('listaMisTerapeutas');

    if (terapeutas.length === 0) {
        cont.innerHTML = '<p class="texto-secundario">Todavía no estás vinculado a ningún terapeuta.</p>';
        return;
    }

    cont.innerHTML = terapeutas.map(t => `
        <div class="tarjeta-paciente" style="cursor: default;">
            <h3>${t.nombre}</h3>
            <span>${t.email}</span>
        </div>
    `).join('');
}

document.getElementById('formVincularTerapeuta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('codigoTerapeuta').value;

    try {
        const res = await fetchAuth('/api/perfil/vincular-terapeuta', {
            method: 'POST',
            body: JSON.stringify({ codigo })
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'No se pudo vincular');
            return;
        }

        alert('¡Vinculado correctamente!');
        document.getElementById('formVincularTerapeuta').reset();
        cargarMisTerapeutas();
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

// ===================== ELIMINAR CUENTA =====================

const modalEliminarCuenta = document.getElementById('modalEliminarCuenta');

function abrirModalEliminarCuenta() {
    modalEliminarCuenta.classList.remove('oculta');
}

document.getElementById('btnAbrirEliminarCuenta')?.addEventListener('click', abrirModalEliminarCuenta);
document.getElementById('btnAbrirEliminarCuentaTerapeuta')?.addEventListener('click', abrirModalEliminarCuenta);

document.getElementById('btnCancelarEliminarCuenta').addEventListener('click', () => {
    modalEliminarCuenta.classList.add('oculta');
    document.getElementById('formEliminarCuenta').reset();
});

document.getElementById('formEliminarCuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordEliminarCuenta').value;
    const btnSubmit = e.target.querySelector('button[type="submit"]');

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Eliminando...';

    try {
        const res = await fetchAuth('/api/perfil/cuenta', {
            method: 'DELETE',
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'No se pudo eliminar la cuenta');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Sí, eliminar';
            return;
        }

        alert('Tu cuenta fue eliminada. ¡Gracias por haber usado Read Me!');
        localStorage.removeItem('comfi_token');
        localStorage.removeItem('comfi_usuario');
        window.location.reload();
    } catch (error) {
        alert('Error de conexion: ' + error.message);
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Sí, eliminar';
    }
});

// ===================== ALARMA CON FOTO =====================

let recordatorioAlarmaActivo = null;
let intervaloRevisionAlarma = null;
let audioCtxAlarma = null;
let oscAlarma = null;
let lfoAlarma = null;
let gainAlarma = null;
let wakeLockAlarma = null;

function iniciarRevisionAlarmas() {
    revisarAlarmas();
    intervaloRevisionAlarma = setInterval(revisarAlarmas, 5000);
}

function detenerRevisionAlarmas() {
    if (intervaloRevisionAlarma) clearInterval(intervaloRevisionAlarma);
    intervaloRevisionAlarma = null;
}

async function revisarAlarmas() {
    if (recordatorioAlarmaActivo) return; // ya hay una sonando, no buscar otra

    try {
        const res = await fetchAuth(API_URL);
        const recordatorios = await res.json();
        const ahora = new Date();
        const vencido = recordatorios.find(r => !r.completado && new Date(r.fecha_hora) <= ahora);

        if (vencido) {
            mostrarAlarma(vencido);
        }
    } catch (error) {
        console.error('Error revisando alarmas:', error);
    }
}

function mostrarAlarma(recordatorio) {
    recordatorioAlarmaActivo = recordatorio;
    document.getElementById('alarmaTitulo').textContent = recordatorio.titulo;
    document.getElementById('alarmaDescripcion').textContent = recordatorio.descripcion || '';
    document.getElementById('alarmaError').classList.add('oculta');
    document.getElementById('pantallaAlarma').classList.remove('oculta');
    document.body.classList.add('alarma-activa');

    iniciarSonidoAlarma();
    activarBloqueoNavegacion();
    solicitarPantallaCompleta();
    solicitarWakeLock();
}

function ocultarAlarma() {
    recordatorioAlarmaActivo = null;
    document.getElementById('pantallaAlarma').classList.add('oculta');
    document.getElementById('inputFotoAlarma').value = '';
    document.body.classList.remove('alarma-activa');

    detenerSonidoAlarma();
    desactivarBloqueoNavegacion();
    salirPantallaCompleta();
    liberarWakeLock();
}

// --- Evitar que el boton "atras" saque de la alarma ---

function activarBloqueoNavegacion() {
    history.pushState({ alarma: true }, '');
    window.addEventListener('popstate', atraparRetroceso);
}

function desactivarBloqueoNavegacion() {
    window.removeEventListener('popstate', atraparRetroceso);
}

function atraparRetroceso() {
    if (recordatorioAlarmaActivo) {
        history.pushState({ alarma: true }, '');
    }
}

// --- Pantalla completa (oculta la barra del navegador) ---

function solicitarPantallaCompleta() {
    const el = document.documentElement;
    const solicitar = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (solicitar) {
        solicitar.call(el).catch(() => {});
    }
}

function salirPantallaCompleta() {
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
}

// --- Mantener la pantalla encendida mientras suena la alarma ---

async function solicitarWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLockAlarma = await navigator.wakeLock.request('screen');
        }
    } catch (error) {
        console.error('No se pudo activar wake lock:', error);
    }
}

function liberarWakeLock() {
    if (wakeLockAlarma) {
        wakeLockAlarma.release().catch(() => {});
        wakeLockAlarma = null;
    }
}

function iniciarSonidoAlarma() {
    try {
        if (!audioCtxAlarma) {
            audioCtxAlarma = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtxAlarma.state === 'suspended') {
            audioCtxAlarma.resume();
        }

        oscAlarma = audioCtxAlarma.createOscillator();
        gainAlarma = audioCtxAlarma.createGain();
        lfoAlarma = audioCtxAlarma.createOscillator();
        const lfoGain = audioCtxAlarma.createGain();

        oscAlarma.type = 'square';
        oscAlarma.frequency.value = 880;

        lfoAlarma.type = 'square';
        lfoAlarma.frequency.value = 2; // pulsos por segundo, efecto de alarma
        lfoGain.gain.value = 0.15;

        gainAlarma.gain.value = 0.001;

        lfoAlarma.connect(lfoGain);
        lfoGain.connect(gainAlarma.gain);
        oscAlarma.connect(gainAlarma).connect(audioCtxAlarma.destination);

        oscAlarma.start();
        lfoAlarma.start();
    } catch (error) {
        console.error('No se pudo iniciar el sonido de la alarma:', error);
    }

    if (navigator.vibrate) {
        navigator.vibrate([300, 200, 300, 200, 300, 200, 300]);
    }
}

function detenerSonidoAlarma() {
    try {
        if (oscAlarma) { oscAlarma.stop(); oscAlarma.disconnect(); }
        if (lfoAlarma) { lfoAlarma.stop(); lfoAlarma.disconnect(); }
        if (gainAlarma) { gainAlarma.disconnect(); }
    } catch (error) {
        // puede que ya este detenido, no pasa nada
    }
    oscAlarma = null;
    lfoAlarma = null;
    gainAlarma = null;
    if (navigator.vibrate) navigator.vibrate(0);
}

function comprimirImagen(archivo) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxAncho = 800;
                const escala = Math.min(1, maxAncho / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * escala;
                canvas.height = img.height * escala;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        lector.onerror = reject;
        lector.readAsDataURL(archivo);
    });
}

document.getElementById('btnTomarFotoAlarma').addEventListener('click', () => {
    document.getElementById('inputFotoAlarma').click();
});

document.getElementById('inputFotoAlarma').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo || !recordatorioAlarmaActivo) return;

    const btn = document.getElementById('btnTomarFotoAlarma');
    const errorEl = document.getElementById('alarmaError');
    btn.disabled = true;
    btn.textContent = 'Subiendo...';
    errorEl.classList.add('oculta');

    try {
        const fotoBase64 = await comprimirImagen(archivo);
        const res = await fetchAuth(`${API_URL}/${recordatorioAlarmaActivo.id}/completar-con-foto`, {
            method: 'PUT',
            body: JSON.stringify({ foto: fotoBase64 })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            errorEl.textContent = data.error || 'No se pudo confirmar. Probá de nuevo.';
            errorEl.classList.remove('oculta');
            btn.disabled = false;
            btn.textContent = '📷 Tomar foto para apagar';
            return;
        }

        ocultarAlarma();
        cargarRecordatorios();
    } catch (error) {
        errorEl.textContent = 'Error de conexion: ' + error.message;
        errorEl.classList.remove('oculta');
        btn.disabled = false;
        btn.textContent = '📷 Tomar foto para apagar';
    }
});

// ===================== RECORDATORIOS (paciente) =====================

const API_URL = '/api/recordatorios';
const form = document.getElementById('formRecordatorio');
const lista = document.getElementById('listaRecordatorios');

async function cargarRecordatorios() {
    const res = await fetchAuth(API_URL);
    const recordatorios = await res.json();
    lista.innerHTML = '';

    recordatorios.forEach(r => {
        const li = document.createElement('li');
        if (r.completado) li.classList.add('completado');

        const badgeRecurrencia = r.recurrencia === 'diaria' ? '<span class="badge-recurrencia">🔁 Todos los días</span>'
            : r.recurrencia === 'semanal' ? '<span class="badge-recurrencia">🔁 Cada semana</span>'
            : '';

        li.innerHTML = `
            <h3>${r.titulo}</h3>
            <p>${r.descripcion || ''}</p>
            <small>${new Date(r.fecha_hora).toLocaleString()}</small>
            ${badgeRecurrencia}
            <div class="acciones">
                <button onclick="marcarCompletado(${r.id}, ${!r.completado})">
                    ${r.completado ? 'Desmarcar' : 'Completar'}
                </button>
                <button onclick="verHistorial(${r.id}, '${r.titulo.replace(/'/g, "\\'")}')">Historial</button>
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
    const recurrencia = document.getElementById('recurrencia').value;

    try {
        const res = await fetchAuth(API_URL, {
            method: 'POST',
            body: JSON.stringify({ titulo, descripcion, fecha_hora, recurrencia })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            alert('Error al guardar: ' + (errorData.error || `Codigo ${res.status}`));
            return;
        }

        form.reset();
        cargarRecordatorios();
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
});

async function marcarCompletado(id, nuevoEstado) {
    const res = await fetchAuth(API_URL);
    const recordatorios = await res.json();
    const r = recordatorios.find(x => x.id === id);

    await fetchAuth(`${API_URL}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...r, completado: nuevoEstado })
    });

    cargarRecordatorios();
}

async function borrarRecordatorio(id) {
    await fetchAuth(`${API_URL}/${id}`, { method: 'DELETE' });
    cargarRecordatorios();
}

// ===================== HISTORIAL DE CONFIRMACIONES =====================

const modalHistorial = document.getElementById('modalHistorial');

async function verHistorial(recordatorioId, titulo) {
    document.getElementById('historialTitulo').textContent = `Historial: ${titulo}`;
    const cont = document.getElementById('listaHistorial');
    cont.innerHTML = '<p class="texto-secundario">Cargando...</p>';
    modalHistorial.classList.remove('oculta');

    try {
        const res = await fetchAuth(`${API_URL}/${recordatorioId}/historial`);
        const data = await res.json();

        if (!res.ok) {
            cont.innerHTML = `<p class="texto-secundario">${data.error || 'No se pudo cargar el historial'}</p>`;
            return;
        }

        if (data.historial.length === 0) {
            cont.innerHTML = '<p class="texto-secundario">Todavía no hay confirmaciones registradas.</p>';
            return;
        }

        cont.innerHTML = data.historial.map(h => `
            <div class="item-historial">
                ${h.foto ? `<img src="${h.foto}" alt="Confirmación" class="foto-historial">` : ''}
                <span class="fecha-historial">${new Date(h.confirmado_en).toLocaleString()}</span>
            </div>
        `).join('');
    } catch (error) {
        cont.innerHTML = `<p class="texto-secundario">Error de conexion: ${error.message}</p>`;
    }
}

document.getElementById('btnCerrarHistorial').addEventListener('click', () => {
    modalHistorial.classList.add('oculta');
});

// ===================== PANEL TERAPEUTA =====================

const listaPacientesEl = document.getElementById('listaPacientes');
const detallePacienteEl = document.getElementById('detallePaciente');

async function cargarPacientes() {
    const res = await fetchAuth('/api/terapeuta/pacientes');
    const pacientes = await res.json();

    listaPacientesEl.innerHTML = '';
    detallePacienteEl.classList.add('oculta');
    listaPacientesEl.classList.remove('oculta');

    if (pacientes.length === 0) {
        listaPacientesEl.innerHTML = '<p class="texto-secundario">Todavia no tenes pacientes vinculados. Compartile el codigo de arriba a tu primer paciente.</p>';
        return;
    }

    pacientes.forEach(p => {
        const div = document.createElement('div');
        div.className = 'tarjeta-paciente';
        div.innerHTML = `<h3>${p.nombre}</h3><span>${p.email}</span>`;
        div.addEventListener('click', () => verRecordatoriosPaciente(p.id, p.nombre));
        listaPacientesEl.appendChild(div);
    });
}

async function verRecordatoriosPaciente(pacienteId, nombre) {
    const res = await fetchAuth(`/api/terapeuta/pacientes/${pacienteId}/recordatorios`);
    const recordatorios = await res.json();

    document.getElementById('nombrePacienteSeleccionado').textContent = nombre;
    const ul = document.getElementById('listaRecordatoriosPaciente');
    ul.innerHTML = '';

    if (recordatorios.length === 0) {
        ul.innerHTML = '<p class="texto-secundario">Este paciente todavia no registro recordatorios.</p>';
    } else {
        recordatorios.forEach(r => {
            const li = document.createElement('li');
            if (r.completado) li.classList.add('completado');
            li.innerHTML = `
                <h3>${r.titulo}</h3>
                <p>${r.descripcion || ''}</p>
                <small>${new Date(r.fecha_hora).toLocaleString()}</small>
                ${r.foto_confirmacion ? `<img src="${r.foto_confirmacion}" class="foto-confirmacion" alt="Foto de confirmacion">` : ''}
            `;
            ul.appendChild(li);
        });
    }

    listaPacientesEl.classList.add('oculta');
    detallePacienteEl.classList.remove('oculta');
}

document.getElementById('btnVolverPacientes').addEventListener('click', cargarPacientes);

document.getElementById('btnGenerarCodigo').addEventListener('click', async () => {
    const res = await fetchAuth('/api/terapeuta/codigo-invitacion', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('codigoGenerado').textContent = data.codigo;
    } else {
        alert(data.error || 'No se pudo generar el codigo');
    }
});

// ===================== NOTIFICACIONES PUSH =====================

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

        await fetchAuth('/api/suscripciones', {
            method: 'POST',
            body: JSON.stringify(subscription)
        });

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

// ===================== ARRANQUE =====================

iniciarSegunSesion();