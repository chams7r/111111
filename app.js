// === Subway Runner — Game Engine ===

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hudEl = document.getElementById("hud");
const hudScore = document.getElementById("hud-score");
const hudCoins = document.getElementById("hud-coins");
const menuScreen = document.getElementById("menu-screen");
const gameoverScreen = document.getElementById("gameover-screen");
const menuHighscore = document.getElementById("menu-highscore");
const goScore = document.getElementById("go-score");
const goCoins = document.getElementById("go-coins");
const goDistance = document.getElementById("go-distance");
const goRecord = document.getElementById("go-record");

// === Telegram WebApp integration ===
let telegramId = 0;
let tgUsername = "";
const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
    const initData = tg.initDataUnsafe;
    if (initData?.user) {
        telegramId = initData.user.id;
        tgUsername = initData.user.username || initData.user.first_name || "";
    }
}

// Fallback: get from URL params
if (!telegramId) {
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get("startapp") || params.get("tgWebAppStartParam");
    if (startParam) telegramId = parseInt(startParam) || 0;
}

// === Constants ===
const LANE_COUNT = 3;
const HORIZON_Y = 0.32;
const ROAD_TOP = 0.32;
const ROAD_BOTTOM = 0.95;
const PLAYER_SIZE_RATIO = 0.07;
const COIN_SIZE_RATIO = 0.025;
const JUMP_DURATION = 600;
const SLIDE_DURATION = 500;
const BASE_SPEED = 4;
const SPEED_INCREMENT = 0.0004;
const OBSTACLE_GAP_MIN = 70;
const OBSTACLE_GAP_MAX = 140;

// === Game State ===
let W, H;
let state = "menu"; // menu | playing | gameover
let score = 0;
let coins = 0;
let distance = 0;
let speed = BASE_SPEED;
let highScore = 0;
let frameId = null;
let lastTime = 0;

// Player
let player = { lane: 1, x: 0, y: 0, w: 0, h: 0, jumping: false, jumpStart: 0, sliding: false, slideStart: 0 };

// World objects
let obstacles = [];
let coinObjects = [];
let particles = [];
let nextObstacleZ = 100;
let nextCoinZ = 60;
let roadOffset = 0;

// Swipe detection
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

// === Resize ===
function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// === Perspective projection ===
function projectZ(z) {
    // z goes from 0 (near player) to ~200 (far away)
    // Returns {scale, y} — scale factor and screen Y
    const maxZ = 200;
    const t = 1 - z / maxZ;
    const clampedT = Math.max(0, Math.min(1, t));

    const roadTop = H * ROAD_TOP;
    const roadBot = H * ROAD_BOTTOM;
    const y = roadBot - (roadBot - roadTop) * (1 - clampedT * clampedT);
    const scale = clampedT;
    return { scale, y };
}

function laneX(lane, scale) {
    const roadW = W * 0.85;
    const laneW = roadW / 3;
    const cx = W / 2;
    const offset = (lane - 1) * laneW * scale;
    return cx + offset;
}

// === Drawing ===
function drawBackground() {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * ROAD_TOP);
    skyGrad.addColorStop(0, "#0a0a2e");
    skyGrad.addColorStop(1, "#1a1a4e");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * ROAD_TOP + 10);

    // Buildings silhouette
    drawBuildings();

    // Road
    drawRoad();
}

function drawBuildings() {
    ctx.fillStyle = "#111130";
    const buildingData = [
        { x: 0.02, w: 0.08, h: 0.15 },
        { x: 0.12, w: 0.06, h: 0.22 },
        { x: 0.20, w: 0.09, h: 0.12 },
        { x: 0.72, w: 0.07, h: 0.18 },
        { x: 0.82, w: 0.09, h: 0.25 },
        { x: 0.93, w: 0.06, h: 0.14 },
    ];
    for (const b of buildingData) {
        const bx = W * b.x;
        const bw = W * b.w;
        const bh = H * b.h;
        const by = H * ROAD_TOP - bh;
        ctx.fillRect(bx, by, bw, bh);
    }
}

