const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs'); // Para leer certificados SSL de forma síncrona
const path = require('path');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');

const activeSessions = new Map();
const otpCodes = new Map(); // Movido desde el final del archivo
const app = express();
const PORT = 3000;
const HTTPS_PORT = 443;

// Paths
const dbPathUsers = path.join(__dirname, 'users.json');
const dbPathAdmins = path.join(__dirname, 'admins.json');
const productsPath = path.join(__dirname, 'products.json');
const publicPath = path.join(__dirname, 'public');
const certPath = path.join(__dirname, 'cert');

// Middleware de sesión DEBE ir ANTES de las rutas
app.use(session({
    secret: 'claveUltraSecreta',
    resave: false,
    saveUninitialized: false,
}));

// Otros middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/public', express.static(publicPath));

// Función de autenticación
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        if (req.headers.referer) {
            res.redirect('/index.html?error=session_required');
        } else {
            res.status(401).send(`
                <html>
                <body>
                    <h1>Acceso Denegado</h1>
                    <p>Debes iniciar sesión para acceder a esta página.</p>
                    <a href="/index.html">Ir al Login</a>
                </body>
                </html>
            `);
        }
    }
}

// Controlar sesiones por usuario
function checkMultiSessions(req, res, next) {
    const username = req.body.username;
    const sessionID = req.sessionID;

    // Checar si ya hay una sesión activa
    if (activeSessions.has(username)) {
        const existingSessionID = activeSessions.get(username);

        // Cerrar sesión activa o anterior 
        req.sessionStore.destroy(existingSessionID, (error) => {
            if (error) console.log('Error manejando sesiones: ', error);
        });
    }

    // Nueva sesión
    activeSessions.set(username, sessionID);
    next();
}

// Inicializar archivo de usuarios si no existe
async function initializeDatabase() {
    try {
        await fs.access(dbPathUsers);
    } catch {
        await fs.writeFile(dbPathUsers, JSON.stringify([]));
    }
    
    try {
        await fs.access(dbPathAdmins);
    } catch {
        await fs.writeFile(dbPathAdmins, JSON.stringify([]));
    }
}

// Generar código OTP aleatorio
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// RUTAS

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', 'index.html'));
});

app.get('/recuperarContrasenia', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', 'forgot-password.html'));
});

// Endpoint de productos
app.get('/api/products', async (req, res) => {
    try {
        const data = await fs.readFile(productsPath, 'utf8');
        const products = JSON.parse(data);
        res.json(products);
    } catch (error) {
        console.warn("No se pudo leer products.json");
        res.json([]);
    }
});

