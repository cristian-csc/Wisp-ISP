// CONFIGURACIÓN: reemplaza por el WhatsApp comercial real (código de país + número, sin + ni espacios).
const WHATSAPP_NUMBER = "51931090909";
const header = document.querySelector("#header");
const progress = document.querySelector("#progress");
const menu = document.querySelector("#nav");
const menuToggle = document.querySelector("#menuToggle");
function updateScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
  header.classList.toggle("scrolled", scrollY > 30);
}
addEventListener("scroll", updateScroll, { passive: true });
updateScroll();
menuToggle.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.textContent = open ? "✕" : "☰";
});
document.querySelectorAll("#nav a").forEach((a) =>
  a.addEventListener("click", () => {
    menu.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
  }),
);
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }),
  { threshold: 0.1 },
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
document.querySelectorAll("[data-plan]").forEach((link) =>
  link.addEventListener("click", () => {
    document.querySelector("#planSelect").value = link.dataset.plan;
  }),
);
document.querySelector("#year").textContent = new Date().getFullYear();
document.querySelector("#contactForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#name").value.trim();
  const zone = document.querySelector("#zone").value.trim();
  const plan = document.querySelector("#planSelect").value;
  const message = `Hola WISP, soy ${name}. Quisiera consultar la cobertura de fibra óptica en ${zone}. Me interesa: ${plan}. ¿Me pueden brindar información?`;
  if (!/^\d{9,15}$/.test(WHATSAPP_NUMBER)) {
    alert(
      "Antes de usar el formulario, configura WHATSAPP_NUMBER en script.js con tu número comercial.",
    );
    return;
  }
  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
});

// Carrusel automático: cambia cada 5 segundos; pausa al pasar el cursor o enfocar controles.
(() => {
  const root = document.querySelector(".hero");
  if (!root) return;
  const slides = [...root.querySelectorAll(".hero-slide")],
    messages = [...root.querySelectorAll(".hero-message")],
    dots = [...root.querySelectorAll(".carousel-dot")];
  let current = 0,
    timer;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function show(n) {
    current = (n + slides.length) % slides.length;
    slides.forEach((el, i) => {
      el.classList.toggle("active", i === current);
      el.setAttribute("aria-hidden", String(i !== current));
    });
    messages.forEach((el, i) => el.classList.toggle("active", i === current));
    dots.forEach((el, i) => {
      el.classList.toggle("active", i === current);
      el.setAttribute("aria-current", String(i === current));
    });
  }
  function stop() {
    clearInterval(timer);
  }
  function play() {
    stop();
    if (!reduced && !document.hidden)
      timer = setInterval(() => show(current + 1), 5000);
  }
  root.querySelector(".prev").addEventListener("click", () => {
    show(current - 1);
    play();
  });
  root.querySelector(".next").addEventListener("click", () => {
    show(current + 1);
    play();
  });
  dots.forEach((b, i) =>
    b.addEventListener("click", () => {
      show(i);
      play();
    }),
  );
  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", play);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) play();
  });
  document.addEventListener("visibilitychange", () =>
    document.hidden ? stop() : play(),
  );
  let x = null;
  root.addEventListener(
    "touchstart",
    (e) => {
      x = e.changedTouches[0].clientX;
    },
    { passive: true },
  );
  root.addEventListener(
    "touchend",
    (e) => {
      if (x === null) return;
      const dx = e.changedTouches[0].clientX - x;
      if (Math.abs(dx) > 55) {
        show(current + (dx < 0 ? 1 : -1));
        play();
      }
      x = null;
    },
    { passive: true },
  );
  play();
})();

// El acceso al sistema ya no vive aquí: el botón "Ingresar" del encabezado
// enlaza al login del panel React, en /app/login.
