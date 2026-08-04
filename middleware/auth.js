const jwt = require('jsonwebtoken');

// Verifica que la persona esté logueada (cualquier rol)
function requiereLogin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ error: 'No se envio token de autenticacion' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = payload; // { id, rol, nombre }
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token invalido o expirado' });
    }
}

// Verifica que ademas sea terapeuta
function requiereTerapeuta(req, res, next) {
    if (req.usuario.rol !== 'terapeuta') {
        return res.status(403).json({ error: 'Solo terapeutas pueden acceder a esto' });
    }
    next();
}

module.exports = { requiereLogin, requiereTerapeuta };