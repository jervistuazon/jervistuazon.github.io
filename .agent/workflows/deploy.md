---
description: How to deploy the portfolio to GitHub Pages with cache busting
---

# Deploy Portfolio

This workflow ensures your portfolio is properly minified, versioned for cache busting, and pushed to GitHub Pages.

// turbo-all
1. **Run the Build Script**
   Run the build script to minify assets and update versioning in `index.html`:
   ```powershell
   node build.js
   ```

2. **Generate Project Pages**
   Ensure all individual project pages are up to date:
   ```powershell
   node generate-project-pages.js
   ```

3. **Deploy to GitHub**
   Run the deployment script to push changes to your repository:
   ```powershell
   ./deploy.bat
   ```

> [!TIP]
> This process automatically handles minification and "cache busting" (ensuring returning visitors see your latest updates immediately).
