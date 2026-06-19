// Gallery Data is loaded from gallery-data.js (const galleryData = ...)

let currentGalleryImages = [];
let currentImageIndex = 0;
let currentFolder = '';
let savedScrollPosition = 0; // For scroll position memory

// Load More / Pagination Globals
const ITEMS_PER_PAGE = 24;
let visibleLimit = ITEMS_PER_PAGE;
let currentFilter = 'all';
let allGalleryItems = [];
let galleryRevealObserver = null;

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
    const heroSection = document.getElementById('hero');

    const updateNavbarVisibility = () => {
        if (!navbar || !heroSection) return;

        const scrollY = window.scrollY || window.pageYOffset;
        const heroHeight = heroSection.offsetHeight || window.innerHeight;

        // Navbar appears when the user scrolls past the hero section.
        // We use a small threshold (50px before the end of the hero section) to make the transition smooth.
        if (scrollY >= heroHeight - 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', updateNavbarVisibility, { passive: true });
    window.addEventListener('resize', updateNavbarVisibility);
    updateNavbarVisibility();

    initHeroFade();

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

    // Filter button interactions (desktop)
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const category = button.dataset.filter || button.textContent.toLowerCase();
            filterGallery(category, event);
        });
    });

    // Custom dropdown interactions (mobile)
    const dropdownButton = document.querySelector('.selected-option');
    if (dropdownButton) {
        dropdownButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleDropdown();
        });
        dropdownButton.addEventListener('keydown', handleDropdownButtonKeydown);
    }

    const optionButtons = document.querySelectorAll('.option-item');
    optionButtons.forEach(button => {
        const isDefault = button.dataset.filter === 'all';
        button.classList.toggle('selected', isDefault);
        button.setAttribute('aria-selected', isDefault.toString());
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const category = button.dataset.filter || button.textContent.toLowerCase();
            selectFilter(category, button.textContent);
        });
        button.addEventListener('keydown', handleDropdownOptionKeydown);
    });

    // Scroll Spy for active nav link
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    const scrollSpy = () => {
        const scrollY = window.scrollY || window.pageYOffset;
        
        sections.forEach(current => {
            const sectionHeight = current.offsetHeight;
            const sectionTop = current.offsetTop - 150;
            const sectionId = current.getAttribute('id');
            
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    };
    window.addEventListener('scroll', scrollSpy, { passive: true });
    scrollSpy();

    // Intercept hash link clicks for smooth scrolling via Lenis (fixes unresponsive double-clicks)
    document.addEventListener('click', (e) => {
        const target = e.target;
        const link = target.closest('a[href^="#"]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (href.startsWith('#project/')) return;

        const id = href.slice(1);
        if (!id) return;

        const el = document.getElementById(id);
        if (!el) return;

        e.preventDefault();
        if (typeof lenis !== 'undefined' && lenis) {
            lenis.scrollTo(el);
        }
    });
});

function initHeroFade() {
    const heroSection = document.querySelector('.hero-section');
    if (!heroSection) {
        return;
    }

    let isTicking = false;

    const updateHeroFade = () => {
        const scrollY = window.scrollY || window.pageYOffset;
        const heroHeight = heroSection.offsetHeight || 1;
        const fadeDistance = heroHeight * 0.8;
        const progress = Math.min(scrollY / fadeDistance, 1);
        const opacity = Math.max(1 - progress, 0);

        heroSection.style.setProperty('--hero-fade', opacity.toFixed(3));
        isTicking = false;
    };

    const onScroll = () => {
        if (!isTicking) {
            window.requestAnimationFrame(updateHeroFade);
            isTicking = true;
        }
    };

    updateHeroFade();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
}

// Utility function to encode file paths for URLs (handle spaces and special characters)
function encodePath(path) {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

// Utility function to check if a file is a video
function isVideo(filename) {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function isExternalMediaPath(filename) {
    return /^(?:assets|presentation|projects|s)\//.test(filename);
}

const INTERACTIVE_PRESENTATION_DEMO_URL = 'presentation/interactive_presentation_demo/?v=1781874700083';

function getPresentationHref(itemData) {
    if (itemData && itemData.href) {
        return itemData.href;
    }

    const filename = itemData && itemData.filename ? itemData.filename : '';
    if (filename.includes('Interactive Presentation Demo')) {
        return INTERACTIVE_PRESENTATION_DEMO_URL;
    }

    return null;
}

function getGalleryItemLabel(filename, fallback = '') {
    return (fallback || filename)
        .replace(/\.[^/.]+$/, "")
        .replace(/^\d+\.\s*/, "")
        .replace(/\s-\s*F$/, "");
}

// Video Autoplay on Viewport Visibility
// Uses Intersection Observer to play videos when 50%+ visible, pause when not
const videoAutoplayObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target;

        if (entry.isIntersecting) {
            // Video is at least 50% visible - play it
            const playPromise = video.play();

            // Handle play promise to avoid console errors
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Autoplay was prevented (browser policy), silently ignore
                    // Video will remain paused until user interacts
                });
            }
        } else {
            // Video is less than 50% visible - pause it
            video.pause();
        }
    });
}, {
    root: null, // Use viewport as root
    rootMargin: '0px',
    threshold: 0.5 // Trigger when 50% of video is visible
});