function drawRoad() {
    const roadTop = H * ROAD_TOP;
    const roadBot = H * ROAD_BOTTOM;
    const cx = W / 2;
    const roadW = W * 0.85;

    // Road surface
    const roadGrad = ctx.createLinearGradient(0, roadTop, 0, roadBot);
    roadGrad.addColorStop(0, "#2a2a3a");
    roadGrad.addColorStop(1, "#3a3a4a");
    ctx.fillStyle = roadGrad;

    ctx.beginPath();
    ctx.moveTo(cx - 20, roadTop);
    ctx.lineTo(cx + 20, roadTop);
    ctx.lineTo(cx + roadW / 2, roadBot);
    ctx.lineTo(cx - roadW / 2, roadBot);
    ctx.closePath();
    ctx.fill();

    // Lane dividers
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;

    for (let laneDiv = 0; laneDiv < 2; laneDiv++) {
        const laneIdx = laneDiv === 0 ? 0.5 : 1.5;
        ctx.beginPath();
        for (let z = 0; z <= 200; z += 4) {
            const p = projectZ(z);
            const x = laneX(laneIdx, p.scale) + (laneDiv === 0 ? -1 : 1) * (W * 0.85 / 6) * p.scale;
            // Actually compute the divider between lanes
            const dividerLane = laneDiv === 0 ? 0.5 : 1.5;
            const dx = laneX(dividerLane - 0.5 + 0.5, p.scale) + (W * 0.85 / 6) * p.scale * (laneDiv === 0 ? -1 : 1);
            // Simplified: just draw between lane centers
        }
        // Simpler: draw dashed lines
    }

    // Draw dashed lane lines
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 18]);
    roadOffset = (roadOffset + speed * 0.5) % 30;

    for (let div = 0; div < 2; div++) {
        const laneNum = div === 0 ? 0.5 : 1.5;
        ctx.beginPath();
        let first = true;
        for (let z = 0; z <= 200; z += 2) {
            const p = projectZ(z);
            const halfLaneW = (W * 0.85 / 6) * p.scale;
            const centerX = laneX(Math.floor(laneNum + 0.5), p.scale);
            const side = laneNum % 1 === 0.5 ? (div === 0 ? -1 : 1) : 0;
            const x = centerX + side * halfLaneW;

            if (first) { ctx.moveTo(x, p.y); first = false; }
            else ctx.lineTo(x, p.y);
        }
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Side rails
    ctx.strokeStyle = "rgba(255,200,0,0.3)";
    ctx.lineWidth = 2;
    for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        let first = true;
        for (let z = 0; z <= 200; z += 2) {
            const p = projectZ(z);
            const roadHalfW = (W * 0.85 / 2) * p.scale;
            const x = cx + side * roadHalfW;
            if (first) { ctx.moveTo(x, p.y); first = false; }
            else ctx.lineTo(x, p.y);
        }
        ctx.stroke();
    }
}

