Extract the entire ZIP before opening.
Windows: double-click start.bat (Node.js must already be installed).
macOS/Linux: run node serve.cjs and open the printed URL.
Alternative: python -m http.server 8000 --bind 127.0.0.1
Then open http://127.0.0.1:8000
Keep the server running while viewing. Stop with Ctrl+C.
The viewer, models, and uploaded media run offline. Linked online content still needs internet.
To publish, upload the extracted contents to a static web host, preserving assets/ and vendor/. Put index.html at the root of the presentation folder. Share its HTTPS folder URL (or its index.html URL). Uploading the ZIP as a downloadable file does not publish a website. Visitors do not need Node.js; the launchers are for local preview only.
Browser file:// security restrictions cannot be disabled by the viewer. Use Export Offline HTML for a single file that opens directly.
