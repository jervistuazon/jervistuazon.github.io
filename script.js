// Gallery Data is loaded from gallery-data.js (const galleryData = ...)
const galleryData = window.galleryData;

let currentGalleryImages = [];
let currentImageIndex = 0;
let currentFolder = '';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Render Gallery Grid from Data
    renderGalleryGrid();

    // Force scroll to top on refresh
    if (history.scrollRestoration) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // Clear URL hash without jumping
    if (window.location.hash) {
        window.history.replaceState(null, null, ' ');
    }


    // Scroll Reveal Animation (Premium)
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 // Slightly higher threshold for better reveal timing
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            } else {
                // entry.target.classList.remove('is-visible'); // Standard scroll reveal usually doesn't hide again
            }
        });
    }, observerOptions);

    const scrollElements = document.querySelectorAll('.fade-in-scroll');
    scrollElements.forEach(el => observer.observe(el));

    // Scroll Animation for Navbar
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // We don't need to add video listeners here for the main gallery since they are added dynamically in renderGalleryGrid
    // But if there were static ones, we would.
});

function renderGalleryGrid() {
    const grid = document.getElementById('gallery-grid');
    const data = window.galleryData || galleryData;
    if (!grid || !data) {
        console.error("Gallery Grid or Data not found", { grid, data });
        return;
    }

    grid.innerHTML = ''; // Clear fallback

    // Observer for new items
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    // Layout Pattern to mimic the original "hand-crafted" look
    // pattern classes: 'span-2-2' (Large), 'span-2-1' (Wide), '' (Standard 1x1)
    const layoutPattern = [
        'span-2-2', // 1. Large
        '',         // 2. Standard
        '',         // 3. Standard
        'span-2-1', // 4. Wide
        '',         // 5. Standard
        '',         // 6. Standard
        'span-2-2', // 7. Large
        '',         // 8. Standard
        'span-2-1', // 9. Wide
        ''          // 10. Standard
    ];

    let index = 0;

    // Loop through gallery folders
    for (const [folderName, files] of Object.entries(data)) {
        if (!files || files.length === 0) continue;

        // Use first valid image/video as thumbnail
        const thumbnail = files[0];

        // Create Item
        const item = document.createElement('div');

        // Get span class from pattern (repeating)
        const spanClass = layoutPattern[index % layoutPattern.length];
        item.className = `gallery-item fade-in-scroll ${spanClass}`;

        item.setAttribute('data-category', 'visualization'); // Default category
        item.onclick = () => openGallery(folderName);

        index++;

        // Content
        const path = `assets/${folderName}/${thumbnail}`;
        const encodedPath = encodePath(path);

        // Check if video
        if (isVideo(thumbnail)) {
            const video = document.createElement('video');
            video.src = encodedPath;
            video.muted = true;
            video.loop = true;
            video.className = 'gallery-video';

            // Auto play on hover logic for dynamically added video
            item.onmouseenter = () => video.play().catch(e => { });
            item.onmouseleave = () => { video.pause(); video.currentTime = 0; };

            item.appendChild(video);
        } else {
            // Image Thumbnail
            const img = document.createElement('img');
            img.src = encodedPath;
            img.alt = folderName;
            img.className = 'gallery-img';
            item.appendChild(img);
        }

        // Info Overlay
        const info = document.createElement('div');
        info.className = 'item-info';

        const h4 = document.createElement('h4');
        h4.textContent = folderName;

        // const p = document.createElement('p');
        // p.textContent = `${files.length} items`; // Show count

        info.appendChild(h4);
        // info.appendChild(p);
        item.appendChild(info);

        grid.appendChild(item);

        // Observe
        observer.observe(item);
    }
}

// Helper to encode paths properly (fixing spaces)
function encodePath(path) {
    return path.split('/').map(part => encodeURIComponent(part)).join('/');
}

function isVideo(filename) {
    return /\.(mp4|webm|mov)$/i.test(filename);
}

// Lightbox Functions
function openGallery(folderName) {
    if (!galleryData[folderName]) return;

    currentFolder = folderName;
    currentGalleryImages = galleryData[folderName];
    currentImageIndex = 0;

    updateLightboxContent();

    const lightbox = document.getElementById('lightbox');
    lightbox.style.display = 'block';

    setTimeout(() => {
        lightbox.classList.add('active');
    }, 10);

    document.body.style.overflow = 'hidden';
}

function updateLightboxContent() {
    const container = document.getElementById('lightbox-content-container');
    const caption = document.getElementById('caption');
    const imgName = currentGalleryImages[currentImageIndex];

    if (!imgName) return;

    const path = `assets/${currentFolder}/${imgName}`;
    const encodedPath = encodePath(path);

    container.innerHTML = '';

    let contentElement;

    if (isVideo(imgName)) {
        contentElement = document.createElement('video');
        contentElement.src = encodedPath;
        contentElement.controls = true;
        contentElement.autoplay = true;

        contentElement.className = 'lightbox-content';
        contentElement.style.opacity = '1';
        contentElement.style.display = 'block';
    } else {
        contentElement = document.createElement('img');
        contentElement.src = encodedPath;
        contentElement.alt = imgName;
        contentElement.className = 'lightbox-content';
        // Remove 'fade-in' class to avoid animation conflicts
        contentElement.style.opacity = '1';
        contentElement.style.display = 'block';
        contentElement.style.animation = 'none'; // Ensure no animation interference
    }

    container.appendChild(contentElement);
    // Remove extension logic
    caption.textContent = imgName.replace(/\.[^/.]+$/, "");
}

function changeImage(direction) {
    currentImageIndex += direction;
    if (currentImageIndex < 0) {
        currentImageIndex = currentGalleryImages.length - 1;
    } else if (currentImageIndex >= currentGalleryImages.length) {
        currentImageIndex = 0;
    }
    updateLightboxContent();
}

// Filter Logic placeholder (if we re-implement filters later)
function filterGallery(category) {
    // No-op for dynamic grid currently
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    const container = document.getElementById('lightbox-content-container');

    lightbox.classList.remove('active');

    setTimeout(() => {
        lightbox.style.display = 'none';
        document.body.style.overflow = 'auto';
        container.innerHTML = '';
        currentGalleryImages = [];
    }, 300);
}

// Lenis Smooth Scrolling
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
});

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}

requestAnimationFrame(raf);
