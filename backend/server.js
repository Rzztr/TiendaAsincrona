const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors')
const session = require('express-session');
const { Console } = require('console');
const productsPath = path.join(__dirname, 'products.json');
const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Por si mandas datos desde forms
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use(cors());

//endpoint api
app.get('/api/products', (req, res) =>{
    //res.json(products);
    try {
        const data = fs.readFile(productsPath, 'utf8');
        const products = JSON.parse(data);
        res.json(products);
    } catch (error) {
        res.status(500).json({error: 'error al leer la abse de datos'})
    }
});

// Sesiones
app.use(session({
    secret: 'claveUltraSecreta', // Cámbiala en producción
    resave: false,
    saveUninitialized: false,
}));

// Path a la base de datos JSON
const dbPath = path.join(__dirname, 'users.json');

// Inicializar archivo si no existe
async function initializeDatabase() {
    try {
        await fs.access(dbPath);
    } catch {
        await fs.writeFile(dbPath, JSON.stringify([]));
    }
}

// Ruta de login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const data = await fs.readFile(dbPath, 'utf8');
        const users = JSON.parse(data);
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (user) {
            req.session.user = username; // Guarda usuario en sesión
            res.redirect('/dashboard');  // Redirecciona si el login fue correcto
        } else {
            res.redirect('/index.html?error=1'); // Redirige con error si falla
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

        // Validar duplicados por username, teléfono o correo
        const alreadyExists = users.some(u =>
            u.username === username || u.phone === phone || u.email === email
        );

        if (alreadyExists) {
            console.log("Credenciales ya en uso");
            return res.redirect('/registro.html?error=duplicado');
        }

        // Agregar nuevo usuario
        users.push({ username, phone, email, password });
        await fs.writeFile(dbPath, JSON.stringify(users, null, 2));

        res.redirect('/index.html?registered=1');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
});


// Ruta protegida
app.get('/dashboard', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'loginSuccesful.html'));
    } else {
        res.redirect('/index.html');
    }
});

app.get('/registro', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'registro.html'));
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
app.listen(port, async () => {

    try {
        await initializeDatabase();
        console.log(`Servidor corriendo en http://localhost:${port}`);
    } catch (error) {
        console.log("Error al inciar", error)
    }
});
