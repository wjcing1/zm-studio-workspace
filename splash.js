import { setupWebApp } from "./scripts/shared/register-web-app.js?v=2026-03-30-auth-1";

const FONT_GRID = {
  S: [
    [0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
  T: [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
  ],
  U: [
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  D: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
  I: [[1], [1], [1], [1], [1], [1], [1]],
  O: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
};

const prefersReducedMotion =
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const READY_DELAY_MS = prefersReducedMotion ? 120 : 1600;
const AUTO_EXIT_DELAY_MS = prefersReducedMotion ? 900 : 3200;
const EXIT_DURATION_MS = prefersReducedMotion ? 120 : 720;
const TARGET_URL = "./login.html";

const canvas = document.getElementById("splashCanvas");
const shell = document.querySelector(".splash-shell");
const enterButton = document.getElementById("enterStudioButton");

if (canvas && shell && enterButton) {
  setupWebApp();
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let animationFrameId = 0;
  let autoExitTimer = 0;
  let readyTimer = 0;
  let resizeTimer = 0;
  let exitTimer = 0;
  let hasExited = false;
  let particles = [];

  function getTargetUrl() {
    const shellTarget = shell.dataset.targetPage?.trim();
    const buttonTarget = enterButton.getAttribute("href")?.trim();
    return shellTarget || buttonTarget || TARGET_URL;
  }

  function configureCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    return { width, height };
  }

  function createParticle(x, y, targetX, targetY, size) {
    return {
      x,
      y,
      targetX,
      targetY,
      size,
      ease: 0.026 + Math.random() * 0.04,
    };
  }

  function buildIntroParticles(width, height) {
    const nextParticles = [];
    const offscreenCanvas = document.createElement("canvas");
    const offscreenContext = offscreenCanvas.getContext("2d", { willReadFrequently: true });

    offscreenCanvas.width = width;
    offscreenCanvas.height = height;

    if (!offscreenContext) {
      return nextParticles;
    }

    const mainFontSize = Math.min(width * 0.15, 200);
    const subFontSize = Math.min(width * 0.05, 60);

    offscreenContext.fillStyle = "#ffffff";
    offscreenContext.textAlign = "center";
    offscreenContext.textBaseline = "middle";
    offscreenContext.font = `700 ${mainFontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    offscreenContext.fillText("ZM", width / 2, height / 2 - subFontSize * 0.52);

    const metrics = offscreenContext.measureText("ZM");
    const textCoordinates = offscreenContext.getImageData(0, 0, width, height);
    const zmGap = width < 720 ? 8 : 6;

    for (let y = 0; y < height; y += zmGap) {
      for (let x = 0; x < width; x += zmGap) {
        const index = (Math.floor(y) * width + Math.floor(x)) * 4;
        const alpha = textCoordinates.data[index + 3];

        if (alpha <= 80) {
          continue;
        }

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.max(width, height) * (0.5 + Math.random() * 0.55);
        nextParticles.push(
          createParticle(
            width / 2 + Math.cos(angle) * radius,
            height / 2 + Math.sin(angle) * radius,
            x + zmGap / 2,
            y + zmGap / 2,
            4,
          ),
        );
      }
    }

    const scale = Math.min(1, Math.max(0.52, width / 1200));
    const studioGap = Math.max(4, Math.floor(6 * scale));
    const studioSize = Math.max(2, studioGap - 2);
    const text = "STUDIO";
    const letters = text.split("");

    let lettersWidth = 0;
    for (const char of letters) {
      lettersWidth += FONT_GRID[char][0].length * studioGap;
    }

    const targetStudioWidth = metrics.width * 0.95;
    const spacing = Math.max(studioGap * 0.35, (targetStudioWidth - lettersWidth) / (letters.length - 1));
    let currentX = width / 2 - targetStudioWidth / 2;
    const startY = height / 2 + mainFontSize * 0.45 - (7 * studioGap) / 2;

    for (const char of letters) {
      const grid = FONT_GRID[char];
      const rows = grid.length;
      const columns = grid[0].length;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (grid[row][column] !== 1) {
            continue;
          }

          const targetX = currentX + column * studioGap + studioGap / 2;
          const targetY = startY + row * studioGap + studioGap / 2;
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.max(width, height) * (0.5 + Math.random() * 0.55);

          nextParticles.push(
            createParticle(
              width / 2 + Math.cos(angle) * radius,
              height / 2 + Math.sin(angle) * radius,
              targetX,
              targetY,
              studioSize,
            ),
          );
        }
      }

      currentX += columns * studioGap + spacing;
    }

    return nextParticles;
  }

  function initializeParticles() {
    const { width, height } = configureCanvas();
    particles = buildIntroParticles(width, height);
  }

  function drawFrame() {
    context.fillStyle = "rgba(5, 5, 5, 0.26)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255, 255, 255, 0.92)";

    for (const particle of particles) {
      particle.x += (particle.targetX - particle.x) * particle.ease;
      particle.y += (particle.targetY - particle.y) * particle.ease;
      context.fillRect(
        Math.round(particle.x - particle.size / 2),
        Math.round(particle.y - particle.size / 2),
        particle.size,
        particle.size,
      );
    }

    animationFrameId = window.requestAnimationFrame(drawFrame);
  }

  function navigateToStudio() {
    if (hasExited) {
      return;
    }

    hasExited = true;
    document.body.classList.add("is-exiting");
    window.clearTimeout(autoExitTimer);
    window.clearTimeout(exitTimer);

    exitTimer = window.setTimeout(() => {
      window.location.assign(getTargetUrl());
    }, EXIT_DURATION_MS);
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      initializeParticles();
    }, 160);
  }

  enterButton.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToStudio();
  });

  if (context) {
    window.addEventListener("resize", handleResize);
    initializeParticles();
    drawFrame();
  }

  readyTimer = window.setTimeout(() => {
    document.body.classList.add("is-ready");
  }, READY_DELAY_MS);

  autoExitTimer = window.setTimeout(() => {
    navigateToStudio();
  }, AUTO_EXIT_DELAY_MS);

  window.addEventListener("pagehide", () => {
    if (context) {
      window.cancelAnimationFrame(animationFrameId);
    }
    window.clearTimeout(autoExitTimer);
    window.clearTimeout(readyTimer);
    window.clearTimeout(resizeTimer);
    window.clearTimeout(exitTimer);
  });
}