// Function to register a video element for viewport-based autoplay
function observeVideoForAutoplay(videoElement) {
    if (videoElement && videoElement.hasAttribute('data-autoplay-on-visible')) {
        videoAutoplayObserver.observe(videoElement);
    }
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

// Manual size overrides for specific standalone images/videos
const standaloneSizeOverrides = {
    'Siglap Rd Singapore.png': 'span-1-2',
    // Interactive Presentation videos - full width (non-featured ones)
    'Interactive Presentation Apartment Interior.mp4': 'span-3-2',
    'Interactive Presentation Singapore House.mp4': 'span-3-2'
};

// Simple seeded random for consistent layout on page reload
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// Fisher-Yates shuffle with seeded random to randomize order but keep it consistent
function seededShuffle(array, seed) {
    let m = array.length, t, i;
    // While there remain elements to shuffle…
    while (m) {
        // Pick a remaining element…
        i = Math.floor(seededRandom(seed + m) * m--);

        // And swap it with the current element.
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
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
// 30% 1x2, 30% 2x1, 40% 1x1
// Checks for manual overrides first
function getRandomStandaloneSpan(index, filename = null) {
    // Check for manual override first
    if (filename && standaloneSizeOverrides[filename]) {
        return standaloneSizeOverrides[filename];
    }
    const rand = seededRandom(index * 7919 + 123);

    // Distribution: 30% 1x2, 30% 2x1, 40% 1x1
    if (rand < 0.4) {
        return ''; // 40% Chance of 1x1 (no span class)
    } else if (rand < 0.7) {
        return 'span-1-2'; // 30% Chance of 1x2
    } else {
        return 'span-2-1'; // 30% Chance of 2x1
    }
}

// Mobile Aspect Ratio Classes for Pinterest-style masonry
// Ratios: 4:5, 5:4, 2:3, 5:7 (vertical/portrait, excluding 1:2 which is too tall)
const mobileAspectRatios = ['mobile-ar-4-5', 'mobile-ar-5-4', 'mobile-ar-2-3', 'mobile-ar-5-7'];
// Project specific ratios (Tallest options only for prominence)
const mobileProjectAspectRatios = ['mobile-ar-2-3', 'mobile-ar-5-7'];

function getMobileAspectRatioClass(index, itemType) {
    const rand = seededRandom(index * 2803 + 77);

    if (itemType === 'project') {
        return mobileProjectAspectRatios[Math.floor(rand * mobileProjectAspectRatios.length)];
    }

    return mobileAspectRatios[Math.floor(rand * mobileAspectRatios.length)];
}



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
    // Remove the - F suffix first (tolerant of whitespace)
    const cleaned = folderName.replace(/\s-\s*F\s*$/, '');

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
    galleryRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    }, { threshold: 0.1 });

    // Collect all projects from all categories
    const allProjects = [];
    const featuredProjects = [];

    // Categories to process (exclude HERO SHOT)
    const categoriesToProcess = [
        'Commercial',
        'Hospitality',
        'Institutional',
        'Residential',
        'Interactive Presentation'
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
                files.forEach((entry, fileIndex) => {
                    const isObjectEntry = typeof entry === 'object';
                    const filename = isObjectEntry ? entry.src : entry;
                    const label = isObjectEntry ? entry.label : null;
                    const href = isObjectEntry ? entry.href : null;
                    // Check if featured from filename (ends with - F or -F before extension)
                    const isFeaturedStandalone = isObjectEntry && typeof entry.featured === 'boolean'
                        ? entry.featured
                        : /\s-\s*F\.[^.]+$/.test(filename);

                    const standaloneItem = {
                        type: 'standalone',
                        category: categoryName,
                        categorySlug: categoryName.toLowerCase().replace(/ /g, '-'),
                        filename: filename,
                        label: label,
                        href: href,
                        fileIndex: fileIndex,
                        standaloneFiles: files.map(file => typeof file === 'object' ? file.src : file),
                        featured: isFeaturedStandalone
                    };

                    if (isFeaturedStandalone) {
                        featuredProjects.push(standaloneItem);
                    }
                    allProjects.push(standaloneItem);
                });
                continue;
            }

            // Check if featured (ends with - F or -F, tolerant of spaces)
            const isFeatured = /\s-\s*F\s*$/.test(projectName);

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


    // Sort: Featured first, then project folders, then standalone last
    const nonFeatured = allProjects.filter(p => !p.featured);
    const projectFolders = nonFeatured.filter(p => p.type === 'project');
    let standalone = nonFeatured.filter(p => p.type === 'standalone');

    // Manually move 'Rangoon Road Singapore.webp' to projectFolders group to appear with Mansion/ME House
    const changenowIndex = standalone.findIndex(p => p.filename === 'Rangoon Road Singapore.webp');
    if (changenowIndex !== -1) {
        const itemToMove = standalone.splice(changenowIndex, 1)[0];
        projectFolders.push(itemToMove);
    }

    // Randomize standalone images order
    standalone = seededShuffle(standalone, 999);

    // Concatenate in order: Featured -> Projects -> Standalone
    const sortedProjects = [...featuredProjects, ...projectFolders, ...standalone];
    allGalleryItems = sortedProjects;

    // Initialize view with limit. Items beyond the first page are not built until needed.
    filterGallery('all');
}

