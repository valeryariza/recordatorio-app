const express = require('express');
const cors = require('cors');
const db = require('./db');

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
        res.status(500).json({ error: error.message });
    }
});

// POST - Crear un recordatorio
app.post('/api/recordatorios', async (req, res) => {
    try {
        const { titulo, descripcion, fecha_hora } = req.body;
        const [result] = await db.query(
            'INSERT INTO recordatorios (titulo, descripcion, fecha_hora) VALUES (?, ?, ?)',
            [titulo, descripcion, fecha_hora]
        );
        res.json({ id: result.insertId, titulo, descripcion, fecha_hora });
    } catch (error) {
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
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});