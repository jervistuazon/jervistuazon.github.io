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

    // 2. Handle URL hash routing for SEO project pages
    // Format: #project/Category/ProjectName
    handleHashRouting();


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

// Utility function to encode file paths for URLs (handle spaces and special characters)
function encodePath(path) {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

// Utility function to check if a file is a video
function isVideo(filename) {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

// Reusable pattern for both main gallery and project sub-gallery
// Pattern designed to fill a 3-column grid without gaps
const layoutPattern = [
    'span-2-2', 'span-1-2', '', '', '', 'span-2-2', '', ''
];
// Project view pattern - avoid gaps. user requested no 2x1 (too long) and no 1x2 (too tall).
// mostly squares (1x1)
const layoutPatternMain = [
    '', '', '', '', '', ''
];

// Possible span classes for non-featured projects (flexible sizing)
const projectSpanOptions = ['span-2-2', 'span-2-1', 'span-1-2'];

// Manual size overrides for specific projects (to fill gaps or customize layout)
const projectSizeOverrides = {
    'Banyan Valley Sabah Terrace Malaysia': 'span-1-2'
};

// Manual size overrides for specific standalone images
const standaloneSizeOverrides = {
    'Siglap Rd Singapore.png': 'span-1-2'
};

// Simple seeded random for consistent layout on page reload
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// Get a random span class for a project based on its index
// Uses index as seed for deterministic randomness (same layout on refresh)
// Checks for manual overrides first
function getRandomProjectSpan(index, projectName = null) {
    // Check for manual override first
    if (projectName && projectSizeOverrides[projectName]) {
        return projectSizeOverrides[projectName];
    }
    const rand = seededRandom(index * 1337 + 42);
    return projectSpanOptions[Math.floor(rand * projectSpanOptions.length)];
}

// Get a random span class for standalone images
// 50% chance of being 1x1, 50% chance of being 1x2 or 2x1
// Checks for manual overrides first
function getRandomStandaloneSpan(index, filename = null) {
    // Check for manual override first
    if (filename && standaloneSizeOverrides[filename]) {
        return standaloneSizeOverrides[filename];
    }
    const rand = seededRandom(index * 7919 + 123);
    if (rand < 0.5) {
        return ''; // 1x1 (no span class)
    } else {
        // Choose between span-1-2 and span-2-1
        const spanOptions = ['span-1-2', 'span-2-1'];
        const spanRand = seededRandom(index * 3571 + 789);
        return spanOptions[Math.floor(spanRand * spanOptions.length)];
    }
}

// --- SEO URL Hash Routing ---
// Convert project name to URL-safe slug
function slugify(text) {
    return text.toLowerCase()
        .replace(/ - F$| -F$/i, '')  // Remove featured suffix
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dashes
        .replace(/^-+|-+$/g, '');    // Trim leading/trailing dashes
}

// Handle URL hash on page load (for SEO redirects and shareable links)
function handleHashRouting() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#project/')) return;

    // Parse hash: #project/Category/ProjectName
    const parts = hash.substring(9).split('/'); // Remove '#project/'
    if (parts.length < 2) return;

    const categorySlug = parts[0];
    const projectSlug = parts[1];

    // Find matching category and project
    const categories = Object.keys(galleryData);
    for (const category of categories) {
        if (slugify(category) !== categorySlug) continue;

        const categoryData = galleryData[category];
        if (typeof categoryData !== 'object' || Array.isArray(categoryData)) continue;

        for (const projectName of Object.keys(categoryData)) {
            if (projectName === '_standalone') continue;
            if (slugify(projectName) === projectSlug) {
                // Found it! Open the gallery after a short delay (let page render first)
                setTimeout(() => {
                    openGallery(category, projectName);
                }, 100);
                return;
            }
        }
    }
}

// Update URL hash when opening a project (for shareable links)
function updateUrlHash(category, projectName) {
    const categorySlug = slugify(category);
    const projectSlug = slugify(projectName);
    const newHash = `#project/${categorySlug}/${projectSlug}`;
    window.history.replaceState(null, null, newHash);
}

// Clear URL hash when closing project view
function clearUrlHash() {
    window.history.replaceState(null, null, window.location.pathname);
}

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
        'Residential'
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

            // Get thumbnail: prioritize image starting with "1." or "1 "
            let thumbSrc = files[0];
            const numberedImage = files.find(f => {
                const name = typeof f === 'object' ? f.src : f;
                return name.startsWith('1.') || name.startsWith('1 ');
            });

            if (numberedImage) {
                thumbSrc = numberedImage;
            }

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

    // Sort: Featured first, then Video (2x2), then project folders, then standalone (1x1) last
    const nonFeatured = allProjects.filter(p => !p.featured);
    const videos = nonFeatured.filter(p => p.type === 'video');
    const projectFolders = nonFeatured.filter(p => p.type === 'project');
    const standalone = nonFeatured.filter(p => p.type === 'standalone');

    // Concatenate in order: Featured -> Videos -> Projects -> Standalone
    const sortedProjects = [...featuredProjects, ...videos, ...projectFolders, ...standalone];

    // Render all items
    sortedProjects.forEach((itemData, index) => {
        const item = document.createElement('div');

        // Apply layout: 
        // - Featured projects: always 2x2, alternating left/right
        // - Normal project folders: random sized (2x2, 2x1, or 1x2) for visual variety
        // - Standalone images: 1x1 (no span class)
        // - Videos: 1x1 (no span class)
        let spanClass = '';
        if (itemData.type === 'project') {
            item.setAttribute('data-project', 'true');
            if (itemData.featured) {
                // Featured items are full width (3 cols) x 2 rows
                spanClass = 'span-3-2';
            } else {
                // Normal project folders: check for manual override first, else random sizing
                spanClass = getRandomProjectSpan(index, itemData.projectName);
            }
        } else if (itemData.type === 'video') {
            // Videos are always 2x2
            spanClass = 'span-2-2';
        } else if (itemData.type === 'standalone') {
            // Standalone images: 50% get varied sizing (1x2 or 2x1), 50% stay 1x1
            spanClass = getRandomStandaloneSpan(index, itemData.filename);
        }
        // Other items default to 1x1 (no span class)
        item.className = `gallery-item fade-in-scroll ${spanClass}`;

        // Set category for filtering
        item.setAttribute('data-category', itemData.categorySlug);
        if (itemData.featured) {
            item.setAttribute('data-featured', 'true');
        }

        if (itemData.type === 'project') {
            // Project folder
            item.onclick = () => openGallery(itemData.category, itemData.projectName);
            renderMediaItem(item, itemData.category, itemData.projectName, itemData.thumbSrc);

            // Display name: extract just the project name (before first dash)
            const displayName = parseProjectName(itemData.projectName).name;
            renderInfo(item, displayName);

            // Auto-run slideshow for multi-image projects
            const imageCount = itemData.files.length;
            if (imageCount > 1) {
                // Add auto-running slideshow for multi-image projects
                setupHoverSlideshow(item, itemData.category, itemData.projectName, itemData.files);
            }
        } else if (itemData.type === 'standalone') {
            // Standalone image in category folder - mark for desaturated styling
            item.setAttribute('data-standalone', 'true');
            item.onclick = () => {
                currentFolder = itemData.category;
                currentGalleryImages = itemData.standaloneFiles;
                openLightbox(itemData.fileIndex);
            };
            renderMediaItem(item, itemData.category, '.', itemData.filename);
            renderInfo(item, itemData.filename.replace(/\.[^/.]+$/, "").replace(/^\d+\.\s*/, ""));
        } else if (itemData.type === 'video') {
            // Video item
            item.onclick = () => {
                currentFolder = 'Video';
                currentGalleryImages = galleryData['Video'];
                openLightbox(itemData.fileIndex);
            };
            renderMediaItem(item, 'Video', '.', itemData.filename);
            renderInfo(item, itemData.filename.replace(/\.[^/.]+$/, "").replace(/^\d+\.\s*/, ""));
        }

        grid.appendChild(item);
        observer.observe(item);
    });
}