function renderGalleryItem(itemData, index) {
    const item = document.createElement('button');
    item.type = 'button';

    // Apply layout: all items scaled to the same single-column width
    item.className = 'gallery-item fade-in-scroll';

    // Set category for filtering
    item.setAttribute('data-category', itemData.categorySlug);
    if (itemData.featured) {
        item.setAttribute('data-featured', 'true');
    }

    // Create card media wrapper
    const mediaWrapper = document.createElement('div');
    mediaWrapper.className = 'card-media-wrapper';
    item.appendChild(mediaWrapper);

    if (itemData.type === 'project') {
        item.setAttribute('data-project', 'true');
        item.setAttribute('data-project-name', itemData.projectName);
        
        item.onclick = () => openGallery(itemData.category, itemData.projectName);
        renderMediaItem(mediaWrapper, itemData.category, itemData.projectName, itemData.thumbSrc);

        // Display name: extract just the project name (before first dash)
        const projectParts = parseProjectName(itemData.projectName);
        const displayName = projectParts.name;
        const metadata = [projectParts.location, projectParts.date].filter(Boolean);

        renderInfo(item, mediaWrapper, itemData.category, displayName, metadata, 'Explore Project');
        item.setAttribute('aria-label', `Open project: ${displayName}`);

        // Auto-run slideshow for multi-image projects
        const imageCount = itemData.files.length;
        if (imageCount > 1) {
            setupHoverSlideshow(item, itemData.category, itemData.projectName, itemData.files);
        }
    } else if (itemData.type === 'standalone') {
        item.setAttribute('data-standalone', 'true');
        item.setAttribute('data-filename', itemData.filename);

        const presentationHref = getPresentationHref(itemData);
        const isInteractive = presentationHref || itemData.filename.includes('Interactive Presentation Demo');

        // Special handling for interactive presentations - redirect to presentation page
        if (presentationHref) {
            item.onclick = () => {
                window.location.href = presentationHref;
            };
        } else {
            item.onclick = () => {
                currentFolder = itemData.category;
                currentGalleryImages = itemData.standaloneFiles;
                openLightbox(itemData.fileIndex);
            };
        }
        renderMediaItem(mediaWrapper, itemData.category, '.', itemData.filename);
        
        // Strip extension, leading numbers, and "- F" featured marker from display name
        const standaloneLabel = getGalleryItemLabel(itemData.filename, itemData.label);
        const metadata = isInteractive ? 'Interactive Presentation' : 'Architectural Rendering';
        const ctaText = isInteractive ? 'Explore Presentation' : 'View Rendering';

        renderInfo(item, mediaWrapper, itemData.category, standaloneLabel, metadata, ctaText);
        item.setAttribute('aria-label', presentationHref ? `Explore interactive presentation: ${standaloneLabel}` : `Open image: ${standaloneLabel}`);
    } else if (itemData.type === 'video') {
        // Video item
        const videoLabel = itemData.filename.replace(/\.[^/.]+$/, "").replace(/^\d+\.\s*/, "").replace(/\s-\s*F$/, "");

        // Special handling for Interactive Presentation Demo - redirect to presentation page
        if (itemData.filename.includes('Interactive Presentation Demo')) {
            item.onclick = () => {
                window.location.href = INTERACTIVE_PRESENTATION_DEMO_URL;
            };
        } else {
            item.onclick = () => {
                currentFolder = 'Video';
                currentGalleryImages = galleryData['Video'];
                openLightbox(itemData.fileIndex);
            };
        }
        renderMediaItem(mediaWrapper, 'Video', '.', itemData.filename);
        renderInfo(item, mediaWrapper, 'Video', videoLabel, 'Cinematic Animation', 'Play Video');
        item.setAttribute('aria-label', `Play video: ${videoLabel}`);
    }

    return item;
}