function drawPlayer() {
    const p = projectZ(0);
    const size = H * PLAYER_SIZE_RATIO * p.scale;
    const cx = laneX(player.lane, p.scale);
    const cy = p.y - size * 0.5;

    player.x = cx;
    player.y = cy;
    player.w = size * 0.6;
    player.h = size;

    // Jump offset
    let jumpOffset = 0;
    if (player.jumping) {
        const elapsed = Date.now() - player.jumpStart;
        if (elapsed > JUMP_DURATION) {
            player.jumping = false;
        } else {
            const t = elapsed / JUMP_DURATION;
            jumpOffset = -size * 1.2 * Math.sin(t * Math.PI);
        }
    }

    // Slide: shorter hitbox
    let heightMul = 1;
    if (player.sliding) {
        const elapsed = Date.now() - player.slideStart;
        if (elapsed > SLIDE_DURATION) {
            player.sliding = false;
        } else {
            heightMul = 0.4;
        }
    }

    const drawY = cy + jumpOffset;
    const drawH = size * heightMul;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, p.y - size * 0.1, size * 0.35, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bodyGrad = ctx.createLinearGradient(cx - size * 0.3, drawY - drawH, cx + size * 0.3, drawY);
    bodyGrad.addColorStop(0, "#4fc3f7");
    bodyGrad.addColorStop(1, "#0288d1");
    ctx.fillStyle = bodyGrad;

    // Draw body shape
    const bw = size * 0.35;
    const bh = drawH * 0.7;
    const headR = size * 0.22;

    // Torso
    ctx.beginPath();
    ctx.roundRect(cx - bw, drawY - drawH + headR * 1.2, bw * 2, bh, [4, 4, 2, 2]);
    ctx.fill();

    // Head
    ctx.fillStyle = "#ffe0b2";
    ctx.beginPath();
    ctx.arc(cx, drawY - drawH + headR * 0.6, headR, 0, Math.PI * 2);
    ctx.fill();

    // Cap
    ctx.fillStyle = "#ff5722";
    ctx.beginPath();
    ctx.arc(cx, drawY - drawH + headR * 0.3, headR * 1.1, Math.PI, 0);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx - headR * 0.3, drawY - drawH + headR * 0.6, 2, 0, Math.PI * 2);
    ctx.arc(cx + headR * 0.3, drawY - drawH + headR * 0.6, 2, 0, Math.PI * 2);
    ctx.fill();

    // Legs (when not sliding)
    if (!player.sliding) {
        ctx.fillStyle = "#1565c0";
        const legW = bw * 0.4;
        const legH = drawH * 0.35;
        const legBob = Math.sin(Date.now() * 0.012) * size * 0.06;
        ctx.fillRect(cx - bw * 0.7, drawY + legBob, legW, legH);
        ctx.fillRect(cx + bw * 0.3, drawY - legBob, legW, legH);
    }
}

function drawObstacles() {
    // Sort by Z (far first)
    const sorted = [...obstacles].sort((a, b) => b.z - a.z);

    for (const obs of sorted) {
        if (obs.z < -10 || obs.z > 200) continue;
        const p = projectZ(obs.z);
        if (p.scale < 0.02) continue;

        const cx = laneX(obs.lane, p.scale);
        const baseW = W * 0.1 * p.scale;
        const baseH = H * 0.12 * p.scale;

        if (obs.type === "barrier") {
            // Red barrier — jump over
            const h = baseH * 0.5;
            const w = baseW * 1.2;
            const y = p.y - h;

            ctx.fillStyle = "#e53935";
            ctx.beginPath();
            ctx.roundRect(cx - w / 2, y, w, h, 3 * p.scale);
            ctx.fill();

            ctx.fillStyle = "#ffcdd2";
            ctx.fillRect(cx - w / 2 + 2 * p.scale, y + h * 0.3, w - 4 * p.scale, h * 0.15);

            obs.hitX = cx - w / 2;
            obs.hitW = w;
            obs.hitY = y;
            obs.hitH = h;
        } else if (obs.type === "train") {
            // Blue train — dodge
            const w = baseW * 0.9;
            const h = baseH * 1.8;
            const y = p.y - h;

            const trainGrad = ctx.createLinearGradient(cx - w / 2, y, cx + w / 2, y);
            trainGrad.addColorStop(0, "#1565c0");
            trainGrad.addColorStop(0.5, "#1e88e5");
            trainGrad.addColorStop(1, "#1565c0");
            ctx.fillStyle = trainGrad;
            ctx.beginPath();
            ctx.roundRect(cx - w / 2, y, w, h, 4 * p.scale);
            ctx.fill();

            // Windows
            ctx.fillStyle = "rgba(255,255,200,0.7)";
            const winSize = h * 0.12;
            for (let wy = y + h * 0.15; wy < y + h * 0.7; wy += h * 0.22) {
                ctx.fillRect(cx - w * 0.3, wy, winSize, winSize * 0.7);
                ctx.fillRect(cx + w * 0.1, wy, winSize, winSize * 0.7);
            }

            obs.hitX = cx - w / 2;
            obs.hitW = w;
            obs.hitY = y;
            obs.hitH = h;
        } else if (obs.type === "overhead") {
            // Yellow overhead bar — slide under
            const w = baseW * 1.2;
            const h = baseH * 0.3;
            const y = p.y - baseH * 1.5;

            ctx.fillStyle = "#f9a825";
            ctx.beginPath();
            ctx.roundRect(cx - w / 2, y, w, h, 2 * p.scale);
            ctx.fill();

            // Stripes
            ctx.fillStyle = "#fff8e1";
            ctx.fillRect(cx - w / 2, y + h * 0.35, w, h * 0.3);

            obs.hitX = cx - w / 2;
            obs.hitW = w;
            obs.hitY = y;
            obs.hitH = baseH * 1.5;
        }

        obs.hitScale = p.scale;
    }
}

