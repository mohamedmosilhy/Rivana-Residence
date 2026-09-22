const page = document.body.dataset.page || 'home';

const icon = (name) => ({
  menu: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.6 8.6 0 0 1-4-1L3 20l1.1-3.3A8.4 8.4 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 1h2a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L7 8.6a16 16 0 0 0 6 6l1.1-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2.1z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.6 8.6 0 0 1-4-1L3 20l1.1-3.3A8.4 8.4 0 0 1 3 11.5 8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z"/><path d="M9 10.5c.3 1.7 2.3 3.7 4 4" stroke-width="1.6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14 9h3V5.5h-3C11.8 5.5 10 7.3 10 9.5V12H8v3h2v6h3v-6h3l1-3h-4V9.5c0-.3.2-.5.5-.5H14z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14 3h2.2c.2 1.7 1.4 3 3.3 3.3v2.3c-1.3 0-2.5-.4-3.5-1.1v6.6a5 5 0 1 1-5-5c.2 0 .4 0 .6.1v2.3a2.7 2.7 0 1 0 2.4 2.7V3z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="3"/><polygon points="10.5 9.5 15.5 12 10.5 14.5" fill="currentColor" stroke="none"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="3" y="9" width="3.2" height="11" /><circle cx="4.6" cy="5" r="1.9"/><path d="M10 9h3v1.6C13.6 9.6 14.8 9 16.2 9c2.6 0 4.3 1.7 4.3 5.2V20h-3.2v-5.4c0-1.4-.5-2.4-1.8-2.4-1 0-1.6.7-1.9 1.3-.1.2-.1.6-.1 1V20H10V9z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 3h4.3l4 5.6L17.2 3H21l-6.6 7.7L21.4 21h-4.3l-4.4-6.1L7.4 21H3.6l7-8.2L4 3z"/></svg>',
  threads: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M16 8.4c-.7-1.6-2.2-2.5-4-2.5-3.2 0-5 2.5-5 6.1s1.8 6.1 5 6.1c2.6 0 4.2-1.5 4.2-3.3 0-1.9-1.6-2.9-3.6-2.9-1.5 0-2.5.7-2.5 1.7s.8 1.4 1.6 1.4c1.4 0 2.2-1.1 2.2-3.1"/></svg>',
}[name] || '');

const roomLink = (slug) => `room-${slug}.html`;
const byTitle = [...ROOMS].sort((x, y) => x.title.localeCompare(y.title));
const tel = SITE.phone.replace(/[^+\d]/g, '');
const capacity = (r) => `${r.adults} Adults ${r.children} ${r.children === 1 ? 'Child' : 'Children'}`;

// Reusable room card templates, keyed by the data-room-cards value in the page markup.
const roomCards = {
  carousel: (r) => `<article class="room-card"><a class="room-card__image" href="${roomLink(r.slug)}"><img src="${r.image}" alt="${r.title}" loading="lazy"></a><div class="room-card__body"><div><h3><a href="${roomLink(r.slug)}">${r.title}</a></h3><p>${r.size} m2 / ${r.adults} adults ${r.children} children</p></div><p class="room-card__price">from <strong>$${r.price}</strong></p></div></article>`,
  list: (r, i) => `<article class="room-list-card reveal reveal--d${i + 1}"><a class="room-list-card__image" href="${roomLink(r.slug)}"><img src="${r.image}" alt="${r.title}" loading="lazy"></a><h2><a href="${roomLink(r.slug)}">${r.title}</a></h2><div class="room-stats"><div class="room-stat"><strong>${r.size}</strong><span>Size<br>M2</span></div><div class="room-stat"><strong>${r.adults}</strong><span>Max<br>adults</span></div><div class="room-stat"><strong>${r.children}</strong><span>Max<br>children</span></div></div><p class="room-list-card__link"><a href="${roomLink(r.slug)}">Book Now From <span>$${r.price}</span></a></p></article>`,
};
document.querySelectorAll('[data-room-cards]').forEach((el) => { el.innerHTML = ROOMS.map(roomCards[el.dataset.roomCards]).join(''); });