// Setup auto-running slideshow for project folders with multiple images
function setupHoverSlideshow(container, category, folder, files) {
    let currentSlideIndex = 0;
    let slideshowInterval = null;
    let useSecondImage = false;

    // Take up to 3 images for the slideshow
    const slideshowImages = files.slice(0, 3).map(f => typeof f === 'object' ? f.src : f);

    if (slideshowImages.length <= 1) return; // No slideshow needed

    // Define slideshow logic
    const startSlideshow = () => {
        // Avoid starting multiple intervals
        if (slideshowInterval) return;

        currentSlideIndex = 0;
        useSecondImage = false;

        // Immediately show the second image on hover/touch for instant feedback
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

        // Start cycling through images
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
    };

    const stopSlideshow = () => {
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
    };

    // Desktop: Mouse events
    container.addEventListener('mouseenter', startSlideshow);
    container.addEventListener('mouseleave', stopSlideshow);

    // Mobile: Touch events (Touch = Hover)
    // passive: true allows scrolling to continue smoothly while logic runs
    container.addEventListener('touchstart', startSlideshow, { passive: true });
    container.addEventListener('touchend', stopSlideshow);
    container.addEventListener('touchcancel', stopSlideshow);
}


// Unified Helper for rendering media (images/video)
// Supports both nested paths (assets/Category/Project/File) and flat paths (assets/Category/File)
// If folder is '.', it treats it as a direct child of category
function renderMediaItem(container, category, folder, filename) {
    let path;
    if (isExternalMediaPath(filename)) {
        path = filename;
    } else if (folder === '.' || !folder) {
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
        video.preload = 'metadata'; // Only load metadata until in view
        video.className = 'gallery-video';
        video.setAttribute('data-autoplay-on-visible', 'true'); // Mark for Intersection Observer

        video.addEventListener('loadeddata', () => {
            container.classList.remove('loading');
            container.classList.add('loaded');
        });
        video.addEventListener('error', () => {
            container.classList.remove('loading');
        });

        container.appendChild(video);

        // Observe this video for viewport-based autoplay
        observeVideoForAutoplay(video);
    } else {
        // Create two images for crossfade effect (slideshow support)
        const img1 = document.createElement('img');
        img1.src = encodedPath;
        img1.alt = filename;
        img1.className = 'gallery-img';
        img1.loading = 'lazy'; // Optimization: Lazy load
        img1.decoding = 'async';
        img1.style.opacity = '1';

        // Second image for hover slideshow (initially hidden)
        const img2 = document.createElement('img');
        img2.src = encodedPath; // Placeholder, will be swapped on hover
        img2.alt = filename;
        img2.className = 'gallery-img-alt';
        img2.loading = 'lazy'; // Optimization: Lazy load
        img2.decoding = 'async';
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

function renderInfo(container, mediaWrapper, category, title, metadata, ctaText) {
    const info = document.createElement('div');
    info.className = 'item-info';

    const cat = document.createElement('span');
    cat.className = 'item-category';
    cat.textContent = category;
    info.appendChild(cat);

    const h4 = document.createElement('h4');
    h4.textContent = title;
    info.appendChild(h4);

    if (metadata) {
        if (Array.isArray(metadata)) {
            metadata.forEach(metaText => {
                if (metaText && metaText.toLowerCase() !== category.toLowerCase()) {
                    const meta = document.createElement('span');
                    meta.className = 'item-metadata';
                    meta.textContent = metaText;
                    info.appendChild(meta);
                }
            });
        } else {
            if (metadata.toLowerCase() !== category.toLowerCase()) {
                const meta = document.createElement('span');
                meta.className = 'item-metadata';
                meta.textContent = metadata;
                info.appendChild(meta);
            }
        }
    }

    container.appendChild(info);

    if (mediaWrapper && ctaText) {
        const cta = document.createElement('span');
        cta.className = 'card-cta';
        cta.innerHTML = `${ctaText} <span class="arrow">→</span>`;
        mediaWrapper.appendChild(cta);
    }
}

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

    // Add data-featured attribute if project is featured
    const isFeatured = projectName && /\s-\s*F\s*$/.test(projectName);
    if (isFeatured) {
        projectView.setAttribute('data-featured', 'true');
    } else {
        projectView.removeAttribute('data-featured');
    }

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

        const item = document.createElement('button');
        item.type = 'button';
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
        const lightboxLabel = filename.replace(/\.[^/.]+$/, "").replace(/^\d+\.\s*/, "");
        h4.textContent = lightboxLabel;

        info.appendChild(h4);
        item.appendChild(info);
        item.setAttribute('aria-label', `Open image: ${lightboxLabel}`);

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
    setTimeout(() => {
        projectView.classList.add('active');
        // Initialize Lenis for Project View Overlay
        if (!projectLenis) {
            projectLenis = new Lenis({
                wrapper: projectView,
                content: projectView,
                duration: 1.2,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                orientation: 'vertical',
                gestureOrientation: 'vertical',
                smoothWheel: true,
                wheelMultiplier: 1,
                smoothTouch: false,
                touchMultiplier: 2,
                infinite: false,
            });
        }

        // Set up ResizeObserver to update Lenis when project-grid changes size (e.g. as images/videos load)
        if (!projectLenisResizeObserver) {
            projectLenisResizeObserver = new ResizeObserver(() => {
                if (projectLenis) {
                    projectLenis.resize();
                }
            });
            projectLenisResizeObserver.observe(projectGrid);
        }
    }, 10);
    document.body.style.overflow = 'hidden';
    if (typeof lenis !== 'undefined') lenis.stop();
}

function closeProjectView() {
    const projectView = document.getElementById('project-view');
    projectView.classList.remove('active');

    // Disconnect and clean up ResizeObserver
    if (projectLenisResizeObserver) {
        projectLenisResizeObserver.disconnect();
        projectLenisResizeObserver = null;
    }

    // Destroy Project Lenis Instance
    if (projectLenis) {
        projectLenis.destroy();
        projectLenis = null;
    }

    // Clear URL hash when closing
    clearUrlHash();

    setTimeout(() => {
        projectView.style.display = 'none';
        document.body.style.overflow = 'auto'; // Re-enable scroll
        if (typeof lenis !== 'undefined') lenis.start();
        // Restore scroll position
        window.scrollTo(0, savedScrollPosition);
    }, 300);
}


// Custom Mobile Dropdown Logic
function toggleDropdown() {
    const list = document.getElementById('mobile-filter-options');
    const dropdownButton = document.querySelector('.selected-option');
    const isOpen = list.classList.toggle('active');
    if (dropdownButton) {
        dropdownButton.setAttribute('aria-expanded', isOpen.toString());
        if (isOpen) {
            const selectedOption = list.querySelector('.option-item.selected') || list.querySelector('.option-item');
            if (selectedOption) selectedOption.focus();
        }
    }
}

function selectFilter(categorySlug, selectedText) {
    const list = document.getElementById('mobile-filter-options');
    const selectedDisplay = document.querySelector('.selected-option');

    // Update Display Text
    selectedDisplay.textContent = selectedText.toUpperCase();

    // Update Active State
    document.querySelectorAll('.option-item').forEach(item => {
        const isSelected = item.dataset.filter === categorySlug;
        item.classList.toggle('selected', isSelected);
        item.setAttribute('aria-selected', isSelected.toString());
    });

    // Close Dropdown
    list.classList.remove('active');
    if (selectedDisplay) {
        selectedDisplay.setAttribute('aria-expanded', 'false');
        selectedDisplay.focus();
    }

    // Trigger actual filter (pass null so filterGallery uses fallback button activation)
    filterGallery(categorySlug, null);
}

function closeDropdown(returnFocus = false) {
    const list = document.getElementById('mobile-filter-options');
    const dropdownButton = document.querySelector('.selected-option');

    if (list) {
        list.classList.remove('active');
    }

    if (dropdownButton) {
        dropdownButton.setAttribute('aria-expanded', 'false');
        if (returnFocus) dropdownButton.focus();
    }
}

function handleDropdownButtonKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const list = document.getElementById('mobile-filter-options');
        if (!list || !list.classList.contains('active')) {
            toggleDropdown();
        }
    }
}