function drawCoins() {
    for (const coin of coinObjects) {
        if (coin.z < -5 || coin.z > 200) continue;
        const p = projectZ(coin.z);
        if (p.scale < 0.02) continue;

        const cx = laneX(coin.lane, p.scale);
        const r = H * COIN_SIZE_RATIO * p.scale;
        const cy = p.y - H * 0.04 * p.scale;

        // Coin glow
        ctx.fillStyle = "rgba(255,215,0,0.2)";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
        ctx.fill();

        // Coin body
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Shine
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.4, 0, Math.PI * 2);
        ctx.fill();

        coin.drawX = cx;
        coin.drawY = cy;
        coin.drawR = r;
    }
}

function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 0.02;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4 - 2,
            size: Math.random() * 3 + 1,
            life: 1,
            color,
        });
    }
}

// === Obstacle generation ===
function generateObstacles() {
    while (nextObstacleZ < 200) {
        const lane = Math.floor(Math.random() * 3);
        const types = ["barrier", "train", "overhead"];
        const type = types[Math.floor(Math.random() * types.length)];

        obstacles.push({
            type,
            lane,
            z: nextObstacleZ,
            hitX: 0, hitY: 0, hitW: 0, hitH: 0, hitScale: 0,
        });

        // Sometimes add a second obstacle in a different lane
        if (speed > 6 && Math.random() < 0.35) {
            let lane2 = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
            obstacles.push({
                type: types[Math.floor(Math.random() * types.length)],
                lane: lane2,
                z: nextObstacleZ,
                hitX: 0, hitY: 0, hitW: 0, hitH: 0, hitScale: 0,
            });
        }

        const gap = OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN);
        nextObstacleZ += gap;
    }
}

function generateCoins() {
    while (nextCoinZ < 200) {
        const lane = Math.floor(Math.random() * 3);
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            coinObjects.push({
                lane,
                z: nextCoinZ + i * 12,
                collected: false,
                drawX: 0, drawY: 0, drawR: 0,
            });
        }
        nextCoinZ += 40 + Math.random() * 50;
    }
}

// === Collision ===
function checkCollisions() {
    const pSize = H * PLAYER_SIZE_RATIO;

    for (const obs of obstacles) {
        if (obs.z < -3 || obs.z > 8) continue;
        if (obs.lane !== player.lane) continue;
        if (!obs.hitW) continue;

        // Jumping over barriers
        if (obs.type === "barrier" && player.jumping) continue;
        // Sliding under overhead
        if (obs.type === "overhead" && player.sliding) continue;

        return true; // Hit!
    }

    // Coin collection
    for (const coin of coinObjects) {
        if (coin.collected) continue;
        if (coin.z < -5 || coin.z > 8) continue;
        if (coin.lane !== player.lane) continue;

        coin.collected = true;
        coins++;
        score += 10;
        spawnParticles(coin.drawX, coin.drawY, "#ffd700", 6);
    }

    return false;
}

// === Game logic ===
function resetGame() {
    score = 0;
    coins = 0;
    distance = 0;
    speed = BASE_SPEED;
    player.lane = 1;
    player.jumping = false;
    player.sliding = false;
    obstacles = [];
    coinObjects = [];
    particles = [];
    nextObstacleZ = 80;
    nextCoinZ = 50;
    roadOffset = 0;
}

function gameOver() {
    state = "gameover";
    hudEl.classList.add("hidden");
    gameoverScreen.classList.remove("hidden");

    goScore.textContent = `🏆 Очки: ${score}`;
    goCoins.textContent = `🪙 Монеты: ${coins}`;
    goDistance.textContent = `📏 Дистанция: ${Math.floor(distance)}м`;

    const isNewRecord = score > highScore;
    if (isNewRecord) {
        highScore = score;
        goRecord.classList.remove("hidden");
    } else {
        goRecord.classList.add("hidden");
    }

    // Save to server
    if (telegramId) {
        fetch("/api/save-result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                telegram_id: telegramId,
                username: tgUsername,
                score,
                coins_collected: coins,
                distance: Math.floor(distance),
            }),
        }).catch(() => {});
    }
}

