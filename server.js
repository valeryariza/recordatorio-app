const express = require('express');
const cors = require('cors');
const db = require('./db');
const webpush = require('web-push');

webpush.setVapidDetails(
    'mailto:valeryariza2001@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// GET - Obtener todos los recordatorios
app.get('/api/recordatorios', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM recordatorios ORDER BY fecha_hora ASC');
        res.json(rows);
    } catch (error) {
        console.error('ERROR en GET /api/recordatorios:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST - Crear un recordatorio
app.post('/api/recordatorios', async (req, res) => {
    try {
        const { titulo, descripcion, fecha_hora } = req.body;
        console.log('POST recibido:', { titulo, descripcion, fecha_hora });
        const [result] = await db.query(
            'INSERT INTO recordatorios (titulo, descripcion, fecha_hora) VALUES (?, ?, ?)',
            [titulo, descripcion, fecha_hora]
        );
        res.json({ id: result.insertId, titulo, descripcion, fecha_hora });
    } catch (error) {
        console.error('ERROR en POST /api/recordatorios:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT - Marcar como completado / editar
app.put('/api/recordatorios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { titulo, descripcion, fecha_hora, completado } = req.body;
        await db.query(
            'UPDATE recordatorios SET titulo=?, descripcion=?, fecha_hora=?, completado=? WHERE id=?',
            [titulo, descripcion, fecha_hora, completado, id]
        );
        res.json({ message: 'Actualizado correctamente' });
    } catch (error) {
        console.error('ERROR en PUT /api/recordatorios/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE - Borrar un recordatorio
app.delete('/api/recordatorios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM recordatorios WHERE id=?', [id]);
        res.json({ message: 'Eliminado correctamente' });
    } catch (error) {
        console.error('ERROR en DELETE /api/recordatorios/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET - Obtener la clave pública VAPID (el frontend la necesita)
app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST - Guardar una nueva suscripción push
app.post('/api/suscripciones', async (req, res) => {
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

// Función para enviar notificaciones push a todos los suscritos
async function enviarNotificacionATodos(payload) {
    const [suscripciones] = await db.query('SELECT * FROM suscripciones');
    console.log(`Intentando enviar push a ${suscripciones.length} suscripciones`);

    for (const sub of suscripciones) {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        try {
            await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
            console.log(`Push enviado correctamente a suscripcion ${sub.id}`);
        } catch (error) {
            console.log(`ERROR enviando push a suscripcion ${sub.id}:`, error.message, error.statusCode);
            await db.query('DELETE FROM suscripciones WHERE id = ?', [sub.id]);
        }
    }
}

// Revisar recordatorios cada 30 segundos y enviar push si corresponde
setInterval(async () => {
    try {
        console.log('Revisando recordatorios...', new Date().toISOString());
        const [recordatorios] = await db.query(
            'SELECT * FROM recordatorios WHERE completado = FALSE'
        );
        const ahora = new Date();

        for (const r of recordatorios) {
            const fechaRecordatorio = new Date(r.fecha_hora);
            const diferencia = fechaRecordatorio - ahora;

            // Si está entre 0 y 60 segundos de diferencia (recién llegó la hora)
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