function handleDropdownOptionKeydown(event) {
    const options = Array.from(document.querySelectorAll('.option-item'));
    const currentIndex = options.indexOf(event.currentTarget);

    if (event.key === 'Escape') {
        event.preventDefault();
        closeDropdown(true);
        return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + direction + options.length) % options.length;
        options[nextIndex].focus();
        return;
    }

    if (event.key === 'Home') {
        event.preventDefault();
        options[0].focus();
        return;
    }

    if (event.key === 'End') {
        event.preventDefault();
        options[options.length - 1].focus();
    }
}

// Close custom dropdown when clicking outside
window.addEventListener('click', function (e) {
    const dropdown = document.querySelector('.custom-dropdown');
    const list = document.getElementById('mobile-filter-options');
    if (dropdown && !dropdown.contains(e.target) && list.classList.contains('active')) {
        closeDropdown();
    }
});

// --- Lightbox Functions (Modified to be opened from Project View) ---

function openLightbox(index) {
    currentImageIndex = index;
    updateLightboxContent();

    const lightbox = document.getElementById('lightbox');
    lightbox.style.display = 'block';
    setTimeout(() => lightbox.classList.add('active'), 10);

    if (typeof projectLenis !== 'undefined' && projectLenis) {
        projectLenis.stop();
    } else if (typeof lenis !== 'undefined' && lenis) {
        lenis.stop();
    }
}

