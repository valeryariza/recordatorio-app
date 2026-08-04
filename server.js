const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');
const webpush = require('web-push');
const { requiereLogin, requiereTerapeuta } = require('./middleware/auth');

webpush.setVapidDetails(
    'mailto:valeryariza2001@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===================== AUTENTICACION =====================

// POST - Registrar terapeuta (no necesita codigo de invitacion)
app.post('/api/auth/registro-terapeuta', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;

        const [existentes] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existentes.length > 0) {
            return res.status(400).json({ error: 'Ese email ya esta registrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
            [nombre, email, passwordHash, 'terapeuta']
        );

        const token = jwt.sign(
            { id: result.insertId, rol: 'terapeuta', nombre },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({ token, usuario: { id: result.insertId, nombre, rol: 'terapeuta' } });
    } catch (error) {
        console.error('ERROR en registro-terapeuta:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Registrar paciente (requiere codigo de invitacion valido)
app.post('/api/auth/registro-paciente', async (req, res) => {
    try {
        const { nombre, email, password, codigo_invitacion } = req.body;

        const [codigos] = await db.query(
            'SELECT * FROM codigos_invitacion WHERE codigo = ? AND usado = FALSE',
            [codigo_invitacion]
        );
        if (codigos.length === 0) {
            return res.status(400).json({ error: 'Codigo de invitacion invalido o ya usado' });
        }
        const codigoInfo = codigos[0];

        const [existentes] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existentes.length > 0) {
            return res.status(400).json({ error: 'Ese email ya esta registrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
            [nombre, email, passwordHash, 'paciente']
        );
        const pacienteId = result.insertId;

        // Marcar el codigo como usado y crear la vinculacion
        await db.query(
            'UPDATE codigos_invitacion SET usado = TRUE, paciente_id = ? WHERE id = ?',
            [pacienteId, codigoInfo.id]
        );
        await db.query(
            'INSERT INTO vinculaciones (paciente_id, terapeuta_id) VALUES (?, ?)',
            [pacienteId, codigoInfo.terapeuta_id]
        );

        const token = jwt.sign(
            { id: pacienteId, rol: 'paciente', nombre },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({ token, usuario: { id: pacienteId, nombre, rol: 'paciente' } });
    } catch (error) {
        console.error('ERROR en registro-paciente:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Iniciar sesion (para ambos roles)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (usuarios.length === 0) {
            return res.status(401).json({ error: 'Email o contrasena incorrectos' });
        }
        const usuario = usuarios[0];

        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Email o contrasena incorrectos' });
        }

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
    } catch (error) {
        console.error('ERROR en login:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== TERAPEUTA: CODIGOS Y PACIENTES =====================

// POST - El terapeuta genera un nuevo codigo de invitacion
app.post('/api/terapeuta/codigo-invitacion', requiereLogin, requiereTerapeuta, async (req, res) => {
    try {
        const codigo = crypto.randomBytes(4).toString('hex').toUpperCase(); // ej: A1B2C3D4
        await db.query(
            'INSERT INTO codigos_invitacion (terapeuta_id, codigo) VALUES (?, ?)',
            [req.usuario.id, codigo]
        );
        res.status(201).json({ codigo });
    } catch (error) {
        console.error('ERROR generando codigo:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - El terapeuta ve la lista de sus pacientes vinculados
app.get('/api/terapeuta/pacientes', requiereLogin, requiereTerapeuta, async (req, res) => {
    try {
        const [pacientes] = await db.query(
            `SELECT u.id, u.nombre, u.email
             FROM vinculaciones v
             JOIN usuarios u ON u.id = v.paciente_id
             WHERE v.terapeuta_id = ?`,
            [req.usuario.id]
        );
        res.json(pacientes);
    } catch (error) {
        console.error('ERROR listando pacientes:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - El terapeuta ve los recordatorios de un paciente especifico (solo si esta vinculado)
app.get('/api/terapeuta/pacientes/:pacienteId/recordatorios', requiereLogin, requiereTerapeuta, async (req, res) => {
    try {
        const { pacienteId } = req.params;

        const [vinculo] = await db.query(
            'SELECT id FROM vinculaciones WHERE terapeuta_id = ? AND paciente_id = ?',
            [req.usuario.id, pacienteId]
        );
        if (vinculo.length === 0) {
            return res.status(403).json({ error: 'Ese paciente no esta vinculado a vos' });
        }

        const [rows] = await db.query(
            'SELECT * FROM recordatorios WHERE usuario_id = ? ORDER BY fecha_hora ASC',
            [pacienteId]
        );
        res.json(rows);
    } catch (error) {
        console.error('ERROR obteniendo recordatorios del paciente:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== RECORDATORIOS (del usuario logueado) =====================

// GET - Obtener los recordatorios del usuario logueado
app.get('/api/recordatorios', requiereLogin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM recordatorios WHERE usuario_id = ? ORDER BY fecha_hora ASC',
            [req.usuario.id]
        );
        res.json(rows);
    } catch (error) {
        console.error('ERROR en GET /api/recordatorios:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Crear un recordatorio para el usuario logueado
app.post('/api/recordatorios', requiereLogin, async (req, res) => {
    try {
        const { titulo, descripcion, fecha_hora } = req.body;
        const fechaHoraSQL = new Date(fecha_hora);
        const [result] = await db.query(
            'INSERT INTO recordatorios (titulo, descripcion, fecha_hora, usuario_id) VALUES (?, ?, ?, ?)',
            [titulo, descripcion, fechaHoraSQL, req.usuario.id]
        );
        res.json({ id: result.insertId, titulo, descripcion, fecha_hora });
    } catch (error) {
        console.error('ERROR en POST /api/recordatorios:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT - Editar / marcar completado (solo si es dueno del recordatorio)
app.put('/api/recordatorios/:id', requiereLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, descripcion, fecha_hora, completado } = req.body;
        const fechaHoraSQL = new Date(fecha_hora);
        await db.query(
            'UPDATE recordatorios SET titulo=?, descripcion=?, fecha_hora=?, completado=? WHERE id=? AND usuario_id=?',
            [titulo, descripcion, fechaHoraSQL, completado, id, req.usuario.id]
        );
        res.json({ message: 'Actualizado correctamente' });
    } catch (error) {
        console.error('ERROR en PUT /api/recordatorios/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Borrar (solo si es dueno)
app.delete('/api/recordatorios/:id', requiereLogin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM recordatorios WHERE id=? AND usuario_id=?', [id, req.usuario.id]);
        res.json({ message: 'Eliminado correctamente' });
    } catch (error) {
        console.error('ERROR en DELETE /api/recordatorios/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== NOTIFICACIONES PUSH =====================

app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/suscripciones', requiereLogin, async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        await db.query(
            'INSERT INTO suscripciones (endpoint, p256dh, auth) VALUES (?, ?, ?)',
            [endpoint, keys.p256dh, keys.auth]
        );
        res.status(201).json({ message: 'Suscripcion guardada' });
    } catch (error) {
        console.error('ERROR en POST /api/suscripciones:', error);
        res.status(500).json({ error: error.message });
    }
});

async function enviarNotificacionATodos(payload) {
    const [suscripciones] = await db.query('SELECT * FROM suscripciones');

    for (const sub of suscripciones) {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        try {
            await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
        } catch (error) {
            await db.query('DELETE FROM suscripciones WHERE id = ?', [sub.id]);
        }
    }
}

setInterval(async () => {
    try {
        const [recordatorios] = await db.query(
            'SELECT * FROM recordatorios WHERE completado = FALSE'
        );
        const ahora = new Date();

        for (const r of recordatorios) {
            const fechaRecordatorio = new Date(r.fecha_hora);
            const diferencia = fechaRecordatorio - ahora;

            if (diferencia <= 0 && diferencia > -60000) {
                await enviarNotificacionATodos({
                    title: '⏰ Recordatorio',
                    body: r.titulo
                });
            }
        }
    } catch (error) {
        console.error('Error revisando recordatorios:', error);
    }
}, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});