const headerTemplate = () => `
  <div class="mobile-menu__backdrop" data-menu-close></div>
  <aside class="mobile-menu" aria-label="Mobile navigation">
    <nav class="mobile-menu__links">
      <a href="index.html">Home</a><a href="rooms.html">Our Rooms</a><a href="about.html">About</a>
      <a href="swimming-pool.html">Swimming Pool</a><a href="gym.html">Gym</a><a href="contact.html">Contact</a>
    </nav>
  </aside>
  <header class="site-header" data-header>
    <div class="header-inner">
      <nav class="primary-nav" aria-label="Primary">
        <a class="nav-link ${page === 'home' ? 'is-active' : ''}" href="index.html">Home</a>
        <div class="nav-dropdown">
          <a class="nav-link ${page === 'rooms' || page === 'room' ? 'is-active' : ''}" href="rooms.html">Our Rooms <span class="chevron">⌄</span></a>
          <div class="subnav">
            ${byTitle.map((r) => `<a href="${roomLink(r.slug)}">${r.title}</a>`).join('')}
          </div>
        </div>
        <a class="nav-link ${page === 'about' ? 'is-active' : ''}" href="about.html">About</a>
      </nav>
      <a class="brand" href="index.html" aria-label="${SITE.name} home"><img src="${SITE.logo}" alt="${SITE.name}"></a>
      <nav class="primary-nav primary-nav--right" aria-label="Secondary">
        <a class="nav-link ${page === 'pool' ? 'is-active' : ''}" href="swimming-pool.html">Swimming Pool</a>
        <a class="nav-link ${page === 'gym' ? 'is-active' : ''}" href="gym.html">Gym</a>
        <a class="nav-link ${page === 'contact' ? 'is-active' : ''}" href="contact.html">Contact</a>
      </nav>
      <button class="menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu"><span class="sr-only">Open menu</span>${icon('menu')}</button>
    </div>
  </header>`;