function update(dt) {
    if (state !== "playing") return;

    speed = BASE_SPEED + distance * SPEED_INCREMENT;
    const moveZ = speed * dt * 60;

    distance += moveZ * 0.3;
    score += Math.floor(moveZ * 0.5);
    roadOffset += moveZ;

    // Move objects toward player
    for (const obs of obstacles) {
        obs.z -= moveZ;
    }
    for (const coin of coinObjects) {
        coin.z -= moveZ;
    }
    nextObstacleZ -= moveZ;
    nextCoinZ -= moveZ;

    // Cleanup
    obstacles = obstacles.filter(o => o.z > -20);
    coinObjects = coinObjects.filter(c => c.z > -20 && !c.collected);

    generateObstacles();
    generateCoins();

    if (checkCollisions()) {
        gameOver();
        return;
    }

    hudScore.textContent = `🏆 ${score}`;
    hudCoins.textContent = `🪙 ${coins}`;
}

function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawObstacles();
    drawCoins();
    drawPlayer();
    drawParticles();
}

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    render();

    frameId = requestAnimationFrame(gameLoop);
}

function startGame() {
    resetGame();
    state = "playing";
    menuScreen.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
    hudEl.classList.remove("hidden");
    lastTime = performance.now();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(gameLoop);
}

function showMenu() {
    state = "menu";
    gameoverScreen.classList.add("hidden");
    hudEl.classList.add("hidden");
    menuScreen.classList.remove("hidden");

    if (highScore > 0) {
        menuHighscore.textContent = `🏆 Рекорд: ${highScore}`;
    }

    // Render background
    render();
}

// === Load high score ===
if (telegramId) {
    fetch(`/api/stats?telegram_id=${telegramId}`)
        .then(r => r.json())
        .then(data => {
            if (data.high_score) {
                highScore = data.high_score;
                menuHighscore.textContent = `🏆 Рекорд: ${highScore}`;
            }
        })
        .catch(() => {});
}

// === Input: Keyboard ===
document.addEventListener("keydown", (e) => {
    if (state !== "playing") return;

    switch (e.key) {
        case "ArrowLeft":
        case "a":
            if (player.lane > 0) player.lane--;
            break;
        case "ArrowRight":
        case "d":
            if (player.lane < 2) player.lane++;
            break;
        case "ArrowUp":
        case "w":
        case " ":
            if (!player.jumping && !player.sliding) {
                player.jumping = true;
                player.jumpStart = Date.now();
            }
            break;
        case "ArrowDown":
        case "s":
            if (!player.jumping && !player.sliding) {
                player.sliding = true;
                player.slideStart = Date.now();
            }
            break;
    }
});

// === Input: Touch / Swipe ===
canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (state !== "playing") return;

    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const minSwipe = 30;

    if (absDx < minSwipe && absDy < minSwipe) {
        // Tap = jump
        if (!player.jumping && !player.sliding) {
            player.jumping = true;
            player.jumpStart = Date.now();
        }
        return;
    }

    if (absDx > absDy) {
        // Horizontal swipe
        if (dx > minSwipe && player.lane < 2) player.lane++;
        else if (dx < -minSwipe && player.lane > 0) player.lane--;
    } else {
        // Vertical swipe
        if (dy < -minSwipe && !player.jumping && !player.sliding) {
            player.jumping = true;
            player.jumpStart = Date.now();
        } else if (dy > minSwipe && !player.jumping && !player.sliding) {
            player.sliding = true;
            player.slideStart = Date.now();
        }
    }
}, { passive: false });

// === Buttons ===
document.getElementById("btn-play").addEventListener("click", startGame);
document.getElementById("btn-retry").addEventListener("click", startGame);
document.getElementById("btn-menu").addEventListener("click", showMenu);

// === Init ===
showMenu();

// Keep rendering in menu too
(function menuRender() {
    if (state === "menu") render();
    if (state !== "playing") requestAnimationFrame(menuRender);
})();
