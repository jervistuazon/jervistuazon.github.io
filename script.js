document.addEventListener('DOMContentLoaded', () => {
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
                entry.target.classList.remove('is-visible');
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
    // Video Hover Auto-play
    const videoItems = document.querySelectorAll('.gallery-video');
    videoItems.forEach(video => {
        video.parentElement.addEventListener('mouseenter', () => {
            video.play().catch(e => console.log('Auto-play prevented:', e));
        });
        video.parentElement.addEventListener('mouseleave', () => {
            video.pause();
            video.currentTime = 0; // Optional: Reset to start
        });
    });
});

// Gallery Filter
function filterGallery(category) {
    const items = document.querySelectorAll('.gallery-item');
    const buttons = document.querySelectorAll('.filter-btn');

    // Button active state
    buttons.forEach(btn => {
        // Check if the button's text content (converted to lowercase) matches the category
        // or if it's the 'all' button and the category is 'all'
        const btnText = btn.innerText.toLowerCase();
        const isActive = (btnText.includes(category) && category !== 'all') ||
            (category === 'all' && btnText === 'all') ||
            (category === 'ai' && btnText.includes('ai')); // Specific check for 'ai'

        if (isActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });


    items.forEach(item => {
        const itemCategory = item.getAttribute('data-category');

        if (category === 'all' || itemCategory === category) {
            item.style.display = 'block';
            setTimeout(() => {
                item.style.opacity = '1';
                item.style.transform = 'scale(1)';
            }, 50);
        } else {
            item.style.opacity = '0';
            item.style.transform = 'scale(0.9)';
            setTimeout(() => {
                item.style.display = 'none';
            }, 400); // Wait for transition
        }
    });

    // Refresh Lenis logic if needed (usually auto-handled)
}

// Lightbox Functions
function openLightbox(src, captionText, type = 'image') {
    const lightbox = document.getElementById('lightbox');
    const container = document.getElementById('lightbox-content-container');
    const caption = document.getElementById('caption');

    // Clear previous content
    container.innerHTML = '';

    let contentElement;

    if (type === 'video') {
        contentElement = document.createElement('video');
        contentElement.src = src;
        contentElement.controls = true;
        contentElement.autoplay = true;
        contentElement.className = 'lightbox-content';
    } else if (type === 'iframe' || type === 'html') {
        contentElement = document.createElement('iframe');
        contentElement.src = src;
        contentElement.className = 'lightbox-content';
        // Allow fullscreen for iframe content if needed
        contentElement.allow = "fullscreen";
    } else {
        // Default to image
        contentElement = document.createElement('img');
        contentElement.src = src;
        contentElement.className = 'lightbox-content';
    }

    container.appendChild(contentElement);
    caption.textContent = captionText;
    lightbox.style.display = 'block';

    // Slight timeout to allow display:block to apply before adding class for opacity transition
    setTimeout(() => {
        lightbox.classList.add('active');
    }, 10);

    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    const container = document.getElementById('lightbox-content-container');

    lightbox.classList.remove('active');

    setTimeout(() => {
        lightbox.style.display = 'none';
        document.body.style.overflow = 'auto';
        // Clear content to stop video playing
        container.innerHTML = '';
    }, 300); // Match transition duration
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