const footerTemplate = () => `
  <footer class="site-footer wave-edge wave-edge--top">
    <div class="container footer-main">
      <section class="footer-brand"><a href="index.html"><img src="${SITE.logo}" alt="${SITE.name}"></a>
        <div class="footer-contact"><a href="tel:${tel}">${SITE.phone}</a><a href="mailto:${SITE.email}">${SITE.email}</a><address>${SITE.address}</address></div>
      </section>
      <section><h2 class="footer-heading">Our Rooms</h2><ul class="footer-links footer-links--large">${ROOMS.map((r) => `<li><a href="${roomLink(r.slug)}">${r.shortTitle}</a></li>`).join('')}</ul></section>
      <section><h2 class="footer-heading">Other Links</h2><ul class="footer-links"><li><a href="index.html">Home</a></li><li><a href="about.html">About Us</a></li><li><a href="contact.html">Contact Us</a></li></ul><div class="social-links" aria-label="Social links">${Object.entries(SITE.social).map(([name, url]) => `<a href=\"${url}\" aria-label=\"${name}\">${icon(name)}</a>`).join('')}</div></section>
    </div>
    <div class="footer-legal"><div class="container footer-legal__inner"><p>${SITE.copyright}</p><p><a href="#">Terms &amp; Conditions</a><a href="#">Refund Policy</a></p></div></div>
  </footer>`;

const floatingTemplate = () => `<div class="quick-actions"><a href="${roomLink(ROOMS[0].slug)}">Book Now ${icon('calendar')}</a><a href="tel:${tel}">Call us ${icon('phone')}</a><a href="${SITE.whatsapp}">WhatsApp ${icon('whatsapp')}</a></div><div class="floating-tools"><button class="top-button" data-to-top aria-label="Back to top">${icon('up')}</button><button class="chat-button" type="button" aria-label="Chat">${icon('chat')}</button></div>`;

// Shared "Have any questions?" block. data-variant="amenity" = gym/pool reveal style.
const contactTemplate = (variant) => {
  const amenity = variant === 'amenity'; const item = (n) => (amenity ? ` class="reveal reveal--left reveal--d${n}"` : '');
  const chars = amenity ? ' data-characters' : '';
  return `<section class="section section--contact-home${amenity ? ' section--amenity-contact' : ''}"><div class="container"><div class="section-heading section-heading--center${amenity ? '' : ' reveal reveal--fade'}"><p class="eyebrow${amenity ? ' reveal reveal--fade reveal--d2' : ''}">Make your stay memorable</p><h2 class="display-title"><span class="muted"${chars}>Have</span> <span class="dark"${chars}>any questions?</span></h2></div><div class="contact-panel${amenity ? '' : ' reveal reveal--d2'}"><div class="contact-list"><div${item(1)}><h3>Talk</h3><a href="tel:${tel}">${SITE.phoneLocal}</a></div><div${item(2)}><h3>Meet</h3><p>${SITE.addressLines.join('<br>')}</p></div><div${item(3)}><h3>Connect</h3><a href="mailto:${SITE.email}">${SITE.email}</a></div></div><form class="contact-form" data-demo-form novalidate><div class="form-field"><label for="${page}-name">Your name</label><input id="${page}-name" name="name" type="text" autocomplete="name" required></div><div class="form-field"><label for="${page}-email">Your email</label><input id="${page}-email" name="email" type="email" autocomplete="email" required></div><div class="form-field"><label for="${page}-message">Your message</label><textarea id="${page}-message" name="message"></textarea></div><button class="button" type="submit">Submit</button></form></div></div></section>`;
};
// Amenities block used on the rooms and room detail pages.
const amenitiesTemplate = (el) => `<section class="section--plum section--rooms-heading wave-edge wave-edge--top"><div class="container"><div class="section-heading section-heading--light"><div class="reveal reveal--fade reveal--d2"><p class="eyebrow">Make your stay memorable</p><h2 class="display-title"><span class="muted">Our</span> <span class="light">Amenities</span></h2></div><a class="button-outline button-outline--light${el.hasAttribute('data-square') ? ' button-outline--square' : ''} reveal reveal--right reveal--d6" href="about.html">Learn More</a></div></div></section><section class="section--plum amenity-section amenity-section--plum brush-edge"><div class="container"><div class="amenity-grid reveal reveal--fade reveal--d2">${AMENITIES.map((a) => { const tag = a.link ? 'a' : 'article'; return `<${tag} class="amenity-card" style="background-image:url('${a.image}')"${a.link ? ` href="${a.link}"` : ''}><div class="amenity-card__content"><div class="amenity-card__heading"><h3>${a.title}</h3></div><p class="amenity-card__detail">${a.text}</p></div></${tag}>`; }).join('')}</div></div></section>`;
const mount = (selector, html) => document.querySelectorAll(selector).forEach((el) => el.replaceWith(document.createRange().createContextualFragment(typeof html === 'function' ? html(el) : html)));
mount('[data-site-amenities]', amenitiesTemplate);
mount('[data-site-contact]', (el) => contactTemplate(el.dataset.variant));
document.querySelectorAll('[data-site-text]').forEach((el) => { const key = el.dataset.siteText; el.textContent = key === 'tel' ? tel : SITE[key]; if (el.href?.startsWith('tel:')) el.href = `tel:${tel}`; if (el.href?.startsWith('mailto:')) el.href = `mailto:${SITE.email}`; });
document.querySelector('[data-site-header]')?.replaceWith(document.createRange().createContextualFragment(headerTemplate()));
document.querySelector('[data-site-footer]')?.replaceWith(document.createRange().createContextualFragment(footerTemplate()));
document.body.insertAdjacentHTML('beforeend', floatingTemplate());

// Room detail: the shared layout in room-*.html is filled from ROOMS by <body data-room>.
const room = ROOMS.find((r) => r.slug === document.body.dataset.room);
if (room) {
  document.title = `${room.title} | ${SITE.name}`;
  const fields = { title: room.title, price: `$${room.price}`, size: `${room.size} M2`, bed: room.bed, capacity: capacity(room), view: room.view };
  document.querySelectorAll('[data-field]').forEach((el) => { el.textContent = fields[el.dataset.field] ?? ''; });
  const galleryEl = document.querySelector('[data-room-gallery]');
  if (galleryEl) galleryEl.innerHTML = room.gallery.map(([src, alt], i) => `<a href="${src}"><img src="${src}" alt="${alt}"${i > 2 ? ' loading="lazy"' : ''}></a>`).join('');
}

const header = document.querySelector('[data-header]');
const toTop = document.querySelector('[data-to-top]');
const brandImg = header?.querySelector('.brand img');
const syncHeader = () => { const scrolled = window.scrollY > 100; header?.classList.toggle('is-scrolled', scrolled); if (brandImg) brandImg.src = scrolled ? SITE.logoSticky : SITE.logo; toTop?.classList.toggle('is-visible', window.scrollY > 500); };
window.addEventListener('scroll', syncHeader, { passive: true }); syncHeader();
toTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const toggle = document.querySelector('[data-menu-toggle]');
const closeMenu = () => { document.body.classList.remove('menu-open'); toggle?.setAttribute('aria-expanded', 'false'); };
toggle?.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); toggle.setAttribute('aria-expanded', String(open)); });
document.querySelector('[data-menu-close]')?.addEventListener('click', closeMenu);
document.querySelectorAll('.mobile-menu a').forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: .16 });
document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

// Character titles start when they scroll into view (hero titles are already visible, so they run on load).
const characterObserver = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { const wrapper = entry.target.querySelector('.hero__characters'); requestAnimationFrame(() => requestAnimationFrame(() => wrapper?.classList.add('is-ready'))); characterObserver.unobserve(entry.target); } }), { threshold: .2 });
document.querySelectorAll('[data-characters]').forEach((heading) => {
  const text = heading.textContent.trim();
  heading.textContent = '';
  const wrapper = document.createElement('span'); wrapper.className = 'hero__characters';
  const words = text.split(' ');
  let charIndex = 0;
  words.forEach((word, wordIndex) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'hero__word';
    [...word].forEach((character) => {
      const span = document.createElement('span');
      span.textContent = character;
      span.style.transitionDelay = `${150 + charIndex * 30}ms`;
      wordSpan.append(span);
      charIndex += 1;
    });
    wrapper.append(wordSpan);
    if (wordIndex < words.length - 1) { wrapper.append(document.createTextNode(' ')); charIndex += 1; }
  });
  heading.append(wrapper); characterObserver.observe(heading);
});

// Room carousel: fixed-width cards, stepped by card offset (no arrows on the reference; drag/swipe only).
const setTrack = (root, delta) => {
  const track = root.querySelector('[data-track]'); if (!track) return;
  const cards = [...track.children]; const visible = window.innerWidth > 767 ? 2 : 1;
  const index = Math.max(0, Math.min(cards.length - visible, Number(root.dataset.index || 0) + delta));
  root.dataset.index = index; track.style.transform = `translateX(-${cards[index].offsetLeft - cards[0].offsetLeft}px)`;
};
// Gym/Pool gallery: variable-width slides aligned left, contained so the last image ends flush with the viewport.
const setGallery = (root, delta) => {
  const track = root.querySelector('[data-track]'); if (!track) return;
  const slides = [...track.children]; const max = Math.max(0, track.scrollWidth - root.clientWidth);
  let index = Math.max(0, Math.min(slides.length - 1, Number(root.dataset.index || 0) + delta));
  if (delta > 0 && Number(root.dataset.offset || 0) >= max) index = Number(root.dataset.index || 0);
  while (index > 0 && slides[index - 1].offsetLeft >= max) index -= 1;
  const offset = Math.min(slides[index].offsetLeft, max);
  root.dataset.index = index; root.dataset.offset = offset; track.style.transform = `translateX(-${offset}px)`;
  const prev = root.querySelector('[data-prev]'); const next = root.querySelector('[data-next]'); if (prev) prev.disabled = offset === 0; if (next) next.disabled = offset >= max;
};
document.querySelectorAll('[data-carousel]').forEach((root) => {
  const prev = root.querySelector('[data-prev]'); const next = root.querySelector('[data-next]');
  const move = root.classList.contains('gallery-slider') ? setGallery : setTrack;
  if (prev) prev.innerHTML = icon('prev');
  if (next) next.innerHTML = icon('next');
  prev?.addEventListener('click', () => move(root, -1));
  next?.addEventListener('click', () => move(root, 1));
  root.querySelectorAll('img').forEach((image) => { if (image.complete) image.classList.add('is-loaded'); else image.addEventListener('load', () => { image.classList.add('is-loaded'); if (move === setGallery) setGallery(root, 0); }, { once: true }); });
  let startX = null;
  root.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) return; startX = event.clientX; root.classList.add('is-dragging'); });
  window.addEventListener('pointerup', (event) => { if (startX === null) return; const dx = event.clientX - startX; startX = null; root.classList.remove('is-dragging'); if (Math.abs(dx) > 50) move(root, dx < 0 ? 1 : -1); });
  window.addEventListener('resize', () => move(root, 0));
  move(root, 0);
});

// Local, non-submitting forms with Contact Form 7-style validation tips and response box.
document.querySelectorAll('[data-demo-form]').forEach((form) => form.addEventListener('submit', (event) => {
  event.preventDefault();
  form.querySelectorAll('.form-tip, .form-response').forEach((node) => node.remove());
  let invalid = 0;
  form.querySelectorAll('input, textarea').forEach((field) => {
    const value = field.value.trim();
    const message = field.required && !value ? 'The field is required.' : field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'The e-mail address entered is invalid.' : '';
    field.closest('.form-field')?.classList.toggle('is-invalid', Boolean(message));
    field.setAttribute('aria-invalid', String(Boolean(message)));
    if (message) { invalid += 1; field.insertAdjacentHTML('afterend', `<span class="form-tip" role="alert">${message}</span>`); }
  });
  const response = document.createElement('p'); response.className = `form-response${invalid ? '' : ' is-sent'}`; response.setAttribute('role', 'status');
  response.textContent = invalid ? 'One or more fields have an error. Please check and try again.' : 'Thank you for your message. It has been sent.';
  form.append(response);
  if (!invalid) form.reset();
}));
