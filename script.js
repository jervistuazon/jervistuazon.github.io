// Gallery Data is loaded from gallery-data.js (const galleryData = ...)

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
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
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

    // ESC Key Support
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const lightbox = document.getElementById('lightbox');
            const projectView = document.getElementById('project-view');

            // Priority: Close Lightbox first, then Project View
            if (lightbox.style.display === 'block') {
                closeLightbox();
            } else if (projectView.style.display === 'block') {
                closeProjectView();
            }
        }
    });
});

// Reusable pattern for both main gallery and project sub-gallery
const layoutPattern = [
    'span-2-2', 'span-2-1', '', 'span-2-2', '', 'span-2-1', '', '', 'span-2-1'
];
// Slightly randomized pattern or just fixed
// Using the previous requested one:
const layoutPatternMain = [
    'span-2-2', '', '', 'span-2-1', '', '', 'span-2-2', '', 'span-2-1', ''
];


function renderGalleryGrid() {
    const grid = document.getElementById('gallery-grid');
    if (!grid || typeof galleryData === 'undefined') return;

    grid.innerHTML = '';

    // Observer for new items
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    let index = 0;

    // Loop through gallery folders
    for (const [folderName, files] of Object.entries(galleryData)) {
        if (!files || files.length === 0) continue;

        // Skip HERO SHOT (used for background)
        if (folderName === 'HERO SHOT') continue;

        // Special handling for Animation, Interactive Presentation: Show ALL items
        if (folderName === 'Animation' || folderName === 'Interactive Presentation') {
            files.forEach((filename, fileIndex) => {
                const item = document.createElement('div');
                const spanClass = layoutPatternMain[index % layoutPatternMain.length];
                item.className = `gallery-item fade-in-scroll ${spanClass}`;

                // Set Category
                let category = 'render';
                if (folderName === 'Animation') category = 'animation';
                if (folderName === 'Interactive Presentation') category = 'interactive';
                item.setAttribute('data-category', category);

                // Click Action: Open Lightbox directly
                item.onclick = () => {
                    currentFolder = folderName;
                    currentGalleryImages = files;
                    openLightbox(fileIndex);
                };

                index++;

                const path = `assets/${folderName}/${filename}`;
                const encodedPath = encodePath(path);

                // Content (Video only likely, but check provided)
                if (isVideo(filename)) {
                    const video = document.createElement('video');
                    video.src = encodedPath;
                    video.muted = true;
                    video.loop = true;
                    video.playsInline = true; // Critical for mobile
                    video.autoplay = true;    // Ensure it starts
                    video.className = 'gallery-video';
                    // item.onmouseenter = ... (Removed for mobile compatibility)
                    // item.onmouseleave = ... (Removed for mobile compatibility)
                    item.appendChild(video);
                } else {
                    const img = document.createElement('img');
                    img.src = encodedPath;
                    img.alt = filename;
                    img.className = 'gallery-img';
                    item.appendChild(img);
                }

                // Info Overlay
                const info = document.createElement('div');
                info.className = 'item-info';
                const h4 = document.createElement('h4');
                h4.textContent = filename.replace(/\.[^/.]+$/, ""); // Strip extension
                info.appendChild(h4);
                item.appendChild(info);

                grid.appendChild(item);
                observer.observe(item);
            });
        }
        // Default: Show Folder Thumbnail (Project View)
        else {
            const thumbnail = files[0];
            const item = document.createElement('div');

            const spanClass = layoutPatternMain[index % layoutPatternMain.length];
            item.className = `gallery-item fade-in-scroll ${spanClass}`;

            item.setAttribute('data-category', 'render');
            item.onclick = () => openGallery(folderName);

            index++;

            const path = `assets/${folderName}/${thumbnail}`;
            const encodedPath = encodePath(path);

            if (isVideo(thumbnail)) {
                const video = document.createElement('video');
                video.src = encodedPath;
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                video.autoplay = true;
                video.className = 'gallery-video';
                // Removed hover logic
                item.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = encodedPath;
                img.alt = folderName;
                img.className = 'gallery-img';
                item.appendChild(img);
            }

            // Info Overlay for Folder
            const info = document.createElement('div');
            info.className = 'item-info';
            const h4 = document.createElement('h4');
            h4.textContent = folderName;
            info.appendChild(h4);
            item.appendChild(info);

            grid.appendChild(item);
            observer.observe(item);
        }
    }
}