// Ruta de login
app.post('/login', checkMultiSessions, async (req, res) => {
    const { username, password } = req.body;

    // Si no existe el contador en la sesión, inicialízalo
    if (!req.session.failedAttempts) {
        req.session.failedAttempts = 0;
    }

    try {
        // Leer usuarios normales
        const dataUsers = await fs.readFile(dbPathUsers, 'utf8');
        const users = JSON.parse(dataUsers);
        
        // Leer admins
        const dataAdmins = await fs.readFile(dbPathAdmins, 'utf8');
        const admins = JSON.parse(dataAdmins);
        
        // Buscar en usuarios normales
        let user = users.find(u => u.username === username && u.password === password);
        let isAdmin = false;
        
        // Si no se encuentra en usuarios, buscar en admins
        if (!user) {
            user = admins.find(u => u.username === username && u.password === password);
            if (user) {
                isAdmin = true;
            }
        }
        
        if (user) {
            // Reinicia el contador de intentos fallidos
            req.session.failedAttempts = 0;
            req.session.user = username;
            req.session.isAdmin = isAdmin;
            req.session.userRole = user.role;

            if (isAdmin) {
                res.redirect('/dashboard');
            } else {
                res.redirect('/tienda');
            }
        } else {
            req.session.failedAttempts += 1;

            // Si ya falló 3 veces
            if (req.session.failedAttempts >= 3) {
                req.session.failedAttempts = 0;
                return res.redirect('/failLogin.html');
            }

            res.redirect('/index.html?error=1');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
});

// Registro de usuario
app.post('/register', async (req, res) => {
    const { username, phone, email, password, role } = req.body;

    if (!username || !phone || !email || !password || !role) {
        return res.status(400).send('Faltan datos del formulario');
    }

    try {
        const data = await fs.readFile(dbPathUsers, 'utf8');
        const users = JSON.parse(data);

        const alreadyExists = users.some(u =>
            u.username === username || u.phone === phone || u.email === email
        );

        if (alreadyExists) {
            console.log("Credenciales ya en uso");
            return res.redirect('/registro.html?error=duplicado');
        }

        users.push({ username, phone, email, password, role });
        await fs.writeFile(dbPathUsers, JSON.stringify(users, null, 2));

        res.redirect('/index.html?registered=1');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
});

// Registro de admin
app.post('/registerAdmin', requireAuth, async (req, res) => {
    const { username, phone, email, password, role } = req.body;
    
    if (!req.session.user) {
        return res.redirect('/');
    }

    try {
        const dataAdmins = await fs.readFile(dbPathAdmins, 'utf8');
        const admins = JSON.parse(dataAdmins);
        
        const isAdmin = admins.some(admin => 
            admin.username === req.session.user || 
            admin.email === req.session.user
        );

        if (!isAdmin) {
            console.log("Usuario no autorizado para registrar admins");
            return res.status(403).send('No tienes permisos para acceder a esta sección');
        }

        if (!username || !phone || !email || !password || !role) {
            return res.status(400).send('Faltan datos del formulario');
        }

        const alreadyExists = admins.some(u =>
            u.username === username || u.phone === phone || u.email === email
        );

        if (alreadyExists) {
            console.log("Credenciales ya en uso");
            return res.redirect('/registro.html?error=duplicado');
        }

        admins.push({ username, phone, email, password, role });
        await fs.writeFile(dbPathAdmins, JSON.stringify(admins, null, 2));
        
        res.redirect('/dashboard.html?registered=1');
        
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
});

// Tienda protegida
app.get('/tienda', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', 'tienda.html'));
});

// Dashboard protegido (solo para admins)
app.get('/dashboard', requireAuth, (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/tienda');
    }
    res.sendFile(path.join(__dirname, '../frontend/public', 'dashboard.html'));
});

// Página de registro
app.get('/registro', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, '../frontend/public', 'registro.html'));
    } else {
        res.redirect('/registro.html');
    }
});

// Logout
app.get('/logout', (req, res) => {
    const username = req.session.user;
    
    req.session.destroy(err => {
        if (err) return res.send('Error cerrando sesión');
        
        if (username) {
            activeSessions.delete(username);
        }
        
        res.redirect('/index.html?logout=success');
    });
});

// Iniciar servidor
app.listen(PORT, async () => {
    try {
        await initializeDatabase();
        console.log(`Servidor HTTP corriendo en: http://localhost:${PORT}`);
    } catch (error) {
        console.error("Error al iniciar el servidor HTTP", error);
    }
});

// Iniciar servidor HTTPS (solo si existen los certificados)
function startHTTPSServer() {
    try {
        // Verificar si existen los archivos de certificados
        const keyPath = path.join(certPath, 'server.key');
        const certFilePath = path.join(certPath, 'server.crt');
        const caPath = path.join(certPath, 'ca_bundle.crt');

        // Verificar que al menos key y cert existan
        if (fsSync.existsSync(keyPath) && fsSync.existsSync(certFilePath)) {
            const sslOptions = {
                key: fsSync.readFileSync(keyPath),
                cert: fsSync.readFileSync(certFilePath)
            };

            // Agregar CA bundle si existe (opcional)
            if (fsSync.existsSync(caPath)) {
                sslOptions.ca = fsSync.readFileSync(caPath);
            }

            // Crear servidor HTTPS
            https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
                console.log(`Servidor HTTPS corriendo en: https://localhost:${HTTPS_PORT}`);
            });

            // Opcional: Redirigir HTTP a HTTPS
            http.createServer((req, res) => {
                res.writeHead(301, { "Location": `https://${req.headers.host}${req.url}` });
                res.end();
            }).listen(80, () => {
                console.log('Redirección HTTP → HTTPS activada en puerto 80');
            });

        } else {
            console.log("Mamaste bo jajajaj")
        }
    } catch (error) {
        console.error('Error al iniciar servidor HTTPS:', error.message);
        console.log('Continuando solo con servidor HTTP');
    }
}

// Iniciar servidor HTTPS
startHTTPSServer();