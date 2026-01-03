// Generate SEO Project Pages
// Run with: node generate-project-pages.js

const fs = require('fs');
const path = require('path');

// Load gallery data (handle window references for Node.js)
let galleryDataContent = fs.readFileSync('gallery-data.js', 'utf8');
galleryDataContent = galleryDataContent.replace(/window\./g, 'global.');
eval(galleryDataContent);

const galleryData = global.galleryData;

// Helper to create URL-safe slugs
function slugify(text) {
    return text.toLowerCase()
        .replace(/ - F$| -F$/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Generate project page HTML
function generateProjectPage(category, projectName, thumbnailFile) {
    const categorySlug = slugify(category);
    const projectSlug = slugify(projectName);
    const cleanName = projectName.replace(/ - F$| -F$/, '');
    const thumbnailPath = `../assets/${encodeURIComponent(category)}/${encodeURIComponent(projectName)}/${encodeURIComponent(thumbnailFile)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${cleanName} | Jervis Tuazon - 3D Visual Artist</title>
    <meta name="description" content="${cleanName} - ${category} project by Jervis Tuazon, Senior Visual Artist specializing in architectural visualization.">
    
    <!-- Open Graph / Social Media -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="${cleanName} | Jervis Tuazon">
    <meta property="og:description" content="${cleanName} - ${category} visualization project">
    <meta property="og:image" content="${thumbnailPath}">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${cleanName} | Jervis Tuazon">
    <meta name="twitter:description" content="${cleanName} - ${category} visualization project">
    
    <link rel="canonical" href="https://jervistuazon.com/projects/${projectSlug}.html">
    <link rel="icon" type="image/png" href="../assets/favicon.png">
    
    <style>
        body {
            font-family: 'Manrope', sans-serif;
            background: #0a0a0a;
            color: #f5f5f5;
            margin: 0;
            padding: 40px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .container {
            max-width: 800px;
            text-align: center;
        }
        h1 {
            font-size: 2.5rem;
            font-weight: 300;
            margin-bottom: 0.5rem;
        }
        .category {
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 2rem;
        }
        .thumbnail {
            max-width: 100%;
            max-height: 60vh;
            object-fit: contain;
            margin-bottom: 2rem;
            border-radius: 4px;
        }
        .loading {
            color: #888;
        }
        a {
            color: #fff;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <p class="category">${category}</p>
        <h1>${cleanName}</h1>
        <img src="${thumbnailPath}" alt="${cleanName}" class="thumbnail">
        <p class="loading">Redirecting to full gallery...</p>
        <p><a href="../index.html#project/${categorySlug}/${projectSlug}">Click here if not redirected</a></p>
    </div>
    
    <script>
        // Redirect to main site with project overlay
        window.location.href = '../index.html#project/${categorySlug}/${projectSlug}';
    </script>
</body>
</html>`;
}

// Categories to process
const categories = [
    'Commercial',
    'Hospitality',
    'Institutional',
    'Mix Used Development',
    'Residential',
    'Residential Development'
];

// Create projects directory if not exists
const projectsDir = path.join(__dirname, 'projects');
if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir);
}

// Generate pages for each project
let generated = 0;
const projectList = [];

categories.forEach(category => {
    const categoryData = galleryData[category];
    if (!categoryData || typeof categoryData !== 'object') return;

    Object.keys(categoryData).forEach(projectName => {
        if (projectName === '_standalone') return;

        const files = categoryData[projectName];
        if (!files || files.length === 0) return;

        const thumbnailFile = files[0];
        const projectSlug = slugify(projectName);
        const categorySlug = slugify(category);
        const filename = `${projectSlug}.html`;
        const filepath = path.join(projectsDir, filename);

        const html = generateProjectPage(category, projectName, thumbnailFile);
        fs.writeFileSync(filepath, html);

        projectList.push({
            category,
            projectName,
            slug: projectSlug,
            url: `projects/${filename}`
        });

        generated++;
        console.log(`Generated: ${filename}`);
    });
});

console.log(`\nTotal pages generated: ${generated}`);

// Generate sitemap
const sitemapEntries = projectList.map(p =>
    `  <url>\n    <loc>https://jervistuazon.com/${p.url}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`
).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://jervistuazon.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${sitemapEntries}
</urlset>`;

fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);
console.log('Generated: sitemap.xml');

// Generate robots.txt
const robots = `User-agent: *
Allow: /

Sitemap: https://jervistuazon.com/sitemap.xml`;

fs.writeFileSync(path.join(__dirname, 'robots.txt'), robots);
console.log('Generated: robots.txt');

console.log('\nDone! SEO pages ready.');
