(function ExclusiveFullscreenExtension() {
    console.log("[ExclusiveFullscreen] Initializing extension setup...");

    if (!Spicetify.Player || (!Spicetify.Playbar && !Spicetify.Topbar)) {
        console.warn("[ExclusiveFullscreen] Spicetify API not fully loaded yet. Retrying in 300ms...");
        setTimeout(ExclusiveFullscreenExtension, 300);
        return;
    }

    console.log("[ExclusiveFullscreen] Spicetify API detected. Building UI overlay...");

    // Configuration & Caching Options
    const USE_CACHE = true; // Set to false to completely disable caching
    const CACHE_KEY = "spicetify_fullscreen_lyrics_cache";
    const MAX_CACHE_ITEMS = 300;
    const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

    function getLyricsCache() {
        if (!USE_CACHE) return {};
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return {};
            const cache = JSON.parse(raw);
            const now = Date.now();

            for (const key in cache) {
                if (now - cache[key].timestamp > CACHE_TTL_MS) {
                    delete cache[key];
                }
            }
            return cache;
        } catch (e) {
            console.warn("[ExclusiveFullscreen] Failed to read lyrics cache:", e);
            return {};
        }
    }

    function saveLyricsCache(cache) {
        if (!USE_CACHE) return;
        try {
            const keys = Object.keys(cache);
            if (keys.length > MAX_CACHE_ITEMS) {
                keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
                while (keys.length > MAX_CACHE_ITEMS) {
                    delete cache[keys.shift()];
                }
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            console.warn("[ExclusiveFullscreen] Failed to save lyrics cache:", e);
        }
    }

    // 1. Create Fullscreen Overlay Element
    const overlay = document.createElement("div");
    overlay.id = "spicetify-custom-fullscreen";
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 99999;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f5f5f7;
        overflow: hidden;
        background: rgba(15, 15, 18, 0.88);
        backdrop-filter: blur(35px);
        cursor: default;
    `;

    overlay.innerHTML = `
        <!-- Dynamic Background Layer -->
        <div id="fs-bg-container" style="position: absolute; inset: -40px; z-index: 1; overflow: hidden; pointer-events: none;">
            <video id="fs-bg-video" autoplay loop muted playsinline style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; filter: blur(65px) brightness(0.85); transform: scale(1.25); display: none;"></video>
            <img id="fs-bg-art" src="" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; filter: blur(65px) brightness(0.85); transform: scale(1.25); display: block;" />
            <div style="position: absolute; inset: 0; background: rgba(12, 12, 16, 0.55); backdrop-filter: blur(25px);"></div>
        </div>

        <!-- Foreground Content Layer -->
        <div style="display: flex; gap: 5vw; align-items: center; width: 82vw; max-width: 1450px; z-index: 10; position: relative;">
            <img id="fs-album-art" src="" style="width: 34vw; height: 34vw; max-width: 480px; max-height: 480px; min-width: 260px; min-height: 260px; border-radius: 1.8vw; box-shadow: 0 2.5vw 5vw rgba(0,0,0,0.55); object-fit: cover;" />
            
            <div style="flex: 1; display: flex; flex-direction: column; gap: 1.6vh; min-width: 0;">
                <!-- Header Container using safe non-clipping drop shadow -->
                <div style="width: 100%; overflow: hidden;">
                    <h1 id="fs-track-title" style="margin: 0; font-size: clamp(2.2rem, 3.2vw, 3.6rem); font-weight: 700; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Track Title</h1>
                    <h3 id="fs-track-artist" style="margin: 0.8vh 0 0 0; font-size: clamp(1.2rem, 1.7vw, 1.9rem); font-weight: 500; color: #d0d0d5; opacity: 0.9; text-shadow: 0 1px 4px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Artist Name</h3>
                </div>
                
                <!-- Interactive Progress Bar & Time Stamps -->
                <div style="display: flex; flex-direction: column; gap: 1vh; margin-top: 0.8vh;">
                    <div id="fs-progress-container" style="width: 100%; height: 0.8vh; min-height: 6px; background: rgba(255,255,255,0.2); border-radius: 0.4vh; cursor: pointer; position: relative;">
                        <div id="fs-progress-bar" style="width: 0%; height: 100%; background: #1db954; border-radius: 0.4vh; transition: width 0.1s linear;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: clamp(0.9rem, 1.1vw, 1.25rem); font-weight: 600; color: #d0d0d5; text-shadow: 0 0.1vh 0.4vh rgba(0,0,0,0.8);">
                        <span id="fs-current-time">0:00</span>
                        <span id="fs-total-duration">0:00</span>
                    </div>
                </div>

                <!-- Clean Transparent Lyrics Box -->
                <div id="fs-lyrics-box" style="height: 26vh; min-height: 180px; max-height: 320px; overflow-y: auto; scrollbar-width: none; margin-top: 0.8vh; padding: 1.2vh 1.8vw; position: relative; -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, transparent 100%);">
                    <div id="fs-lyrics-content" style="display: flex; flex-direction: column; gap: 2.6vh; padding: 2.5vh 0 16vh 0; will-change: transform;">
                        <p style="margin: 0; color: #888;">Loading synchronized lyrics...</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Auto-hiding Exit Fullscreen Button -->
        <button id="fs-close-btn" style="position: absolute; top: 3.5vh; right: 3.5vw; padding: 1vh 1.8vw; border: none; background: #1db954; color: white; font-weight: 600; font-size: clamp(1rem, 1.2vw, 1.3rem); border-radius: 1.8vw; cursor: pointer; z-index: 10; box-shadow: 0 0.4vh 1.5vh rgba(0,0,0,0.4); opacity: 1; transition: opacity 0.3s ease;">Exit Fullscreen</button>

        <!-- Faint Watermark with Colorless Heart at Bottom Right Corner -->
        <div style="position: absolute; bottom: 2.5vh; right: 2.5vw; font-size: clamp(0.75rem, 0.9vw, 0.95rem); font-weight: 400; color: rgba(255, 255, 255, 0.25); letter-spacing: 0.05em; z-index: 10; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">
            Made with ♡ by Sotiris
        </div>

        <!-- Smooth Sliding Volume Indicator Bar -->
        <div id="fs-volume-indicator" style="position: absolute; right: 1.5vw; top: 50%; transform: translateY(-50%) translateX(60px); width: 8px; height: 180px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; opacity: 0; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease; z-index: 20; display: flex; flex-direction: column; justify-content: flex-end; backdrop-filter: blur(10px);">
            <div id="fs-volume-fill" style="width: 100%; height: 50%; background: #1db954; border-radius: 4px; transition: height 0.1s ease, background-color 0.3s ease, box-shadow 0.3s ease;"></div>
        </div>
    `;

    document.body.appendChild(overlay);

    const bgVideo = document.getElementById("fs-bg-video");
    const bgArt = document.getElementById("fs-bg-art");
    const albumArtEl = document.getElementById("fs-album-art");
    const progressBar = document.getElementById("fs-progress-bar");
    const progressContainer = document.getElementById("fs-progress-container");
    const currentTimeEl = document.getElementById("fs-current-time");
    const totalDurationEl = document.getElementById("fs-total-duration");
    const lyricsBox = document.getElementById("fs-lyrics-box");
    const lyricsContent = document.getElementById("fs-lyrics-content");
    const closeBtn = document.getElementById("fs-close-btn");
    const volumeIndicator = document.getElementById("fs-volume-indicator");
    const volumeFill = document.getElementById("fs-volume-fill");

    let parsedLyricsLines = [];
    let animationFrameId = null;
    let currentScrollTop = 0;
    let targetScrollTop = 0;
    let isUserScrolling = false;
    let userScrollTimeout = null;
    let volumeHideTimeout = null;
    let mouseIdleTimeout = null;
    let currentThemeHex = "#1db954";
    let currentThemeRgb = "29, 185, 84";
    let areLyricsAvailable = true;
    let isSyncedLyrics = true;

    overlay.addEventListener("mousemove", () => {
        if (overlay.style.display === "flex") {
            closeBtn.style.opacity = "1";
            overlay.style.cursor = "default";

            if (mouseIdleTimeout) clearTimeout(mouseIdleTimeout);
            mouseIdleTimeout = setTimeout(() => {
                if (overlay.style.display === "flex") {
                    closeBtn.style.opacity = "0";
                    overlay.style.cursor = "none";
                }
            }, 2000);
        }
    });

    progressContainer.addEventListener("click", (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        const duration = Spicetify.Player.getDuration();
        Spicetify.Player.seek(clickPosition * duration);
    });

    lyricsBox.addEventListener("wheel", () => {
        if (!areLyricsAvailable) return;
        isUserScrolling = true;
        if (userScrollTimeout) clearTimeout(userScrollTimeout);
        userScrollTimeout = setTimeout(() => {
            isUserScrolling = false;
        }, 3000);
    });

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    function showVolumeBar() {
        try {
            const currentVol = Spicetify.Player.getVolume() || 0;
            const volPercent = Math.max(0, Math.min(100, currentVol * 100));
            volumeFill.style.height = `${volPercent}%`;
            volumeFill.style.backgroundColor = currentThemeHex;
            volumeFill.style.boxShadow = `0 0 15px rgba(${currentThemeRgb}, 0.9)`;

            if (volumeHideTimeout) {
                clearTimeout(volumeHideTimeout);
                volumeHideTimeout = null;
            }

            volumeIndicator.style.opacity = "1";
            volumeIndicator.style.transform = "translateY(-50%) translateX(0px)";

            volumeHideTimeout = setTimeout(() => {
                volumeIndicator.style.opacity = "0";
                volumeIndicator.style.transform = "translateY(-50%) translateX(60px)";
                volumeHideTimeout = null;
            }, 1500);
        } catch (err) {
            console.warn("[ExclusiveFullscreen] Volume indicator error:", err);
        }
    }

    function extractThemeColorFromElement(imgEl) {
        try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = 40;
            canvas.height = 40;
            ctx.drawImage(imgEl, 0, 0, 40, 40);

            const imgData = ctx.getImageData(0, 0, 40, 40).data;
            let r = 0, g = 0, b = 0, count = 0;

            for (let i = 0; i < imgData.length; i += 16) {
                const red = imgData[i];
                const green = imgData[i + 1];
                const blue = imgData[i + 2];
                const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
                
                if (brightness > 20 && brightness < 235) {
                    r += red;
                    g += green;
                    b += blue;
                    count++;
                }
            }

            if (count > 0) {
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
            } else {
                r = 29; g = 185; b = 84;
            }

            let maxVal = Math.max(r, g, b);
            if (maxVal > 0) {
                let boost = 240 / maxVal;
                r = Math.min(255, Math.floor(r * boost));
                g = Math.min(255, Math.floor(g * boost));
                b = Math.min(255, Math.floor(b * boost));
            }

            const finalBrightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (finalBrightness < 100) {
                r = Math.min(255, r + 80);
                g = Math.min(255, g + 80);
                b = Math.min(255, b + 80);
            }

            currentThemeHex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            currentThemeRgb = `${r}, ${g}, ${b}`;

            progressBar.style.backgroundColor = currentThemeHex;
            progressBar.style.boxShadow = `0 0 15px rgba(${currentThemeRgb}, 0.9)`;
            closeBtn.style.backgroundColor = currentThemeHex;
        } catch (err) {
            console.warn("[ExclusiveFullscreen] CORS canvas extraction fallback triggered:", err);
            currentThemeHex = "#1db954";
            currentThemeRgb = "29, 185, 84";
            progressBar.style.backgroundColor = currentThemeHex;
            progressBar.style.boxShadow = `0 0 15px rgba(${currentThemeRgb}, 0.9)`;
            closeBtn.style.backgroundColor = currentThemeHex;
        }
    }

    async function loadCanvas() {
        bgVideo.pause();
        bgVideo.removeAttribute("src");
        bgVideo.srcObject = null;
        bgVideo.load();
        bgVideo.style.display = "none";
        bgArt.style.display = "block";

        setTimeout(() => {
            const nativeVideo = document.querySelector(".main-canvas-videoElement video, video[src^='blob:']");
            if (nativeVideo) {
                if (nativeVideo.srcObject) {
                    bgVideo.srcObject = nativeVideo.srcObject;
                } else if (typeof nativeVideo.captureStream === "function") {
                    try {
                        bgVideo.srcObject = nativeVideo.captureStream();
                    } catch (e) {
                        bgVideo.src = nativeVideo.src;
                    }
                } else {
                    bgVideo.src = nativeVideo.src;
                }
                bgVideo.style.display = "block";
                bgArt.style.display = "none";
                bgVideo.play().catch(() => {});
            } else {
                bgVideo.style.display = "none";
                bgArt.style.display = "block";
            }
        }, 600);
    }

    async function fetchAndParseLyrics() {
        const current = Spicetify.Player.data;
        const trackItem = current?.item || current?.track;
        
        if (!trackItem) {
            areLyricsAvailable = false;
            isSyncedLyrics = true;
            return [{ timeMs: 0, text: "No track playing." }];
        }

        const uri = trackItem.uri || trackItem.uid || "";
        let trackId = "";
        
        if (uri.startsWith("spotify:track:")) {
            trackId = uri.split(":")[2];
        } else if (trackItem.id) {
            trackId = trackItem.id;
        }

        if (!trackId) {
            areLyricsAvailable = false;
            isSyncedLyrics = true;
            return [{ timeMs: 0, text: "Lyrics unavailable for this track." }];
        }

        const cacheKey = `${trackId}`;
        const cache = getLyricsCache();

        if (cache[cacheKey] && Array.isArray(cache[cacheKey].data)) {
            console.log("[ExclusiveFullscreen] Loaded lyrics from cache for ID:", trackId);
            areLyricsAvailable = cache[cacheKey].available;
            isSyncedLyrics = cache[cacheKey].isSynced ?? true;
            return cache[cacheKey].data;
        }
        
        try {
            const url = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${trackId}?format=json&vocalRemoval=false&market=from_token`;
            console.log(`[ExclusiveFullscreen] Fetching lyrics via CosmosAsync for ID ${trackId}`);

            const jsonResponse = await Spicetify.CosmosAsync.get(url);
            const data = jsonResponse?.lyrics || jsonResponse;

            if (data && data.syncType === "UNSYNCED" && data.lines && Array.isArray(data.lines)) {
                isSyncedLyrics = false;
                areLyricsAvailable = true;
                const parsed = data.lines.map(line => ({ timeMs: 0, text: (line.words || "").trim() })).filter(l => l.text !== "");
                if (parsed.length > 0) {
                    const result = parsed;
                    if (USE_CACHE) {
                        cache[cacheKey] = { timestamp: Date.now(), available: true, isSynced: false, data: result };
                        saveLyricsCache(cache);
                    }
                    return result;
                }
            }

            let parsedResult = null;
            if (data && data.lines && Array.isArray(data.lines)) {
                isSyncedLyrics = true;
                const parsed = [];
                for (const line of data.lines) {
                    const timeMs = parseInt(line.startTimeMs, 10) || 0;
                    const text = (line.words || "").trim();
                    if (text !== "") {
                        parsed.push({ timeMs, text });
                    }
                }

                if (parsed.length > 0) {
                    areLyricsAvailable = true;
                    parsedResult = parsed;
                }
            }

            if (parsedResult && parsedResult.length > 0) {
                if (USE_CACHE) {
                    cache[cacheKey] = { timestamp: Date.now(), available: areLyricsAvailable, isSynced: true, data: parsedResult };
                    saveLyricsCache(cache);
                }
                return parsedResult;
            }
        } catch (err) {
            console.error("[ExclusiveFullscreen] CosmosAsync lyrics fetch exception:", err);
        }

        areLyricsAvailable = false;
        isSyncedLyrics = true;
        return [{ timeMs: 0, text: "Lyrics unavailable for this track." }];
    }

    function renderLyricsElements(lines) {
        lyricsContent.innerHTML = "";

        if (!areLyricsAvailable) {
            lyricsBox.style.overflowY = "hidden";
            const p = document.createElement("p");
            p.innerText = lines[0]?.text || "Lyrics unavailable for this track.";
            p.style.cssText = `
                margin: 0;
                font-size: clamp(1.3rem, 1.8vw, 1.9rem);
                font-weight: 600;
                color: #8e8e93;
                filter: none;
                opacity: 0.7;
                cursor: default;
                text-align: left;
            `;
            lyricsContent.appendChild(p);
            return;
        }

        if (!isSyncedLyrics) {
            lyricsBox.style.overflowY = "auto";
            lines.forEach((line) => {
                const p = document.createElement("p");
                p.className = "fs-lyric-line-unsynced";
                p.innerText = line.text;
                p.style.cssText = `
                    margin: 0 0 1.5vh 0;
                    font-size: clamp(1.3rem, 1.8vw, 1.9rem);
                    font-weight: 600;
                    color: #b0b0b5;
                    filter: none;
                    opacity: 0.85;
                    cursor: default;
                    text-align: left;
                `;
                lyricsContent.appendChild(p);
            });
            return;
        }

        lyricsBox.style.overflowY = "auto";
        lines.forEach((line) => {
            const p = document.createElement("p");
            p.className = "fs-lyric-line";
            p.dataset.time = line.timeMs;
            p.innerText = line.text;
            p.style.cssText = `
                margin: 0;
                font-size: clamp(1.3rem, 1.8vw, 1.9rem);
                font-weight: 600;
                color: #8e8e93;
                filter: blur(4px);
                opacity: 0.35;
                transition: color 0.3s ease, filter 0.3s ease, opacity 0.3s ease, text-shadow 0.3s ease;
                cursor: pointer;
                text-align: left;
            `;

            p.addEventListener("click", () => {
                Spicetify.Player.seek(line.timeMs);
            });

            p.addEventListener("mouseenter", () => {
                p.style.color = "#ffffff";
                p.style.filter = "blur(0px)";
                p.style.opacity = "1";
                p.style.textShadow = `0 0 25px rgba(${currentThemeRgb}, 0.9)`;
            });

            p.addEventListener("mouseleave", () => {
                const currentActiveIndex = parseInt(lyricsContent.dataset.activeIndex || "-1", 10);
                const myIndex = Array.from(lyricsContent.children).indexOf(p);
                if (myIndex !== currentActiveIndex) {
                    const distance = Math.abs(myIndex - currentActiveIndex);
                    if (distance === 1) {
                        p.style.color = "#d1d1d6";
                        p.style.filter = "blur(1.5px)";
                        p.style.opacity = "0.7";
                        p.style.textShadow = "none";
                    } else {
                        p.style.color = "#8e8e93";
                        p.style.filter = "blur(4px)";
                        p.style.opacity = "0.35";
                        p.style.textShadow = "none";
                    }
                }
            });

            lyricsContent.appendChild(p);
        });
    }

    let lastActiveIndex = -1;

    function updateLyricsSync(currentTimeMs) {
        if (!areLyricsAvailable || !isSyncedLyrics || !parsedLyricsLines || parsedLyricsLines.length === 0) return;

        let activeIndex = 0;
        for (let i = 0; i < parsedLyricsLines.length; i++) {
            if (currentTimeMs >= parsedLyricsLines[i].timeMs) {
                activeIndex = i;
            } else {
                break;
            }
        }

        lyricsContent.dataset.activeIndex = activeIndex;
        const lyricElements = lyricsContent.getElementsByClassName("fs-lyric-line");
        if (lyricElements.length === 0) return;

        if (activeIndex !== lastActiveIndex) {
            lastActiveIndex = activeIndex;

            for (let i = 0; i < lyricElements.length; i++) {
                const el = lyricElements[i];
                const distance = Math.abs(i - activeIndex);

                if (el.matches(":hover")) continue;

                if (i === activeIndex) {
                    el.style.color = "#ffffff";
                    el.style.filter = "blur(0px)";
                    el.style.opacity = "1";
                    el.style.textShadow = `0 0 25px rgba(${currentThemeRgb}, 0.95)`;
                } else if (distance === 1) {
                    el.style.color = "#d1d1d6";
                    el.style.filter = "blur(1.5px)";
                    el.style.opacity = "0.7";
                    el.style.textShadow = "none";
                } else {
                    el.style.color = "#8e8e93";
                    el.style.filter = "blur(4px)";
                    el.style.opacity = "0.35";
                    el.style.textShadow = "none";
                }
            }

            if (!isUserScrolling) {
                const activeEl = lyricElements[activeIndex];
                if (activeEl) {
                    if (activeIndex === 0) {
                        targetScrollTop = 0;
                    } else {
                        targetScrollTop = activeEl.offsetTop - lyricsBox.clientHeight / 2 + activeEl.clientHeight / 2;
                    }
                }
            }
        }
    }

    function startSyncLoop() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        function loop() {
            if (overlay.style.display === "flex") {
                const progress = Spicetify.Player.getProgress() || 0;
                const duration = Spicetify.Player.getDuration() || 1;
                const percent = (progress / duration) * 100;
                progressBar.style.width = `${Math.min(percent, 100)}%`;

                currentTimeEl.innerText = formatTime(progress);
                totalDurationEl.innerText = formatTime(duration);

                if (areLyricsAvailable) {
                    if (isSyncedLyrics) {
                        updateLyricsSync(progress);

                        if (!isUserScrolling) {
                            const diff = targetScrollTop - currentScrollTop;
                            if (Math.abs(diff) > 0.5) {
                                currentScrollTop += diff * 0.08;
                                lyricsBox.scrollTop = currentScrollTop;
                            }
                        } else {
                            currentScrollTop = lyricsBox.scrollTop;
                        }
                    } else {
                        // Unsynced lyrics: 5-second delay, then smooth scroll past the mask fade until last line is fully visible
                        if (!isUserScrolling) {
                            const unsyncedLines = lyricsContent.getElementsByClassName("fs-lyric-line-unsynced");
                            if (unsyncedLines.length > 0) {
                                const lastLine = unsyncedLines[unsyncedLines.length - 1];
                                // Add extra padding offset to account for the disappearing fade mask
                                const maxTargetScroll = lastLine.offsetTop - lyricsBox.clientHeight + lastLine.clientHeight + 60;
                                const effectiveMaxScroll = Math.max(0, maxTargetScroll);

                                const scrollDelayMs = 5000;
                                if (progress < scrollDelayMs) {
                                    targetScrollTop = 0;
                                } else {
                                    const adjustedProgress = progress - scrollDelayMs;
                                    const adjustedDuration = (duration * 0.88) - scrollDelayMs;
                                    const scrollFraction = Math.min(1, Math.max(0, adjustedProgress / adjustedDuration));
                                    targetScrollTop = effectiveMaxScroll * scrollFraction;
                                }

                                const diff = targetScrollTop - currentScrollTop;
                                if (Math.abs(diff) > 0.5) {
                                    currentScrollTop += diff * 0.08;
                                    lyricsBox.scrollTop = currentScrollTop;
                                }
                            }
                        } else {
                            currentScrollTop = lyricsBox.scrollTop;
                        }
                    }
                }
            }
            animationFrameId = requestAnimationFrame(loop);
        }
        animationFrameId = requestAnimationFrame(loop);
    }

    async function updateDisplay() {
        const current = Spicetify.Player.data;
        const trackItem = current?.item || current?.track;
        
        if (!trackItem) return;

        const meta = trackItem.metadata || {};
        const artUrl = meta.image_xl_url || meta.image_url || trackItem.images?.[0]?.url || "";

        if (albumArtEl) albumArtEl.src = artUrl;
        if (bgArt) {
            bgArt.src = artUrl;
            bgArt.style.display = "block";
        }

        albumArtEl.onload = () => {
            extractThemeColorFromElement(albumArtEl);
        };
        if (albumArtEl.complete && albumArtEl.naturalWidth > 0) {
            extractThemeColorFromElement(albumArtEl);
        }
        
        loadCanvas();

        const trackTitle = meta.title || trackItem.name || "Unknown Title";
        document.getElementById("fs-track-title").innerText = trackTitle;

        let artistNames = "Unknown Artist";
        if (trackItem.artists && Array.isArray(trackItem.artists)) {
            artistNames = trackItem.artists.map(a => a.name).join(", ");
        } else if (meta.artist_name) {
            artistNames = meta.artist_name;
        }
        document.getElementById("fs-track-artist").innerText = artistNames;

        const durationMs = trackItem.duration || meta.duration || 0;
        totalDurationEl.innerText = formatTime(durationMs);

        lastActiveIndex = -1;
        isUserScrolling = false;
        lyricsContent.innerHTML = `<p style="margin: 0; color: #8e8e93; filter: blur(2px);">Loading synchronized lyrics...</p>`;
        parsedLyricsLines = await fetchAndParseLyrics();
        renderLyricsElements(parsedLyricsLines);

        setTimeout(() => {
            if (!isSyncedLyrics) {
                targetScrollTop = 0;
                currentScrollTop = 0;
                lyricsBox.scrollTop = 0;
                return;
            }

            const progress = Spicetify.Player.getProgress() || 0;
            updateLyricsSync(progress);
            
            const lyricElements = lyricsContent.getElementsByClassName("fs-lyric-line");
            const activeIndex = parseInt(lyricsContent.dataset.activeIndex || "0", 10);
            const activeEl = lyricElements[activeIndex];

            if (activeEl && areLyricsAvailable) {
                if (activeIndex === 0) {
                    targetScrollTop = 0;
                } else {
                    targetScrollTop = activeEl.offsetTop - lyricsBox.clientHeight / 2 + activeEl.clientHeight / 2;
                }
            } else {
                targetScrollTop = 0;
            }

            currentScrollTop = targetScrollTop;
            lyricsBox.scrollTop = currentScrollTop;
        }, 50);
    }

    startSyncLoop();

    function toggleFullscreen() {
        const isHidden = overlay.style.display === "none" || overlay.style.display === "";
        overlay.style.display = isHidden ? "flex" : "none";
        
        if (isHidden) {
            updateDisplay();
            closeBtn.style.opacity = "1";
            if (mouseIdleTimeout) clearTimeout(mouseIdleTimeout);
            mouseIdleTimeout = setTimeout(() => {
                if (overlay.style.display === "flex") {
                    closeBtn.style.opacity = "0";
                    overlay.style.cursor = "none";
                }
            }, 2000);

            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn("[ExclusiveFullscreen] Failed to enter fullscreen:", err);
                });
            }
        } else {
            overlay.style.cursor = "default";
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => {
                    console.warn("[ExclusiveFullscreen] Failed to exit fullscreen:", err);
                });
            }
        }
    }

    Spicetify.Player.addEventListener("songchange", () => {
        if (overlay.style.display === "flex") {
            updateDisplay();
        }
    });

    closeBtn.addEventListener("click", toggleFullscreen);

    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") || (e.key === "Escape" && overlay.style.display === "flex")) {
            e.preventDefault();
            toggleFullscreen();
            return;
        }

        if (overlay.style.display === "flex") {
            closeBtn.style.opacity = "1";
            overlay.style.cursor = "default";
            if (mouseIdleTimeout) clearTimeout(mouseIdleTimeout);
            mouseIdleTimeout = setTimeout(() => {
                if (overlay.style.display === "flex") {
                    closeBtn.style.opacity = "0";
                    overlay.style.cursor = "none";
                }
            }, 2000);

            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                try {
                    let currentVol = Spicetify.Player.getVolume();
                    if (typeof currentVol !== "number" || isNaN(currentVol)) {
                        currentVol = 0.5;
                    }

                    if (e.key === "ArrowUp") {
                        currentVol = Math.min(1.0, currentVol + 0.05);
                    } else {
                        currentVol = Math.max(0.0, currentVol - 0.05);
                    }

                    Spicetify.Player.setVolume(currentVol);
                    showVolumeBar();
                } catch (err) {
                    console.warn("[ExclusiveFullscreen] Volume adjustment error:", err);
                }
            }
        }
    });

    if (Spicetify.Playbar) {
        new Spicetify.Playbar.Button("Exclusive Fullscreen", "fullscreen", toggleFullscreen);
    } else if (Spicetify.Topbar) {
        new Spicetify.Topbar.Button("Exclusive Fullscreen", "expand", toggleFullscreen);
    }

    Spicetify.showNotification("Exclusive Fullscreen Extension Loaded Successfully!");
})();