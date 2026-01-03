// Gallery Data is loaded from gallery-data.js (const galleryData = ...)

let currentGalleryImages = [];
let currentImageIndex = 0;
let currentFolder = '';
let savedScrollPosition = 0; // For scroll position memory

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

    // Keyboard Support (ESC + Arrow Keys)
    document.addEventListener('keydown', (e) => {
        const lightbox = document.getElementById('lightbox');
        const projectView = document.getElementById('project-view');

        if (e.key === 'Escape') {
            // Priority: Close Lightbox first, then Project View
            if (lightbox.style.display === 'block') {
                closeLightbox();
            } else if (projectView.style.display === 'block') {
                closeProjectView();
            }
        }

        // Arrow key navigation in lightbox
        if (lightbox.style.display === 'block') {
            if (e.key === 'ArrowLeft') {
                changeImage(-1);
            } else if (e.key === 'ArrowRight') {
                changeImage(1);
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

// Helper to parse folder name format: "Project Name - Location - Year - F"
// Returns { name, location, date }
function parseProjectName(folderName) {
    // Remove the - F suffix first
    const cleaned = folderName.replace(/ - F$| -F$/, '');

    // Split by " - " pattern
    const parts = cleaned.split(/ - /);

    // First part is always the project name
    const name = parts[0] || cleaned;

    // Try to identify location and date from remaining parts
    let location = null;
    let date = null;

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        // Check if it looks like a year (4 digits)
        if (/^\d{4}$/.test(part)) {
            date = part;
        } else if (part) {
            location = part;
        }
    }

    return { name, location, date };
}


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

    // Collect all projects from all categories
    const allProjects = [];
    const featuredProjects = [];

    // Categories to process (exclude HERO SHOT and Video separately)
    const categoriesToProcess = [
        'Commercial',
        'Hospitality',
        'Institutional',
        'Mix Used Development',
        'Residential',
        'Residential Development'
    ];

    // Process each category
    categoriesToProcess.forEach(categoryName => {
        const categoryData = galleryData[categoryName];
        if (!categoryData || typeof categoryData !== 'object') return;

        // Each category contains project folders and possibly _standalone images
        for (const [projectName, files] of Object.entries(categoryData)) {
            if (!files || files.length === 0) continue;

            // Handle _standalone images (files directly in category folder)
            if (projectName === '_standalone') {
                files.forEach((filename, fileIndex) => {
                    allProjects.push({
                        type: 'standalone',
                        category: categoryName,
                        categorySlug: categoryName.toLowerCase().replace(/ /g, '-'),
                        filename: filename,
                        fileIndex: fileIndex,
                        standaloneFiles: files,
                        featured: false
                    });
                });
                continue;
            }

            // Check if featured (ends with - F or -F)
            const isFeatured = / - F$| -F$/.test(projectName);

            // Get thumbnail (first image)
            let thumbSrc = files[0];
            if (typeof thumbSrc === 'object') thumbSrc = thumbSrc.src;

            const project = {
                type: 'project',
                category: categoryName,
                categorySlug: categoryName.toLowerCase().replace(/ /g, '-'),
                projectName: projectName,
                thumbSrc: thumbSrc,
                files: files,
                featured: isFeatured
            };

            if (isFeatured) {
                featuredProjects.push(project);
            }
            allProjects.push(project);
        }
    });

    // Process Videos
    if (galleryData['Video'] && Array.isArray(galleryData['Video'])) {
        galleryData['Video'].forEach((filename, fileIndex) => {
            allProjects.push({
                type: 'video',
                category: 'Video',
                categorySlug: 'video',
                filename: filename,
                fileIndex: fileIndex,
                featured: false
            });
        });
    }

    // Sort: Featured first, then the rest
    const sortedProjects = [...featuredProjects, ...allProjects.filter(p => !p.featured)];

    // Render all items
    sortedProjects.forEach((itemData, index) => {
        const item = document.createElement('div');

        // Apply layout: 
        // - Featured projects: alternate between left and right 2x2
        // - Regular projects: alternate between span-2-1 and span-1-2
        // - Standalone images: 1x1 (no span class)
        // - Videos: 1x1 (no span class)
        let spanClass = '';
        if (itemData.type === 'project') {
            if (itemData.featured) {
                // Alternate featured items between left and right
                spanClass = index % 2 === 0 ? 'span-2-2' : 'span-2-2-right';
            } else {
                // Alternate between 2x1 and 1x2 for regular projects
                spanClass = index % 2 === 0 ? 'span-2-1' : 'span-1-2';
            }
        }
        item.className = `gallery-item fade-in-scroll ${spanClass}`;

        // Set category for filtering
        item.setAttribute('data-category', itemData.categorySlug);
        if (itemData.featured) {
            item.setAttribute('data-featured', 'true');
        }

        if (itemData.type === 'project') {
            // Project folder
            item.onclick = () => openGallery(itemData.category, itemData.projectName);
            renderMediaNested(item, itemData.category, itemData.projectName, itemData.thumbSrc);

            // Display name: extract just the project name (before first dash)
            const displayName = parseProjectName(itemData.projectName).name;
            renderInfo(item, displayName);
        } else if (itemData.type === 'standalone') {
            // Standalone image in category folder
            item.onclick = () => {
                currentFolder = itemData.category;
                currentGalleryImages = itemData.standaloneFiles;
                openLightbox(itemData.fileIndex);
            };
            renderMedia(item, itemData.category, itemData.filename);
            renderInfo(item, itemData.filename.replace(/\.[^/.]+$/, ""));
        } else if (itemData.type === 'video') {
            // Video item
            item.onclick = () => {
                currentFolder = 'Video';
                currentGalleryImages = galleryData['Video'];
                openLightbox(itemData.fileIndex);
            };
            renderMedia(item, 'Video', itemData.filename);
            renderInfo(item, itemData.filename.replace(/\.[^/.]+$/, ""));
        }

        grid.appendChild(item);
        observer.observe(item);
    });
}

// Helper for nested paths (Render/ProjectName/file)
function renderMediaNested(container, category, folder, filename) {
    const path = `assets/${category}/${folder}/${filename}`;
    const encodedPath = encodePath(path);

    // Add loading state
    container.classList.add('loading');

    if (isVideo(filename)) {
        const video = document.createElement('video');
        video.src = encodedPath;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.className = 'gallery-video';

        video.addEventListener('loadeddata', () => {
            container.classList.remove('loading');
            container.classList.add('loaded');
        });
        video.addEventListener('error', () => {
            container.classList.remove('loading');
        });

        container.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = encodedPath;
        img.alt = filename;
        img.className = 'gallery-img';

        img.addEventListener('load', () => {
            container.classList.remove('loading');
            container.classList.add('loaded');
        });
        img.addEventListener('error', () => {
            container.classList.remove('loading');
        });

        container.appendChild(img);
    }
}


// Helper to clean up render code
function renderMedia(container, folder, filename) {
    const path = `assets/${folder}/${filename}`;
    const encodedPath = encodePath(path);

    // Add loading state
    container.classList.add('loading');

    if (isVideo(filename)) {
        const video = document.createElement('video');
        video.src = encodedPath;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.className = 'gallery-video';

        // Handle video load
        video.addEventListener('loadeddata', () => {
            container.classList.remove('loading');
            container.classList.add('loaded');
        });
        video.addEventListener('error', () => {
            container.classList.remove('loading');
        });

        container.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = encodedPath;
        img.alt = filename;
        img.className = 'gallery-img';

        // Handle image load
        img.addEventListener('load', () => {
            container.classList.remove('loading');
            container.classList.add('loaded');
        });
        img.addEventListener('error', () => {
            container.classList.remove('loading');
        });

        container.appendChild(img);
    }
}

function renderInfo(container, text) {
    const info = document.createElement('div');
    info.className = 'item-info';
    const h4 = document.createElement('h4');
    h4.textContent = text;
    info.appendChild(h4);
    container.appendChild(info);
}

// Modified renderGalleryGrid (Legacy Part below for matching)
/* 
   Since the codebase is large, let's just insert the new logic at the top of renderGalleryGrid 
   and put the old logic in a block that runs if no layout found.
*/

// Open Project View (Sub-Gallery)
// For category projects: openGallery('Hospitality', 'Fiji Island Resort')
function openGallery(category, projectName) {
    let rawData;
    let displayName;
    let basePath;

    // Handle category nested structure (Category/ProjectName)
    if (category && projectName) {
        if (!galleryData[category] || !galleryData[category][projectName]) return;
        rawData = galleryData[category][projectName];
        // Display name: strip the " - F" suffix for display
        displayName = projectName.replace(/ - F$| -F$/, '');
        basePath = `assets/${category}/${projectName}`;
        currentFolder = `${category}/${projectName}`;
    } else {
        // Legacy fallback for flat structure (e.g., Video)
        if (!galleryData[category]) return;
        rawData = galleryData[category];
        displayName = category;
        basePath = `assets/${category}`;
        currentFolder = category;
    }

    // Normalize for Lightbox usage (strings only)
    currentGalleryImages = rawData.map(f => typeof f === 'object' ? f.src : f);

    // Populate the project grid
    const projectGrid = document.getElementById('project-grid');
    const projectTitle = document.getElementById('project-title');
    const projectView = document.getElementById('project-view');

    // Parse project name into parts
    const projectParts = parseProjectName(projectName);

    // Build formatted title with project name large, location/date small
    projectTitle.innerHTML = `
        <span class="project-name">${projectParts.name}</span>
        ${projectParts.location || projectParts.date ?
            `<span class="project-meta">${[projectParts.location, projectParts.date].filter(Boolean).join(' • ')}</span>` : ''}
    `;
    projectGrid.innerHTML = '';

    let index = 0;

    // Observer for project view items
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    rawData.forEach((itemData, i) => {
        const isObject = typeof itemData === 'object';
        const filename = isObject ? itemData.src : itemData;
        const spanConfig = isObject ? itemData.span : null;

        const item = document.createElement('div');
        // Use custom span if available, else fallback to pattern
        const spanClass = spanConfig || layoutPatternMain[index % layoutPatternMain.length];

        item.className = `gallery-item fade-in-scroll ${spanClass}`;

        // Clicking this opens actual lightbox
        item.onclick = () => openLightbox(i);

        index++;

        const path = `${basePath}/${filename}`;
        const encodedPath = encodePath(path);

        // Add loading state
        item.classList.add('loading');


        if (isVideo(filename)) {
            const video = document.createElement('video');
            video.src = encodedPath;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.autoplay = true;
            video.className = 'gallery-video';

            // Handle video load
            video.addEventListener('loadeddata', () => {
                item.classList.remove('loading');
                item.classList.add('loaded');
            });
            video.addEventListener('error', () => {
                item.classList.remove('loading');
            });

            item.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = encodedPath;
            img.alt = filename;
            img.className = 'gallery-img';

            // Handle image load
            img.addEventListener('load', () => {
                item.classList.remove('loading');
                item.classList.add('loaded');
            });
            img.addEventListener('error', () => {
                item.classList.remove('loading');
            });

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

    // Save scroll position before showing overlay
    savedScrollPosition = window.scrollY || document.documentElement.scrollTop;

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
        // Restore scroll position
        window.scrollTo(0, savedScrollPosition);
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
function filterGallery(category, evt) {
    // 1. Update Buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Mark clicked button as active
    if (evt && evt.target) {
        evt.target.classList.add('active');
    } else {
        // Fallback: find button by category
        buttons.forEach(btn => {
            if (btn.textContent.toLowerCase().includes(category.toLowerCase()) ||
                (category === 'all' && btn.textContent === 'All')) {
                btn.classList.add('active');
            }
        });
    }

    // 2. Filter Items
    const items = document.querySelectorAll('.gallery-item');
    items.forEach(item => {
        const itemCategory = item.getAttribute('data-category');
        const isFeatured = item.getAttribute('data-featured') === 'true';

        let shouldShow = false;

        if (category === 'all') {
            shouldShow = true;
        } else if (category === 'featured') {
            shouldShow = isFeatured;
        } else {
            shouldShow = itemCategory === category;
        }

        if (shouldShow) {
            item.style.display = 'block';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        } else {
            item.style.display = 'none';
        }
    });

    // Re-assign span classes to maintain layout rhythm
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
