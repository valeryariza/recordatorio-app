const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const db = require('./db');
const webpush = require('web-push');
const { requiereLogin, requiereTerapeuta } = require('./middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

webpush.setVapidDetails(
    'mailto:valeryariza2001@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Genera un codigo de 6 digitos y lo manda por email
async function enviarCodigoVerificacion(usuarioId, email, nombre) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiraEn = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await db.query(
        'INSERT INTO codigos_verificacion (usuario_id, codigo, expira_en) VALUES (?, ?, ?)',
        [usuarioId, codigo, expiraEn]
    );

    await resend.emails.send({
        from: 'Comfi <onboarding@resend.dev>',
        to: email,
        subject: 'Tu codigo de verificacion de Comfi',
        html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
                <h2>Hola ${nombre} 👋</h2>
                <p>Tu codigo de verificacion es:</p>
                <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
                <p>Este codigo vence en 15 minutos.</p>
            </div>
        `
    });
}

// ===================== AUTENTICACION =====================

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

        await enviarCodigoVerificacion(result.insertId, email, nombre);

        res.status(201).json({ usuarioId: result.insertId, email });
    } catch (error) {
        console.error('ERROR en registro-terapeuta:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/registro-paciente', async (req, res) => {
    try {
        const { nombre, email, password } = req.body;

        const [existentes] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existentes.length > 0) {
            return res.status(400).json({ error: 'Ese email ya esta registrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
            [nombre, email, passwordHash, 'paciente']
        );

        await enviarCodigoVerificacion(result.insertId, email, nombre);

        res.status(201).json({ usuarioId: result.insertId, email });
    } catch (error) {
        console.error('ERROR en registro-paciente:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/verificar-email', async (req, res) => {
    try {
        const { usuarioId, codigo } = req.body;

        const [codigos] = await db.query(
            `SELECT * FROM codigos_verificacion
             WHERE usuario_id = ? AND codigo = ? AND expira_en > NOW()
             ORDER BY id DESC LIMIT 1`,
            [usuarioId, codigo]
        );

        if (codigos.length === 0) {
            return res.status(400).json({ error: 'Codigo invalido o vencido' });
        }

        await db.query('UPDATE usuarios SET email_verificado = TRUE WHERE id = ?', [usuarioId]);

        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE id = ?', [usuarioId]);
        const usuario = usuarios[0];

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
    } catch (error) {
        console.error('ERROR en verificar-email:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/reenviar-codigo', async (req, res) => {
    try {
        const { usuarioId } = req.body;
        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE id = ?', [usuarioId]);
        if (usuarios.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const usuario = usuarios[0];
        await enviarCodigoVerificacion(usuario.id, usuario.email, usuario.nombre);
        res.json({ message: 'Codigo reenviado' });
    } catch (error) {
        console.error('ERROR en reenviar-codigo:', error);
        res.status(500).json({ error: error.message });
    }
});

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

        if (!usuario.email_verificado) {
            await enviarCodigoVerificacion(usuario.id, usuario.email, usuario.nombre);
            return res.status(403).json({
                error: 'Tu email todavia no esta verificado. Te reenviamos un codigo.',
                requiereVerificacion: true,
                usuarioId: usuario.id
            });
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

// ===================== PERFIL (vincular terapeuta despues del registro) =====================

app.post('/api/perfil/vincular-terapeuta', requiereLogin, async (req, res) => {
    try {
        if (req.usuario.rol !== 'paciente') {
            return res.status(403).json({ error: 'Solo pacientes pueden vincularse a un terapeuta' });
        }

        const { codigo } = req.body;
        const [codigos] = await db.query(
            'SELECT * FROM codigos_invitacion WHERE codigo = ? AND usado = FALSE',
            [codigo.trim().toUpperCase()]
        );
        if (codigos.length === 0) {
            return res.status(400).json({ error: 'Codigo invalido o ya usado' });
        }
        const codigoInfo = codigos[0];

        const [yaVinculado] = await db.query(
            'SELECT id FROM vinculaciones WHERE paciente_id = ? AND terapeuta_id = ?',
            [req.usuario.id, codigoInfo.terapeuta_id]
        );
        if (yaVinculado.length > 0) {
            return res.status(400).json({ error: 'Ya estas vinculado a ese terapeuta' });
        }

        await db.query(
            'UPDATE codigos_invitacion SET usado = TRUE, paciente_id = ? WHERE id = ?',
            [req.usuario.id, codigoInfo.id]
        );
        await db.query(
            'INSERT INTO vinculaciones (paciente_id, terapeuta_id) VALUES (?, ?)',
            [req.usuario.id, codigoInfo.terapeuta_id]
        );

        res.json({ message: 'Vinculacion exitosa' });
    } catch (error) {
        console.error('ERROR en vincular-terapeuta:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/perfil/mis-terapeutas', requiereLogin, async (req, res) => {
    try {
        const [terapeutas] = await db.query(
            `SELECT u.id, u.nombre, u.email
             FROM vinculaciones v
             JOIN usuarios u ON u.id = v.terapeuta_id
             WHERE v.paciente_id = ?`,
            [req.usuario.id]
        );
        res.json(terapeutas);
    } catch (error) {
        console.error('ERROR en mis-terapeutas:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== TERAPEUTA: CODIGOS Y PACIENTES =====================

app.post('/api/terapeuta/codigo-invitacion', requiereLogin, requiereTerapeuta, async (req, res) => {
    try {
        const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
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

// ===================== RECORDATORIOS =====================

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