// Setup auto-running slideshow for project folders with multiple images
function setupHoverSlideshow(container, category, folder, files) {
    let currentSlideIndex = 0;
    let slideshowInterval = null;
    let useSecondImage = false;

    // Take up to 3 images for the slideshow
    const slideshowImages = files.slice(0, 3).map(f => typeof f === 'object' ? f.src : f);

    if (slideshowImages.length <= 1) return; // No slideshow needed

    // Start slideshow on hover
    container.addEventListener('mouseenter', () => {
        currentSlideIndex = 0;
        useSecondImage = false;

        // Immediately show the second image on hover for instant feedback
        const img1 = container.querySelector('.gallery-img');
        const img2 = container.querySelector('.gallery-img-alt');

        if (img1 && img2 && slideshowImages.length > 1) {
            // Show second image immediately
            currentSlideIndex = 1;
            const nextImage = slideshowImages[1];
            const path = `assets/${category}/${folder}/${nextImage}`;

            img2.src = encodePath(path);
            img2.style.opacity = '1';
            img1.style.opacity = '0';
            // Keep useSecondImage false so next interval will use img1
            // This ensures proper alternation: img2 -> img1 -> img2 -> img1...
        }

        // Start cycling through images on hover
        slideshowInterval = setInterval(() => {
            currentSlideIndex = (currentSlideIndex + 1) % slideshowImages.length;
            const nextImage = slideshowImages[currentSlideIndex];

            // Find both image elements (primary and secondary for crossfade)
            const img1 = container.querySelector('.gallery-img');
            const img2 = container.querySelector('.gallery-img-alt');

            if (img1 && img2) {
                const path = `assets/${category}/${folder}/${nextImage}`;

                if (useSecondImage) {
                    // Load into img2, fade it in
                    img2.src = encodePath(path);
                    img2.style.opacity = '1';
                    img1.style.opacity = '0';
                } else {
                    // Load into img1, fade it in
                    img1.src = encodePath(path);
                    img1.style.opacity = '1';
                    img2.style.opacity = '0';
                }

                useSecondImage = !useSecondImage;
            }
        }, 2200); // Change image every 2.2 seconds
    });

    // Stop slideshow when mouse leaves
    container.addEventListener('mouseleave', () => {
        if (slideshowInterval) {
            clearInterval(slideshowInterval);
            slideshowInterval = null;
        }

        // Reset to first image
        const img1 = container.querySelector('.gallery-img');
        const img2 = container.querySelector('.gallery-img-alt');

        if (img1 && img2) {
            const firstImage = slideshowImages[0];
            const path = `assets/${category}/${folder}/${firstImage}`;
            img1.src = encodePath(path);
            img1.style.opacity = '1';
            img2.style.opacity = '0';
        }
    });
}


