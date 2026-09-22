// Site content. Edit this file to re-brand the site; colors & fonts live in :root of css/global.css.
const SITE = {
  name: 'Rivana Residence',
  logo: 'assets/images/rivana-logo.png',
  logoSticky: 'assets/images/rivana-logo-sticky.png',
  phone: '+20 105 555 3086',
  phoneLocal: '01055553086',
  email: 'info@rivanaresidence.com',
  address: 'Plot 46 A, District 37, Southern Investors, New Cairo 1, Cairo.',
  addressLines: ['Plot 46 A, District 37,', 'Southern Investors,', 'New Cairo 1, Cairo.'],
  whatsapp: '#',
  copyright: '© 2025 Rivana Residence — Developed by Erctra',
  social: { facebook: '#', instagram: '#', tiktok: '#', youtube: '#', linkedin: '#', x: '#', threads: '#' },
};

// One entry per room. Each room page is `room-<slug>.html` with <body data-room="<slug>">.
// Array order = display order on the rooms page, home/about carousels and footer.
const ROOMS = [
  {
    slug: 'studio-balcony', title: 'Studio With Balcony Room', shortTitle: 'Studio With Balcony',
    price: 70, size: 55, adults: 2, children: 1, bed: '2 Twin Bed', view: 'City View',
    image: 'assets/images/room-balcony.jpg',
    gallery: [
      ['assets/images/room-gallery-01.jpg', 'Studio bedroom'],
      ['assets/images/room-balcony.jpg', 'Studio twin beds'],
      ['assets/images/room-gallery-02.jpg', 'Studio interior'],
      ['assets/images/room-gallery-03.jpg', 'Studio kitchenette'],
      ['assets/images/room-gallery-04.jpg', 'Studio lounge'],
      ['assets/images/room-gallery-05.jpg', 'Studio entry'],
      ['assets/images/room-gallery-06.jpg', 'Studio bathroom'],
      ['assets/images/room-gallery-07.jpg', 'Studio bathroom detail'],
      ['assets/images/room-gallery-08.jpg', 'Studio balcony'],
    ],
  },
  {
    slug: 'studio-pool-view', title: 'Studio With Pool View Room', shortTitle: 'Studio With Pool View',
    price: 65, size: 50, adults: 2, children: 1, bed: '1 Queen Bed', view: 'Pool View',
    image: 'assets/images/room-pool.jpg',
    gallery: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`assets/images/room-superior-${i}.jpg`, `Studio with pool view photo ${i + 1}`]),
  },
  {
    slug: 'deluxe-double', title: 'Deluxe Double Room', shortTitle: 'Deluxe Double Room',
    price: 60, size: 45, adults: 2, children: 1, bed: '1 Double Bed', view: 'City View',
    image: 'assets/images/room-double.jpg',
    gallery: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`assets/images/room-superior-${i}.jpg`, `Deluxe double room photo ${i + 1}`]),
  },
];

// Amenity cards shown on the rooms and room detail pages.
const AMENITIES = [
  { title: 'Wellness & Spa', image: 'assets/images/amenity-spa.jpg', text: 'On the present site of our hotel feet in the water, there used to be an establishment composed of a restaurant and dormitories.' },
  { title: 'Fitness Center', image: 'assets/images/amenity-fitness.jpg', text: 'On the present site of our hotel feet in the water, there used to be an establishment composed of a restaurant and dormitories.', link: 'gym.html' },
  { title: 'Swimming Pool', image: 'assets/images/amenity-pool.jpg', text: 'On the present site of our hotel feet in the water, there used to be an establishment composed of a restaurant and dormitories.', link: 'swimming-pool.html' },
];
