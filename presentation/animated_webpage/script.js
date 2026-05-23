(function () {
  const video = document.querySelector("#scrollVideo");
  const stage = document.querySelector(".scroll-stage");
  const rail = document.querySelector(".side-rail");
  const marks = Array.from(document.querySelectorAll(".rail-mark"));
  const sections = Array.from(document.querySelectorAll(".panel"));
  const revealItems = Array.from(document.querySelectorAll(".reveal")).map((element) => ({
    element,
    delay: getRevealDelay(element),
    section: element.closest(".panel"),
    vector: getRevealVector(element),
  }));

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  if (!window.location.hash && window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }

  let duration = 0;
  let rafId = null;
  let targetProgress = 0;
  let renderedProgress = 0;
  let progressVelocity = 0;
  let lastFrameTime = 0;
  let lastScrollY = window.scrollY;
  let scrollVelocity = 0;
  let lastSeekTime = -1;
  let lastSeekStamp = 0;
  let queuedSeekTime = null;
  let seekInFlight = false;
  let seekWatchdogId = null;
  let smoothScrollId = null;
  let smoothScrollY = window.scrollY;
  let targetScrollY = window.scrollY;
  let scrollAnimationVelocity = 0;
  let lastSmoothScrollTime = 0;
  let lastWheelTime = 0;
  let sectionSettleTimer = null;
  let programmaticScrollUntil = 0;
  let isTouching = false;
  const mobileScrubQuery = window.matchMedia("(max-width: 760px), (pointer: coarse)");
  const isMobileScrub = mobileScrubQuery.matches;

  const motion = {
    spring: isMobileScrub ? 340 : 260,
    damping: isMobileScrub ? 34 : 27,
    maxDeltaSeconds: 0.04,
    settleDistance: isMobileScrub ? 0.00012 : 0.00004,
    settleVelocity: isMobileScrub ? 0.0012 : 0.0004,
    seekInterval: isMobileScrub ? 1000 / 30 : 1000 / 60,
    seekPrecision: isMobileScrub ? 1 / 30 : 1 / 60,
    seekWatchdogDelay: isMobileScrub ? 320 : 220,
    endFramePadding: isMobileScrub ? 1 / 60 : 1 / 120,
    useFastSeek: isMobileScrub,
  };

  const scrollMotion = {
    spring: 185,
    damping: 23,
    wheelMultiplier: 0.82,
    maxDeltaSeconds: 0.04,
    settleDelay: 280,
    nativeSettleDelay: 360,
    settleDistance: 0.35,
    settleVelocity: 4,
    snapRange: 0.24,
    snapMinDistance: 2,
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const ease = (value) => {
    const amount = clamp(value, 0, 1);
    return amount * amount * (3 - 2 * amount);
  };

  function getRevealDelay(element) {
    const delay = window.getComputedStyle(element).getPropertyValue("--delay").trim();
    if (!delay) return 0;
    if (delay.endsWith("ms")) return parseFloat(delay) || 0;
    if (delay.endsWith("s")) return (parseFloat(delay) || 0) * 1000;
    return parseFloat(delay) || 0;
  }

  function getRevealVector(element) {
    if (element.classList.contains("reveal-left")) {
      return { inX: -72, inY: 0, outX: -96, outY: -18, inScale: 1, outScale: 0.98 };
    }

    if (element.classList.contains("reveal-right")) {
      return { inX: 72, inY: 0, outX: 96, outY: -18, inScale: 1, outScale: 0.98 };
    }

    if (element.classList.contains("reveal-scale")) {
      return { inX: 0, inY: 34, outX: 0, outY: -30, inScale: 0.9, outScale: 1.04 };
    }

    if (element.classList.contains("reveal-fade")) {
      return { inX: 0, inY: 0, outX: 0, outY: -12, inScale: 1, outScale: 1 };
    }

    if (element.classList.contains("reveal-up")) {
      return { inX: 0, inY: 58, outX: 0, outY: -58, inScale: 1, outScale: 0.98 };
    }

    const rect = element.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const side = midpoint > window.innerWidth / 2 ? 1 : -1;
    return { inX: 52 * side, inY: 0, outX: 72 * side, outY: -16, inScale: 1, outScale: 0.98 };
  }

  function updateRevealMotion() {
    const viewportHeight = window.innerHeight || 1;
    const enterStart = 0.2;
    const enterEnd = 0.74;
    const exitStart = 1.28;
    const exitEnd = 1.82;

    revealItems.forEach(({ element, delay, section, vector }) => {
      const sectionRect = (section || element).getBoundingClientRect();
      const sectionTravel = (viewportHeight - sectionRect.top) / viewportHeight;
      const stagger = delay / 1000;
      const enter = ease((sectionTravel - enterStart - stagger * 0.12) / (enterEnd - enterStart));
      const exit = ease((sectionTravel - exitStart - stagger * 0.08) / (exitEnd - exitStart));
      const opacity = clamp(enter * (1 - exit), 0, 1);
      const x = vector.inX * (1 - enter) + vector.outX * exit;
      const y = vector.inY * (1 - enter) + vector.outY * exit;
      const scale = vector.inScale + (1 - vector.inScale) * enter + (vector.outScale - 1) * exit;

      element.style.setProperty("--motion-opacity", opacity.toFixed(3));
      element.style.setProperty("--motion-x", `${x.toFixed(2)}px`);
      element.style.setProperty("--motion-y", `${y.toFixed(2)}px`);
      element.style.setProperty("--motion-scale", scale.toFixed(3));

      if (element.classList.contains("accent-line")) {
        element.style.setProperty("--line-scale", opacity.toFixed(3));
      }
    });
  }

  function getScrollableDistance() {
    return Math.max(stage.offsetHeight - window.innerHeight, 1);
  }

  function getMaxScrollY() {
    return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  }

  function getScrollProgress() {
    const stageTop = stage.offsetTop;
    const stageScroll = window.scrollY - stageTop;
    return clamp(stageScroll / getScrollableDistance(), 0, 1);
  }

  function getNavigationPoints() {
    const maxScrollY = getMaxScrollY();
    const points = sections.map((section) => clamp(section.offsetTop, 0, maxScrollY));

    if (marks.length > points.length) {
      points.push(maxScrollY);
    }

    return points
      .slice(0, marks.length)
      .map((point) => clamp(point, 0, maxScrollY));
  }

  function getSnapPoints() {
    return Array.from(new Set(getNavigationPoints())).sort((a, b) => a - b);
  }

  function getNearestSnapPoint(value) {
    return getSnapPoints().reduce((nearest, point) => {
      return Math.abs(point - value) < Math.abs(nearest - value) ? point : nearest;
    }, 0);
  }

  function getRailProgress(scrollProgress) {
    if (marks.length <= 1 || sections.length <= 1) {
      return scrollProgress;
    }

    const currentScrollY = clamp(
      scrollProgress * getScrollableDistance(),
      0,
      getMaxScrollY()
    );
    const navigationPoints = getNavigationPoints();
    const lastPointIndex = navigationPoints.length - 1;

    if (currentScrollY <= navigationPoints[0]) return 0;
    if (currentScrollY >= navigationPoints[lastPointIndex]) return 1;

    for (let index = 0; index < lastPointIndex; index += 1) {
      const start = navigationPoints[index];
      const end = navigationPoints[index + 1];

      if (currentScrollY >= start && currentScrollY <= end) {
        const localProgress = (currentScrollY - start) / Math.max(end - start, 1);
        return (index + localProgress) / lastPointIndex;
      }
    }

    return scrollProgress;
  }

  function updateSceneProgress() {
    const smoothedY = renderedProgress * getScrollableDistance();
    const viewportHeight = window.innerHeight || 1;
    const navigationPoints = getNavigationPoints();

    sections.forEach((section, index) => {
      const sectionOffset = navigationPoints[index] || section.offsetTop;
      const sceneProgress = (smoothedY - sectionOffset) / viewportHeight;
      section.style.setProperty("--scene-progress", sceneProgress.toFixed(4));

      // Viewport-based activation for elegant time-based transitions:
      // Trigger entrance transitions as soon as 15% of the panel enters the viewport (sceneProgress > -0.85)
      // and reset when it is 85% scrolled off.
      const isVisible = sceneProgress > -0.85 && sceneProgress < 0.85;
      section.classList.toggle("is-active", isVisible);
    });

    updateRevealMotion();
  }

  function setActiveMark(progress) {
    const railProgress = getRailProgress(progress);

    document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
    document.documentElement.style.setProperty(
      "--rail-progress",
      railProgress.toFixed(4)
    );

    const activeIndex = clamp(
      Math.round(railProgress * (marks.length - 1)),
      0,
      marks.length - 1
    );

    marks.forEach((mark, index) => {
      mark.classList.toggle("is-active", index === activeIndex);
    });

    updateSceneProgress();
  }

  function updateTargetFromScroll() {
    targetProgress = getScrollProgress();
    setActiveMark(targetProgress);
  }

  function syncInitialScrollState() {
    targetProgress = getScrollProgress();
    renderedProgress = targetProgress;
    progressVelocity = 0;
    scrollVelocity = 0;
    lastScrollY = window.scrollY;
    smoothScrollY = window.scrollY;
    targetScrollY = smoothScrollY;
    scrollAnimationVelocity = 0;
    lastFrameTime = 0;
    lastSmoothScrollTime = 0;
    setActiveMark(targetProgress);
  }

  function setVideoTime(progress, timestamp, force) {
    if (!duration) return;

    const safeDuration = Math.max(duration - motion.endFramePadding, 0);
    const nextTime = progress >= 1
      ? safeDuration
      : clamp(duration * progress, 0, safeDuration);
    queuedSeekTime = nextTime;
    flushVideoSeek(timestamp, force);
  }

  function flushVideoSeek(timestamp, force) {
    if (!duration || queuedSeekTime === null || seekInFlight || video.seeking) return;

    const nextTime = queuedSeekTime;
    const timeDelta = Math.abs(nextTime - lastSeekTime);
    const seekElapsed = timestamp - lastSeekStamp;
    const minTimeStep = Math.max(duration / 1400, motion.seekPrecision);

    if (timeDelta < 0.001) {
      queuedSeekTime = null;
      return;
    }

    if (!force && timeDelta < minTimeStep) return;
    if (!force && seekElapsed < motion.seekInterval) return;

    queuedSeekTime = null;
    if (motion.useFastSeek && typeof video.fastSeek === "function") {
      try {
        video.fastSeek(nextTime);
      } catch (error) {
        video.currentTime = nextTime;
      }
    } else {
      video.currentTime = nextTime;
    }

    lastSeekTime = nextTime;
    lastSeekStamp = timestamp;
    seekInFlight = true;

    window.clearTimeout(seekWatchdogId);
    seekWatchdogId = window.setTimeout(() => {
      seekInFlight = false;
      flushVideoSeek(performance.now(), true);
    }, motion.seekWatchdogDelay);
  }

  function drawFrame(timestamp) {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }

    const deltaSeconds = Math.min(
      (timestamp - lastFrameTime) / 1000,
      motion.maxDeltaSeconds
    );
    lastFrameTime = timestamp;

    const progressDelta = targetProgress - renderedProgress;
    const impulse = isMobileScrub
      ? 0
      : clamp(scrollVelocity / Math.max(window.innerHeight, 1), -0.04, 0.04);
    const acceleration = progressDelta * motion.spring + impulse * 8;
    const drag = Math.exp(-motion.damping * deltaSeconds);

    progressVelocity = (progressVelocity + acceleration * deltaSeconds) * drag;
    renderedProgress = clamp(renderedProgress + progressVelocity * deltaSeconds, 0, 1);

    const remainingDistance = Math.abs(targetProgress - renderedProgress);
    const remainingVelocity = Math.abs(progressVelocity);

    if (
      remainingDistance < motion.settleDistance &&
      remainingVelocity < motion.settleVelocity
    ) {
      renderedProgress = targetProgress;
      progressVelocity = 0;
    }

    setVideoTime(renderedProgress, timestamp, progressVelocity === 0);
    updateSceneProgress();

    scrollVelocity *= 0.88;

    if (
      Math.abs(targetProgress - renderedProgress) > motion.settleDistance ||
      Math.abs(progressVelocity) > motion.settleVelocity ||
      Math.abs(scrollVelocity) > 0.5
    ) {
      rafId = requestAnimationFrame(drawFrame);
    } else {
      rafId = null;
      lastFrameTime = 0;
    }
  }

  function requestDraw() {
    if (rafId === null && duration > 0) {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  function setProgrammaticScroll(value) {
    programmaticScrollUntil = performance.now() + 120;
    window.scrollTo(0, value);
  }

  function runSmoothScroll(timestamp) {
    if (!lastSmoothScrollTime) {
      lastSmoothScrollTime = timestamp;
    }

    const deltaSeconds = Math.min(
      (timestamp - lastSmoothScrollTime) / 1000,
      scrollMotion.maxDeltaSeconds
    );
    lastSmoothScrollTime = timestamp;

    const distance = targetScrollY - smoothScrollY;
    const acceleration = distance * scrollMotion.spring;
    const drag = Math.exp(-scrollMotion.damping * deltaSeconds);

    scrollAnimationVelocity = (
      scrollAnimationVelocity + acceleration * deltaSeconds
    ) * drag;
    smoothScrollY = clamp(
      smoothScrollY + scrollAnimationVelocity * deltaSeconds,
      0,
      getMaxScrollY()
    );

    if (
      Math.abs(targetScrollY - smoothScrollY) < scrollMotion.settleDistance &&
      Math.abs(scrollAnimationVelocity) < scrollMotion.settleVelocity
    ) {
      smoothScrollY = targetScrollY;
      scrollAnimationVelocity = 0;
    }

    setProgrammaticScroll(smoothScrollY);

    if (smoothScrollY !== targetScrollY || Math.abs(scrollAnimationVelocity) > 0) {
      smoothScrollId = requestAnimationFrame(runSmoothScroll);
    } else {
      smoothScrollId = null;
      lastSmoothScrollTime = 0;
      smoothScrollY = window.scrollY;
      targetScrollY = smoothScrollY;
    }
  }

  function requestSmoothScroll() {
    if (smoothScrollId === null) {
      smoothScrollId = requestAnimationFrame(runSmoothScroll);
    }
  }

  function settleToNearestSection() {
    const snapPoint = getNearestSnapPoint(targetScrollY);
    const snapRange = window.innerHeight * scrollMotion.snapRange;
    const snapDistance = Math.abs(snapPoint - targetScrollY);

    if (snapDistance > snapRange || snapDistance < scrollMotion.snapMinDistance) {
      return;
    }

    targetScrollY = snapPoint;
    requestSmoothScroll();
  }

  function scheduleSectionSettle(delay = scrollMotion.settleDelay) {
    window.clearTimeout(sectionSettleTimer);
    sectionSettleTimer = window.setTimeout(settleToNearestSection, delay);
  }

  function normalizeWheelDelta(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 18;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * window.innerHeight;
    }

    return event.deltaY;
  }

  function handleWheel(event) {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }

    event.preventDefault();

    const deltaY = normalizeWheelDelta(event);
    if (!deltaY) return;

    if (smoothScrollId === null) {
      smoothScrollY = window.scrollY;
      targetScrollY = smoothScrollY;
      scrollAnimationVelocity = 0;
      lastSmoothScrollTime = 0;
    }

    lastWheelTime = performance.now();
    targetScrollY = clamp(
      targetScrollY + deltaY * scrollMotion.wheelMultiplier,
      0,
      getMaxScrollY()
    );

    requestSmoothScroll();
    scheduleSectionSettle();
  }

  function handleKeydown(event) {
    const tagName = event.target.tagName;
    const isEditable = event.target.isContentEditable ||
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT";

    if (isEditable || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const keyDeltas = {
      ArrowDown: window.innerHeight * 0.18,
      ArrowUp: -window.innerHeight * 0.18,
      PageDown: window.innerHeight * 0.82,
      PageUp: -window.innerHeight * 0.82,
    };

    let nextTarget = null;

    if (event.key === "Home") {
      nextTarget = 0;
    } else if (event.key === "End") {
      nextTarget = getMaxScrollY();
    } else if (event.key === " ") {
      nextTarget = targetScrollY + window.innerHeight * (event.shiftKey ? -0.82 : 0.82);
    } else if (Object.prototype.hasOwnProperty.call(keyDeltas, event.key)) {
      nextTarget = targetScrollY + keyDeltas[event.key];
    }

    if (nextTarget === null) return;

    event.preventDefault();

    if (smoothScrollId === null) {
      smoothScrollY = window.scrollY;
      scrollAnimationVelocity = 0;
      lastSmoothScrollTime = 0;
    }

    targetScrollY = clamp(nextTarget, 0, getMaxScrollY());
    requestSmoothScroll();
    scheduleSectionSettle();
  }

  function handleScroll() {
    scrollVelocity = window.scrollY - lastScrollY;
    lastScrollY = window.scrollY;
    updateTargetFromScroll();
    requestDraw();

    const now = performance.now();
    const isProgrammatic = now < programmaticScrollUntil ||
      smoothScrollId !== null ||
      now - lastWheelTime < scrollMotion.nativeSettleDelay;

    if (!isProgrammatic && !isTouching) {
      smoothScrollY = window.scrollY;
      targetScrollY = smoothScrollY;
      scheduleSectionSettle(scrollMotion.nativeSettleDelay);
    }
  }

  function lockVideoAtProgress(progress) {
    video.controls = false;
    video.pause();
    const nextTime = duration ? clamp(duration * progress, 0, duration) : 0;
    queuedSeekTime = null;
    seekInFlight = false;
    window.clearTimeout(seekWatchdogId);
    video.currentTime = nextTime;
    lastSeekTime = nextTime;
    lastSeekStamp = performance.now();
  }

  function keepVideoScrubOnly() {
    video.pause();
  }

  function animateScrollTo(destination) {
    if (sectionSettleTimer !== null) {
      window.clearTimeout(sectionSettleTimer);
      sectionSettleTimer = null;
    }

    smoothScrollY = window.scrollY;
    targetScrollY = clamp(destination, 0, getMaxScrollY());
    scrollAnimationVelocity = 0;
    lastSmoothScrollTime = 0;

    requestSmoothScroll();
  }

  function initializeVideoScrub() {
    duration = video.duration || 0;
    syncInitialScrollState();
    lockVideoAtProgress(renderedProgress);
    requestDraw();
  }

  video.addEventListener("loadedmetadata", initializeVideoScrub);
  video.addEventListener("play", keepVideoScrubOnly);
  video.addEventListener("seeked", () => {
    seekInFlight = false;
    window.clearTimeout(seekWatchdogId);
    flushVideoSeek(performance.now(), true);
  });
  video.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll, { passive: true });
  window.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("keydown", handleKeydown);

  window.addEventListener("touchstart", () => {
    isTouching = true;
    if (smoothScrollId !== null) {
      cancelAnimationFrame(smoothScrollId);
      smoothScrollId = null;
      lastSmoothScrollTime = 0;
    }
    window.clearTimeout(sectionSettleTimer);
  }, { passive: true });

  window.addEventListener("touchend", () => {
    isTouching = false;
    smoothScrollY = window.scrollY;
    targetScrollY = smoothScrollY;
    scheduleSectionSettle(scrollMotion.nativeSettleDelay);
  }, { passive: true });

  window.addEventListener("touchcancel", () => {
    isTouching = false;
    smoothScrollY = window.scrollY;
    targetScrollY = smoothScrollY;
    scheduleSectionSettle(scrollMotion.nativeSettleDelay);
  }, { passive: true });

  rail.addEventListener("click", (event) => {
    if (event.target.classList.contains("rail-mark")) {
      return;
    }

    const index = marks.reduce((nearestIndex, mark, markIndex) => {
      const currentRect = mark.getBoundingClientRect();
      const nearestRect = marks[nearestIndex].getBoundingClientRect();
      const currentCenter = currentRect.top + currentRect.height / 2;
      const nearestCenter = nearestRect.top + nearestRect.height / 2;

      return Math.abs(event.clientY - currentCenter) <
        Math.abs(event.clientY - nearestCenter)
        ? markIndex
        : nearestIndex;
    }, 0);
    animateScrollTo(getNavigationPoints()[index] || 0);
  });

  marks.forEach((mark, index) => {
    mark.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      animateScrollTo(getNavigationPoints()[index] || 0);
    });
  });

  // --- High-Fidelity Mouse Parallax with Cinematic Inertia ---
  let targetMouseX = 0;
  let targetMouseY = 0;
  let currentMouseX = 0;
  let currentMouseY = 0;
  let parallaxRafId = null;

  function updateParallax() {
    const lerpFactor = 0.08; // Smooth interpolation coefficient
    const dx = targetMouseX - currentMouseX;
    const dy = targetMouseY - currentMouseY;

    currentMouseX += dx * lerpFactor;
    currentMouseY += dy * lerpFactor;

    video.style.setProperty("--parallax-x", `${currentMouseX.toFixed(2)}px`);
    video.style.setProperty("--parallax-y", `${currentMouseY.toFixed(2)}px`);

    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 0.01) {
      parallaxRafId = requestAnimationFrame(updateParallax);
    } else {
      currentMouseX = targetMouseX;
      currentMouseY = targetMouseY;
      video.style.setProperty("--parallax-x", `${currentMouseX.toFixed(2)}px`);
      video.style.setProperty("--parallax-y", `${currentMouseY.toFixed(2)}px`);
      parallaxRafId = null;
    }
  }

  function handleMouseMove(event) {
    // Normalize coordinates between -1 and 1
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = (event.clientY / window.innerHeight) * 2 - 1;

    // Translate up to 20px in the opposite direction for 3D depth feeling
    targetMouseX = x * -20;
    targetMouseY = y * -20;

    if (parallaxRafId === null) {
      parallaxRafId = requestAnimationFrame(updateParallax);
    }
  }

  if (window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
  }

  syncInitialScrollState();

  if (video.readyState >= 1) {
    initializeVideoScrub();
  }
})();