// Open Project View (Sub-Gallery)
function openGallery(folderName) {
    if (!galleryData[folderName]) return;

    currentFolder = folderName;
    currentGalleryImages = galleryData[folderName];

    // Populate the project grid
    const projectGrid = document.getElementById('project-grid');
    const projectTitle = document.getElementById('project-title');
    const projectView = document.getElementById('project-view');

    projectTitle.textContent = folderName;
    projectGrid.innerHTML = '';

    // Reuse layout pattern logic for sub-gallery?
    // User asked "arrange in block and different sizes".
    // We can use the same pattern or a slightly different one.
    // Let's reuse the main pattern for consistency.

    let index = 0;

    // Observer for project view items
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    currentGalleryImages.forEach((filename, i) => {
        const item = document.createElement('div');
        const spanClass = layoutPatternMain[index % layoutPatternMain.length];
        item.className = `gallery-item fade-in-scroll ${spanClass}`;

        // Clicking this opens actual lightbox
        item.onclick = () => openLightbox(i);

        index++;

        const path = `assets/${currentFolder}/${filename}`;
        const encodedPath = encodePath(path);

        if (isVideo(filename)) {
            const video = document.createElement('video');
            video.src = encodedPath;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.autoplay = true;
            video.className = 'gallery-video';
            // Removed hover logic
            item.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = encodedPath;
            img.alt = filename;
            img.className = 'gallery-img';
            item.appendChild(img);
        }

        // No text overlay needed for individual images usually, or maybe filename?
        // User requested removing extensions, maybe clear look is better?
        // Let's add a subtle hover effect if needed, but for now just the media.

        // Add Info Overlay with Filename (User Request)
        const info = document.createElement('div');
        info.className = 'item-info';

        const h4 = document.createElement('h4');
        h4.textContent = filename.replace(/\.[^/.]+$/, ""); // Strip extension

        info.appendChild(h4);
        item.appendChild(info);

        projectGrid.appendChild(item);
        observer.observe(item);
    });

    // Show Overlay
    projectView.style.display = 'block';
    setTimeout(() => projectView.classList.add('active'), 10);
    document.body.style.overflow = 'hidden';
}

function closeProjectView() {
    const projectView = document.getElementById('project-view');
    projectView.classList.remove('active');
    setTimeout(() => {
        projectView.style.display = 'none';
        document.body.style.overflow = 'auto'; // Re-enable scroll
    }, 300);
}


// --- Lightbox Functions (Modified to be opened from Project View) ---

function openLightbox(index) {
    currentImageIndex = index;
    updateLightboxContent();

    const lightbox = document.getElementById('lightbox');
    lightbox.style.display = 'block';
    setTimeout(() => lightbox.classList.add('active'), 10);

    // Note: Body overflow is ALREADY hidden by project view.
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
        contentElement.playsInline = true;

        contentElement.className = 'lightbox-content';
        contentElement.style.opacity = '1';
        contentElement.style.display = 'block';
    } else {
        contentElement = document.createElement('img');
        contentElement.src = encodedPath;
        contentElement.alt = imgName;
        contentElement.className = 'lightbox-content';
        contentElement.style.opacity = '1';
        contentElement.style.display = 'block';
        contentElement.style.animation = 'none';
    }

    container.appendChild(contentElement);
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

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    const container = document.getElementById('lightbox-content-container');

    lightbox.classList.remove('active');

    setTimeout(() => {
        lightbox.style.display = 'none';
        // DO NOT reset body overflow here, because we return to Project View!
        // document.body.style.overflow = 'auto'; 
        container.innerHTML = '';
    }, 300);
}

// Helper to encode paths properly (fixing spaces)
function encodePath(path) {
    return path.split('/').map(part => encodeURIComponent(part)).join('/');
}

function isVideo(filename) {
    return /\.(mp4|webm|mov)$/i.test(filename);
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

// Filter Gallery Function
function filterGallery(category) {
    // 1. Update Buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Try to find the button that was clicked
    // event.target might work if triggered from inline onclick
    if (event && event.target) {
        event.target.classList.add('active');
    }

    // 2. Filter Items
    const items = document.querySelectorAll('.gallery-item');
    items.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        if (category === 'all' || itemCategory === category) {
            item.style.display = 'block';
            // Optional: restart animation?
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        } else {
            item.style.display = 'none';
        }
    });

    // Re-layout is handled by CSS grid/flex automatically, 
    // but the pattern classes (span-2-2 etc) might look weird if gaps appear.
    // For a masonry layout, we might need to re-apply classes based on visible items.
    // But user didn't ask for that yet, and CSS grid dense packing might help if enabled.
    // Current CSS (styles.css) uses grid-template-columns with span classes.
    // Ideally we should re-assign span classes to visible items to maintain the layout rhythm.
    reassignLayoutPattern();
}

function reassignLayoutPattern() {
    const visibleItems = Array.from(document.querySelectorAll('.gallery-item')).filter(item => item.style.display !== 'none');

    visibleItems.forEach((item, index) => {
        // Remove old span classes
        item.classList.remove('span-2-2', 'span-2-1', 'span-1-1'); // assuming these are the classes
        // Re-apply based on new index
        const spanClass = layoutPatternMain[index % layoutPatternMain.length];
        if (spanClass) item.classList.add(spanClass);
    });
}
