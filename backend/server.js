const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');

const activeSessions = new Map();
const optCode = new Map();
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

function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        // Distinguir entre acceso directo por URL vs redirección normal
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

// Sesiones
app.use(session({
    secret: 'claveUltraSecreta',
    resave: false,
    saveUninitialized: false,
}));
//controlar sesiones por usuario
function chechMultiSessions(req, res, next){
    const username = req.body.username;
    const sessionID = req.sessionID;

    //checar si ya hay una sesion activa
    if (activeSessions.has(username)) {
        const existingSessionID = activeSessions.get(username);

        //cerrar sesion activa o anterior 
        req.sessionStore.destroy(existingSessionID, (error)=>{
            if(error) console.log('error manejando sesiones: ', error);
        });
    }

    //nueva session
    activeSessions.set(username, sessionID);
    next();
}


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
        console.warn("No se pudo leer products.json");
        res.json(fallbackProducts);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', 'index.html'));
  });

app.get('/recuperarContrasenia', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public', 'forgot-password.html'));
});
  

// Ruta de login
app.post('/login', chechMultiSessions,  async (req, res) => {
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
app.get('/dashboard', requireAuth, (req, res) => {
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
    const username = req.session.user;
    
    req.session.destroy(err => {
        if (err) return res.send('Error cerrando sesión');
        
        // Remover de sesiones activas
        if (username) {
            activeSessions.delete(username);
        }
        
        res.redirect('/index.html?logout=success');
    });
});

//logica de recupoerar contraseñas

// Almacenar códigos OTP temporales
const otpCodes = new Map(); // {username: {code: '123456', method: 'email', expires: timestamp}}

// Generar código OTP aleatorio
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Ruta para solicitar recuperación
app.post('/forgot-password', async (req, res) => {
    const { username, method } = req.body;
    
    try {
        const data = await fs.readFile(dbPath, 'utf8');
        const users = JSON.parse(data);
        const user = users.find(u => u.username === username || u.email === username);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const otpCode = generateOTP();
        const expires = Date.now() + 300000; // 5 minutos
        
        // Guardar OTP
        otpCodes.set(username, { code: otpCode, method, expires });
        
        // Simular envío según método
        switch(method) {
            case 'email':
                console.log(`📧 CORREO SIMULADO para ${user.email}:`);
                console.log(`Enlace de recuperación: http://localhost:3000/reset-password?token=${otpCode}&user=${username}`);
                break;
            case 'sms':
                console.log(`📱 SMS SIMULADO al ${user.phone}:`);
                console.log(`Su código OTP es: ${otpCode}`);
                break;
            case 'call':
                console.log(`📞 LLAMADA SIMULADA al ${user.phone}:`);
                console.log(`Llamada enviada con código OTP: ${otpCode}`);
                break;
        }
        
        res.json({ success: true, message: 'Código enviado. Revisa la consola.' });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Ruta para validar OTP y cambiar contraseña
app.post('/reset-password', async (req, res) => {
    const { username, otpCode, newPassword } = req.body;
    
    const storedOTP = otpCodes.get(username);
    
    if (!storedOTP) {
        return res.status(400).json({ error: 'No hay solicitud de recuperación activa' });
    }
    
    if (storedOTP.expires < Date.now()) {
        otpCodes.delete(username);
        return res.status(400).json({ error: 'Código expirado' });
    }
    
    if (storedOTP.code !== otpCode) {
        return res.status(400).json({ error: 'Código incorrecto' });
    }
    
    try {
        // Actualizar contraseña en la base de datos
        const data = await fs.readFile(dbPath, 'utf8');
        const users = JSON.parse(data);
        const userIndex = users.findIndex(u => u.username === username);
        
        if (userIndex !== -1) {
            users[userIndex].password = newPassword;
            await fs.writeFile(dbPath, JSON.stringify(users, null, 2));
            
            // Limpiar OTP usado
            otpCodes.delete(username);
            
            res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
        } else {
            res.status(404).json({ error: 'Usuario no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Iniciar servidor
app.listen(PORT, async () => {
    try {
        await initializeDatabase();
        console.log(`Servidor corriendo en: http://localhost:${PORT}`);
    } catch (error) {
        console.error("Error al iniciar el servidor", error);
    }
});