// Unified Helper for rendering media (images/video)
// Supports both nested paths (assets/Category/Project/File) and flat paths (assets/Category/File)
// If folder is '.', it treats it as a direct child of category
function renderMediaItem(container, category, folder, filename) {
    let path;
    if (folder === '.' || !folder) {
        path = `assets/${category}/${filename}`;
    } else {
        path = `assets/${category}/${folder}/${filename}`;
    }

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
        // Create two images for crossfade effect (slideshow support)
        const img1 = document.createElement('img');
        img1.src = encodedPath;
        img1.alt = filename;
        img1.className = 'gallery-img';
        img1.loading = 'lazy'; // Optimization: Lazy load
        img1.style.opacity = '1';

        // Second image for hover slideshow (initially hidden)
        const img2 = document.createElement('img');
        img2.src = encodedPath; // Placeholder, will be swapped on hover
        img2.alt = filename;
        img2.className = 'gallery-img-alt';
        img2.loading = 'lazy'; // Optimization: Lazy load
        img2.style.opacity = '0';

        img1.addEventListener('load', () => {
            container.classList.remove('loading');
            container.classList.add('loaded');
        });
        img1.addEventListener('error', () => {
            container.classList.remove('loading');
        });

        container.appendChild(img2); // Add second image first (behind)
        container.appendChild(img1); // Add first image on top
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
        // Strip extension AND leading numbers (e.g., "1. Name" -> "Name")
        h4.textContent = filename.replace(/\.[^/.]+$/, "").replace(/^\d+\.\s*/, "");

        info.appendChild(h4);
        item.appendChild(info);

        projectGrid.appendChild(item);
        observer.observe(item);
    });

    // Save scroll position before showing overlay
    savedScrollPosition = window.scrollY || document.documentElement.scrollTop;

    // Update URL hash for shareable links (only for project views, not legacy)
    if (category && projectName) {
        updateUrlHash(category, projectName);
    }

    // Show Overlay
    projectView.style.display = 'block';
    setTimeout(() => projectView.classList.add('active'), 10);
    document.body.style.overflow = 'hidden';
}

