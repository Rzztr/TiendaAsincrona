const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Paths
const dbPath = path.join(__dirname, 'users.json');
const productsPath = path.join(__dirname, 'products.json');
const publicPath = path.join(__dirname, 'public');


// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend/public')));  // para archivos estáticos (CSS, JS, etc)
app.use('/public', express.static(publicPath)); // acceso directo a imágenes

// Sesiones
app.use(session({
    secret: 'claveUltraSecreta',
    resave: false,
    saveUninitialized: false,
}));

// Inicializar archivo de usuarios si no existe
async function initializeDatabase() {
    try {
        await fs.access(dbPath);
    } catch {
        await fs.writeFile(dbPath, JSON.stringify([]));
    }
}

// Endpoint de productos (desde JSON si existe, si no desde array hardcodeado)
app.get('/api/products', async (req, res) => {
    try {
        const data = await fs.readFile(productsPath, 'utf8');
        const products = JSON.parse(data);
        res.json(products);
    } catch (error) {
        console.warn("No se pudo leer products.json, usando base de datos simulada");
        const fallbackProducts = [
            {id:1, nombre:'Laptop',precio:5000, image: '/public/images/laptop.jpeg'},
            {id:2, nombre:'Audifonos',precio:2000, image: '/public/images/audifonos.jpg'},
            {id:3, nombre:'Teclado',precio:1000, image: '/public/images/teclado.jpeg'},
            {id:4, nombre:'Mouse',precio:500, image: '/public/images/mouse.jpg'},
            {id:5, nombre: 'Mouse Pad', precio:600, image:'/public/images/mousepad.jpeg'},
            {id:6, nombre: 'Cable tipo C', precio:86, image:'/public/images/cableC.jpg'},
            {id:7, nombre: 'Pasta Termica', precio: 90, image:'/public/images/pastaTermica.jpg'},
            {id:8, nombre: 'Aire Comprimido', precio: 160, image:'/public/images/airecomprimido.jpg'},
            {id:9, nombre: 'Monitor 24"', precio:3200, image:'/public/images/monitor.png'},
            {id:10, nombre: 'Disco Duro 1TB', precio:950, image:'/public/images/hdd1tb.jpeg'},
            {id:11, nombre: 'Memoria RAM 8GB DDR4', precio:680, image:'/public/images/ram8.jpg'},
            {id:12, nombre: 'Fuente de Poder 600W', precio:1200, image:'/public/images/fuentepoder.jpeg'},
            {id:13, nombre: 'Tarjeta Gráfica GTX 1660', precio:4800, image:'/public/images/grafica.jpg'},
            {id:14, nombre: 'Cámara Web HD', precio:850, image:'/public/images/webcam.jpeg'},
            {id:15, nombre: 'Microfono USB', precio:720, image:'/public/images/micro.jpg'},
            {id:16, nombre: 'Router Wi-Fi 6', precio:1350, image:'/public/images/router.jpg'}
        ];
        res.json(fallbackProducts);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', 'index.html'));
  });
  

// Ruta de login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const data = await fs.readFile(dbPath, 'utf8');
        const users = JSON.parse(data);
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (user) {
            req.session.user = username;
            res.redirect('/dashboard');
        } else {
            res.redirect('/index.html?error=1');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
});

// Registro de usuario
app.post('/register', async (req, res) => {
    const { username, phone, email, password } = req.body;

    if (!username || !phone || !email || !password) {
        return res.status(400).send('Faltan datos del formulario');
    }

    try {
        const data = await fs.readFile(dbPath, 'utf8');
        const users = JSON.parse(data);

        const alreadyExists = users.some(u =>
            u.username === username || u.phone === phone || u.email === email
        );

        if (alreadyExists) {
            console.log("Credenciales ya en uso");
            return res.redirect('/registro.html?error=duplicado');
        }

        users.push({ username, phone, email, password });
        await fs.writeFile(dbPath, JSON.stringify(users, null, 2));

        res.redirect('/index.html?registered=1');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
});

// Dashboard protegido
app.get('/dashboard', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, '../frontend/public' ,'tienda.html'));
    } else {
        res.redirect('/index.html');
    }
});

// Página de registro (redirige si ya inició sesión)
app.get('/registro', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, '../frontend/public' ,'registro.html'));
    } else {
        res.redirect('/registro.html');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.send('Error cerrando sesión');
        res.redirect('/index.html');
    });
});

// Iniciar servidor
app.listen(PORT, async () => {
    try {
        await initializeDatabase();
        console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
    } catch (error) {
        console.error("Error al iniciar el servidor", error);
    }
});