function updateLightboxContent() {
    const container = document.getElementById('lightbox-content-container');
    const caption = document.getElementById('caption');
    const imgName = currentGalleryImages[currentImageIndex];

    if (!imgName) return;

    const path = isExternalMediaPath(imgName) ? imgName : `assets/${currentFolder}/${imgName}`;
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

// Note: Keyboard navigation is handled by the main keydown listener in DOMContentLoaded

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
        container.innerHTML = '';
    }, 300);

    if (typeof projectLenis !== 'undefined' && projectLenis) {
        projectLenis.start();
    } else if (typeof lenis !== 'undefined' && lenis) {
        lenis.start();
    }
}

// Note: encodePath() and isVideo() are defined at the top of this file (lines 82-90)

// Lenis Smooth Scrolling
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
});

let projectLenis = null;
let projectLenisResizeObserver = null;

function raf(time) {
    lenis.raf(time);
    if (projectLenis) projectLenis.raf(time);
    requestAnimationFrame(raf);
}

requestAnimationFrame(raf);

// Filter Gallery Function
function filterGallery(category, evt, isLoadMore = false) {
    // 0. Update Current Filter State
    if (!isLoadMore) {
        currentFilter = category;
        visibleLimit = ITEMS_PER_PAGE; // Reset limit on new filter
    }

    // 1. Update Buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        const isActive = btn.dataset.filter === category || (category === 'all' && btn.dataset.filter === 'all');
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive.toString());
    });

    // 2. Filter data and render only the currently visible count.
    const matchingItems = allGalleryItems.filter(itemData => {
        const itemCategory = itemData.categorySlug;
        const isFeatured = itemData.featured === true;

        // 'All' shows everything
        if (category === 'all') return true;

        // 'Featured' shows only featured items
        if (category === 'featured') return isFeatured;

        // Specific category match
        // Note: Some items might have category slugs like 'residential'
        return itemCategory === category;
    });

    const shouldPrioritizeInteractive = category === 'all' || category === 'featured';
    const pinnedPresentationPriority = [
        'presentation/interactive_presentation_demo/assets/thumbnail/thumbnail.png',
        'presentation/cinematic_web_presentation/Video/cinematic_web_presentation.mp4'
    ];

    const getPinnedPresentationRank = (item) => {
        const key = item.filename || item.thumbSrc || '';
        return pinnedPresentationPriority.indexOf(key);
    };

    const orderedItems = shouldPrioritizeInteractive
        ? [...matchingItems].sort((a, b) => {
            const aPinnedRank = getPinnedPresentationRank(a);
            const bPinnedRank = getPinnedPresentationRank(b);
            const aPinned = aPinnedRank !== -1;
            const bPinned = bPinnedRank !== -1;

            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            if (aPinned && bPinned) return aPinnedRank - bPinnedRank;

            // Keep deterministic order within the non-pinned group.
            return 0;
        })
        : matchingItems;

    // Determine which to show based on visibleLimit
    // (Load More increases visibleLimit)
    const itemsToShow = orderedItems.slice(0, visibleLimit);

    const grid = document.getElementById('gallery-grid');
    if (grid) {
        // If it's a new filter (not load more), clear existing items and reset observer
        if (!isLoadMore) {
            if (galleryRevealObserver) {
                grid.querySelectorAll('.gallery-item').forEach(item => galleryRevealObserver.unobserve(item));
            }
            grid.innerHTML = '';
        }

        const currentRenderedCount = isLoadMore ? grid.querySelectorAll('.gallery-item').length : 0;
        const newItemsToShow = orderedItems.slice(currentRenderedCount, visibleLimit);
        const fragment = document.createDocumentFragment();

        newItemsToShow.forEach((itemData, index) => {
            // index starts at 0 for new items, creating a clean stagger delay starting immediately
            const item = renderGalleryItem(itemData, index);
            item.style.transitionDelay = `${index * 35}ms`;
            fragment.appendChild(item);
        });

        grid.appendChild(fragment);

        // Target only the newly appended items for animation and observation
        const allItems = grid.querySelectorAll('.gallery-item');
        const newRenderedItems = Array.from(allItems).slice(currentRenderedCount);

        newRenderedItems.forEach(item => {
            if (galleryRevealObserver) {
                galleryRevealObserver.observe(item);
            }
            requestAnimationFrame(() => {
                item.style.opacity = '1';
                item.style.transform = 'translateY(0) scale(1)';
            });
        });

        // Trigger Lenis resize to adjust scroll dimensions for the newly added content
        if (typeof lenis !== 'undefined' && lenis) {
            lenis.resize();
        }
    }


    // 3. Handle "See More" Button Visibility
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadMoreContainer = document.getElementById('load-more-container');

    if (loadMoreBtn && loadMoreContainer) {
        if (orderedItems.length > visibleLimit) {
            loadMoreBtn.classList.remove('hidden');
            loadMoreContainer.style.display = 'flex';
        } else {
            loadMoreBtn.classList.add('hidden');
            loadMoreContainer.style.display = 'none';
        }
    }

    // 4. Adjust grid columns
    if (grid) {
        grid.style.gridTemplateColumns = '';
    }

    // Re-assign span classes to maintain layout rhythm for visible items
    reassignLayoutPattern();
}