function closeProjectView() {
    const projectView = document.getElementById('project-view');
    projectView.classList.remove('active');

    // Clear URL hash when closing
    clearUrlHash();

    setTimeout(() => {
        projectView.style.display = 'none';
        document.body.style.overflow = 'auto'; // Re-enable scroll
        // Restore scroll position
        window.scrollTo(0, savedScrollPosition);
    }, 300);
}


// Custom Mobile Dropdown Logic
function toggleDropdown() {
    const list = document.getElementById('mobile-filter-options');
    list.classList.toggle('active');
}

function selectFilter(categorySlug) {
    const list = document.getElementById('mobile-filter-options');
    const selectedText = document.querySelector(`.option-item[onclick="selectFilter('${categorySlug}')"]`).textContent;
    const selectedDisplay = document.querySelector('.selected-option');

    // Update Display Text
    selectedDisplay.textContent = selectedText.toUpperCase();

    // Update Active State
    document.querySelectorAll('.option-item').forEach(item => item.classList.remove('selected'));
    document.querySelector(`.option-item[onclick="selectFilter('${categorySlug}')"]`).classList.add('selected');

    // Close Dropdown
    list.classList.remove('active');

    // Trigger actual filter (pass null so filterGallery uses fallback button activation)
    filterGallery(categorySlug, null);
}

// Close custom dropdown when clicking outside
window.addEventListener('click', function (e) {
    const dropdown = document.querySelector('.custom-dropdown');
    const list = document.getElementById('mobile-filter-options');
    if (dropdown && !dropdown.contains(e.target) && list.classList.contains('active')) {
        list.classList.remove('active');
    }
});

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
    // Strip extension AND leading numbers
    caption.textContent = imgName.replace(/\.[^/.]+$/, "").replace(/^\d+\.\s*/, "");
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

    // 3. Adjust grid columns
    const grid = document.getElementById('gallery-grid');
    // Ensure we are always on default grid (remove specific column overrides if any were present)
    grid.style.gridTemplateColumns = '';

    // Re-assign span classes to maintain layout rhythm for visible items
    reassignLayoutPattern();
}

function reassignLayoutPattern() {
    const visibleItems = Array.from(document.querySelectorAll('.gallery-item')).filter(item => item.style.display !== 'none');

    visibleItems.forEach((item, index) => {
        // Remove old span classes
        item.classList.remove('span-3-2', 'span-2-2', 'span-2-1', 'span-1-2');

        // Check item type based on data attributes
        const isFeatured = item.getAttribute('data-featured') === 'true';
        // Check if it is a project folder (has data-project attribute)
        const isProject = item.getAttribute('data-project') === 'true';

        // Featured projects: always 3x2 (full width x 2 rows)
        if (isFeatured) {
            item.classList.add('span-3-2');
        }
        // Non-featured project folders: random dynamic sizing
        else if (isProject) {
            // Use the visible index to ensure good distribution, or just original?
            // User seems to prefer stable shapes? Let's stick to the reassign logic for now 
            // but ensure we identify projects correctly.
            // Using text content or hash is better than index for stability, but index is okay for packing.
            const spanClass = getRandomProjectSpan(index);
            if (spanClass) item.classList.add(spanClass);
        }
    });
}
