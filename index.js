const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Variables de entorno e identificación de la instancia (para balanceo de carga)
const PORT = process.env.PORT || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'Backend-Instancia-1';

// Configuración de la conexión a PostgreSQL (Nodo 4)
const pool = new Pool({
  host: process.env.DB_HOST || '192.168.1.14',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'florisys_user',
  password: process.env.DB_PASSWORD || 'florisys_pass',
  database: process.env.DB_NAME || 'florisys_db',
  connectionTimeoutMillis: 1500
});

// URL de referencia para imágenes en File Server (Nodo 5)
const FILE_SERVER_URL = process.env.FILE_SERVER_URL || 'http://192.168.1.15:8080';

// ENDPOINTS NODO 3 - FLORISYS API

// 1. Health Check (Verificación V1 / Observabilidad)
app.get('/api/health', async (req, res) => {
  let dbStatus = 'Disconnected';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'Connected';
  } catch (err) {
    dbStatus = `Offline (${err.code || 'ECONNREFUSED'})`;
  }

  res.status(200).json({
    status: 'OK',
    node: 'Nodo 3 - Backend API',
    instance: INSTANCE_NAME,
    port: PORT,
    database_status: dbStatus,
    timestamp: new Date()
  });
});

// 2. RF-01: Autenticación / Login
app.post('/api/login', async (req, res) => {
  const { correo, contraseña } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
    if (result.rows.length === 0) {
      return res.status(401).json({ servedBy: INSTANCE_NAME, error: 'Credenciales inválidas' });
    }
    return res.json({ servedBy: INSTANCE_NAME, token: 'token-jwt-simulado', usuario: result.rows[0] });
  } catch (error) {
    // Modo autónomo (BD Offline)
    return res.json({
      servedBy: INSTANCE_NAME,
      mode: 'standalone',
      message: 'Login simulado exitoso',
      token: 'mock-jwt-token-node3',
      usuario: { id: 1, correo, rol: 'admin' }
    });
  }
});

// 3. RF-03 / RF-04: Consultar Catálogo y Productos
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos WHERE estado = true');
    const productos = result.rows.map(prod => ({
      ...prod,
      imagen_url: prod.imagen ? `${FILE_SERVER_URL}/uploads/${prod.imagen}` : null
    }));
    return res.json({ servedBy: INSTANCE_NAME, source: 'PostgreSQL', data: productos });
  } catch (error) {
    // Datos por defecto para pruebas del Nodo 3
    return res.json({
      servedBy: INSTANCE_NAME,
      source: 'Nodo 3 Mock',
      data: [
        { id: 1, categoria_id: 1, nombre: 'Ramo de 12 Rosas Rojas', precio: 25.00, stock: 10, imagen_url: `${FILE_SERVER_URL}/uploads/rosas.jpg` },
        { id: 2, categoria_id: 2, nombre: 'Arreglo de Girasoles', precio: 30.00, stock: 5, imagen_url: `${FILE_SERVER_URL}/uploads/girasoles.jpg` }
      ]
    });
  }
});

// 4. RF-05: Inventario
app.get('/api/inventario', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, stock FROM productos');
    return res.json({ servedBy: INSTANCE_NAME, data: result.rows });
  } catch (error) {
    return res.json({
      servedBy: INSTANCE_NAME,
      source: 'Nodo 3 Mock',
      data: [
        { id: 1, nombre: 'Rosas Rojas', stock: 10 },
        { id: 2, nombre: 'Girasoles', stock: 5 }
      ]
    });
  }
});

// 5. RF-07: Crear Pedido
app.post('/api/pedidos', async (req, res) => {
  const { cliente_id, total, direccion_entrega } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO pedidos (cliente_id, total, direccion_entrega, estado) VALUES ($1, $2, $3, $4) RETURNING id',
      [cliente_id, total, direccion_entrega, 'recibido']
    );
    return res.status(201).json({ servedBy: INSTANCE_NAME, message: 'Pedido registrado', pedido_id: result.rows[0].id });
  } catch (error) {
    return res.status(201).json({
      servedBy: INSTANCE_NAME,
      mode: 'standalone',
      message: 'Pedido procesado localmente por el Nodo 3',
      pedido_id: Math.floor(Math.random() * 1000) + 1
    });
  }
});

// 6. RF-08: Actualizar Estado del Pedido
app.put('/api/pedidos/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, id]);
    return res.json({ servedBy: INSTANCE_NAME, message: `Pedido ${id} actualizado a ${estado}` });
  } catch (error) {
    return res.json({ servedBy: INSTANCE_NAME, mode: 'standalone', message: `Estado de pedido ${id} cambiado a ${estado}` });
  }
});

// 7. RF-09 / RF-11: Entregas (Consumo de App Móvil)
app.get('/api/entregas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM entregas');
    return res.json({ servedBy: INSTANCE_NAME, data: result.rows });
  } catch (error) {
    return res.json({
      servedBy: INSTANCE_NAME,
      source: 'Nodo 3 Mock',
      data: [
        { id: 1, pedido_id: 101, direccion: 'Av. 4 de Noviembre, Manta', estado: 'asignado' },
        { id: 2, pedido_id: 102, direccion: 'Barrio Murciélago, Manta', estado: 'en_camino' }
      ]
    });
  }
});

// Escuchar en 0.0.0.0 (Acceso externo habilitado)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${INSTANCE_NAME}] Servidor Nodo 3 listo en puerto ${PORT}`);
});