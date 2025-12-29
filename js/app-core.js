// app-core.js - Funciones compartidas y utilidades

// --- CONSTANTES ---
const URL_BONOS = "https://cumbriabienestar.es/wp-json/bonos/v1/listado/";
window.getBonoEndpoint = () => {
    const cacheBuster = `?_=${Date.now()}`;
    // Fallback to corsproxy.io as allorigins is flaky
    return `https://corsproxy.io/?${encodeURIComponent(URL_BONOS + cacheBuster)}`;
};

window.setupNavigation = function () {
    const burger = document.querySelector('.burger-menu');
    const nav = document.querySelector('.nav-links');
    if (burger && nav) {
        burger.addEventListener('click', () => {
            nav.classList.toggle('nav-active');
            burger.classList.toggle('toggle');
        });
    }
};

// --- NOTIFICACIONES (TOAST) ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// --- TEMA (OSCURO/CLARO) ---
function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // Actualizar icono si existe
    const icon = document.querySelector(".theme-toggle i");
    if (icon) {
        icon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}

// Aplicar tema al cargar
function applyTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        const icon = document.querySelector(".theme-toggle i");
        if (icon) icon.className = "fas fa-sun";
    }
}

// --- UTILIDADES DE FECHA/FORMATO ---
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Inicialización básica
document.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    // Setup theme toggles
    document.querySelectorAll(".theme-toggle").forEach(btn => {
        btn.addEventListener("click", toggleTheme);
    });
});