function loadMoreItems() {
    visibleLimit += ITEMS_PER_PAGE;
    filterGallery(currentFilter, null, true);
}

function reassignLayoutPattern() {
    const visibleItems = Array.from(document.querySelectorAll('.gallery-item')).filter(item => item.style.display !== 'none');

    visibleItems.forEach((item) => {
        item.classList.remove('span-3-2', 'span-2-2', 'span-2-1', 'span-1-2', 'span-2-2-right');
    });
}

// Obfuscated Contact Info Injection
document.addEventListener('DOMContentLoaded', function () {
    const contactContainer = document.getElementById('contact-container');
    if (contactContainer) {
        // Obfuscate email: "jervistuazon" + "@" + "gmail.com"
        const user = 'jervistuazon';
        const domain = 'gmail.com';
        const email = `${user}@${domain}`;

        // Obfuscate phone: "+65" + " " + "9447" + " " + "4504"
        const p1 = '+65';
        const p2 = '9447';
        const p3 = '4504';
        const phone = `${p1} ${p2} ${p3}`;
        const phoneLink = `${p1}${p2}${p3}`;

        contactContainer.innerHTML = '';

        // Create Email Link
        const emailA = document.createElement('a');
        emailA.href = `mailto:${email}`;
        emailA.className = 'contact-link';
        emailA.innerHTML = `
            <span class="contact-icon-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M22 6l-10 7L2 6" />
                </svg>
            </span>
            ${email}
        `;

        // Create Phone Link
        const phoneA = document.createElement('a');
        phoneA.href = `tel:${phoneLink}`;
        phoneA.className = 'contact-link';
        phoneA.innerHTML = `
            <span class="contact-icon-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
            </span>
            ${phone}
        `;

        // Append to container
        contactContainer.appendChild(emailA);
        contactContainer.appendChild(phoneA);
    }
});
