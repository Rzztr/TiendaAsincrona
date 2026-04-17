const API_URL = 'http://localhost:3000/api/products';
const productsContainer = document.getElementById('products');
const carritoContainer = document.getElementById('carrito');
const totalDisplay = document.getElementById('total');

let carrito = [];

async function loadProducts() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Error getting the products');

        const products = await response.json();
        showProducts(products);
    } catch (error) {
        productsContainer.innerHTML = 
        '<p class="text-danger">Error al cargar productos</p>';
        console.error(error);
    }
}

function showProducts(products) {
    productsContainer.innerHTML = '';

    products.forEach(product => {
        const div = document.createElement('div');
        div.className = 'col-md-3 mb-3';
        div.innerHTML = `
        <div class="card h-100">
            <img src="http://localhost:3000${product.image}"
                 class="card-img-top img-fluid"
                 style="height: 200px; object-fit: cover;"
                 alt="${product.nombre}">
            <div class="card-body">
                <h5 class="card-title">${product.nombre}</h5>
                <p class="card-text">$${product.precio.toFixed(2)}</p>
                <button class="btn btn-success" onclick="agregarAlCarrito(${product.id}, '${product.nombre}', ${product.precio})">Agregar al carrito</button>
            </div>
        </div>`;
        productsContainer.appendChild(div);
    });
}

function agregarAlCarrito(id, nombre, precio) {
    const index = carrito.findIndex(item => item.id === id);

    if (index !== -1) {
        carrito[index].cantidad += 1;
    } else {
        carrito.push({ id, nombre, precio, cantidad: 1 });
    }

    actualizarCarrito();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    actualizarCarrito();
}

function actualizarCarrito() {
    carritoContainer.innerHTML = '';
    let total = 0;

    carrito.forEach((item, index) => {
        const subtotal = item.precio * item.cantidad;
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <div>
                ${item.nombre} (${item.cantidad}) = $${subtotal.toFixed(2)}
            </div>
            <button class="btn btn-danger btn-sm" onclick="eliminarDelCarrito(${index})">Eliminar</button>
        `;
        carritoContainer.appendChild(li);
        total += subtotal;
    });

    totalDisplay.textContent = `$${total.toFixed(2)}`;
}

loadProducts();

// Variable para almacenar el usuario actual en recuperación
let currentUser = '';
        
// Manejar envío del formulario de recuperación
document.getElementById('recovery-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const method = document.querySelector('input[name="method"]:checked').value;
    
    try {
        const response = await fetch('/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, method })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Mostrar sección OTP
            document.getElementById('otp-section').style.display = 'block';
            currentUser = username;
            alert(result.message + ' Revisa la consola del navegador para ver el código.');
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
});
