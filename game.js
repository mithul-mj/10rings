const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Image Helper: Remove white background
function loadCleanSprite(src, callback) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        try {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, c.width, c.height);
            const data = imageData.data;
            // Simple threshold to remove white/near-white pixels
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230) {
                    data[i + 3] = 0; // Alpha to 0
                }
            }
            ctx.putImageData(imageData, 0, 0);
            const cleanImg = new Image();
            cleanImg.src = c.toDataURL();
            callback(cleanImg);
        } catch (e) {
            console.log("Background removal failed (likely CORS/file://), using original.", e);
            callback(img);
        }
    };
    img.onerror = () => {
        console.error("Failed to load image:", src);
        callback(null);
    };
}

// Load Images
let sonSprite = null;
let fatherSprite = null;
let sonRunSprite = null;
let fatherRunSprite = null;

loadCleanSprite('son-me.png', (img) => { sonSprite = img; if (game && game.player) game.player.img = img; });
loadCleanSprite('father_sheet.png', (img) => { fatherSprite = img; if (game && game.enemy) game.enemy.img = img; });
loadCleanSprite('son_run.png', (img) => { sonRunSprite = img; if (game && game.player) game.player.runImg = img; });
loadCleanSprite('father_run.png', (img) => { fatherRunSprite = img; if (game && game.enemy) game.enemy.runImg = img; });

const bgImage = new Image();
bgImage.src = 'background.png';

// Set canvas size
// Set canvas to full screen and handle scaling
let scale = 1;
let offsetX = 0;
let offsetY = 0;
const BASE_WIDTH = 1000;
const BASE_HEIGHT = 600;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Calculate scale to fit the base game resolution into the window
    // Use 'contain' style scaling to ensure the whole game arena is visible
    scale = Math.min(canvas.width / BASE_WIDTH, canvas.height / BASE_HEIGHT);

    // Center the game area
    offsetX = (canvas.width - (BASE_WIDTH * scale)) / 2;
    offsetY = (canvas.height - (BASE_HEIGHT * scale)) / 2;
}

window.addEventListener('resize', resize);
resize(); // Initial call

// 2.5D Constants
const FLOOR_TOP = 300;
const FLOOR_BOTTOM = 580;
const GRAVITY = 0.6;
const FRICTION = 0.85; // Slightly more slide/inertia
const MOVE_SPEED = 2.5; // Slower movement
const Z_MOVE_SPEED = 2;
const JUMP_FORCE = 11; // Slightly heavier jump

const RING_ORBIT_RADIUS = 60;
const RING_SPEED = 12;
const RING_RETURN_SPEED_BASE = 4;
const RING_RETURN_SPEED_BOOST = 9;
const RING_DAMAGE = 6;
const BURST_DAMAGE = 12;
const MELEE_DAMAGE = 5;
const MAX_HP = 500;

// Key mapping
const KEYS = {
    A: 'a',
    D: 'd',
    W: 'w',
    S: 's',
    SPACE: ' ',
    J: 'j',
    K: 'k',
    U: 'u',
    I: 'i',
    L: 'l'
};


// Input handling
const keysPressed = {};
window.addEventListener('keydown', (e) => {
    keysPressed[e.key.toLowerCase()] = true;
    if (e.key === ' ') keysPressed[' '] = true;
});
window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
    if (e.key === ' ') keysPressed[' '] = false;
});

// Full Screen Toggle
const fsBtn = document.getElementById('btn-fullscreen');
if (fsBtn) {
    fsBtn.addEventListener('click', () => {
        const doc = window.document;
        const docEl = doc.documentElement;

        const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

        if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
            // Enter Full Screen
            if (requestFullScreen) {
                requestFullScreen.call(docEl).then(() => {
                    // Try to lock orientation to landscape on mobile
                    if (screen.orientation && screen.orientation.lock) {
                        try {
                            screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed', e));
                        } catch (e) { }
                    }
                }).catch(err => {
                    console.log(`Error enabling full-screen: ${err.message}`);
                });
            }
        } else {
            // Exit Full Screen
            if (cancelFullScreen) {
                cancelFullScreen.call(doc);
            }
        }
    });

    // Update button text based on state + Force resize
    const onFsChange = () => {
        const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

        if (isFs) {
            fsBtn.textContent = "Exit Full Screen";
        } else {
            fsBtn.textContent = "⛶ Full Screen";
        }
        if (typeof resize === 'function') resize();
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
}

// Mobile Controls Logic
class VirtualJoystick {
    constructor(elementId, type = "move") {
        this.zone = document.getElementById(elementId);
        this.knob = this.zone.querySelector('.stick-knob');
        this.active = false;
        this.center = { x: 0, y: 0 };
        this.input = { x: 0, y: 0 }; // Normalized -1 to 1
        this.touchId = null;
        this.type = type; // 'move' or 'aim'

        // Bound events
        this.zone.addEventListener('touchstart', this.onTouchStart.bind(this));

        // Bind move/end to window to handle dragging outside the element
        this.boundOnTouchMove = this.onTouchMove.bind(this);
        this.boundOnTouchEnd = this.onTouchEnd.bind(this);

        // Mouse Support
        this.zone.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    // Touch Handlers
    onTouchStart(e) {
        e.preventDefault();
        const touch = Array.from(e.changedTouches)[0];
        if (touch) {
            this.touchId = touch.identifier;
            this.startDrag(touch.clientX, touch.clientY);

            window.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
            window.addEventListener('touchend', this.boundOnTouchEnd, { passive: false });
            window.addEventListener('touchcancel', this.boundOnTouchEnd, { passive: false });
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        if (!this.active) return;
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.touchId);
        if (touch) {
            this.updateInput(touch.clientX, touch.clientY);
        }
    }

    onTouchEnd(e) {
        // Don't prevent default here blindly, it might interfere if multiple touches?
        // Actually e.preventDefault is fine for game controls.
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.touchId);
        if (touch) {
            e.preventDefault();
            this.endDrag();
            window.removeEventListener('touchmove', this.boundOnTouchMove);
            window.removeEventListener('touchend', this.boundOnTouchEnd);
            window.removeEventListener('touchcancel', this.boundOnTouchEnd);
        }
    }

    // Mouse Handlers
    onMouseDown(e) {
        e.preventDefault();
        this.touchId = 'mouse';
        this.startDrag(e.clientX, e.clientY);
    }

    onMouseMove(e) {
        if (this.active && this.touchId === 'mouse') {
            e.preventDefault();
            this.updateInput(e.clientX, e.clientY);
        }
    }

    onMouseUp(e) {
        if (this.active && this.touchId === 'mouse') {
            e.preventDefault();
            this.endDrag();
        }
    }

    // Shared Logic
    startDrag(clientX, clientY) {
        this.active = true;
        this.zone.classList.add('active');
        const rect = this.zone.getBoundingClientRect();
        this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.updateInput(clientX, clientY);
    }

    endDrag() {
        this.active = false;
        this.touchId = null;
        this.input = { x: 0, y: 0 };
        this.zone.classList.remove('active');
        this.knob.style.transform = `translate(-50%, -50%)`;
    }

    updateInput(x, y) {
        const maxDist = 40; // Max radius
        const dx = x - this.center.x;
        const dy = y - this.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let moveX = dx;
        let moveY = dy;

        if (dist > maxDist) {
            moveX = (dx / dist) * maxDist;
            moveY = (dy / dist) * maxDist;
        }

        this.knob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

        this.input.x = moveX / maxDist;
        this.input.y = moveY / maxDist;
    }
}

// Global Touch State
const moveStick = new VirtualJoystick('stick-left', 'move');
const aimStick = new VirtualJoystick('stick-right', 'aim');
const touchButtons = {};

document.querySelectorAll('.mob-btn').forEach(btn => {
    const key = btn.dataset.key;
    const press = (e) => { e.preventDefault(); touchButtons[key] = true; btn.classList.add('active-btn'); };
    const release = (e) => { e.preventDefault(); touchButtons[key] = false; btn.classList.remove('active-btn'); };

    btn.addEventListener('touchstart', press);
    btn.addEventListener('touchend', release);
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
});


// Helper functions (3D adaptation)
function getDistance3D(e1, e2) {
    const dx = e2.x - e1.x;
    const dy = e2.y - e1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkCollision3D(r1, r2) {
    if (r1.z > r2.z + r2.h || r2.z > r1.z + r1.h) return false;
    // Increased depth tolerance for easier mobile aiming
    const depth = 50;
    return (r1.x < r2.x + r2.w &&
        r1.x + r1.w > r2.x &&
        Math.abs(r1.y - r2.y) < depth);
}

// Particle System 
class Particle {
    constructor(x, y, z, color, type) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.color = color;
        this.type = type;
        this.life = 1.0;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.vz = (Math.random() - 0.5) * 10;
        this.size = Math.random() * 5 + 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;
        this.vz -= GRAVITY * 0.5;
        this.vx *= 0.95; // Air resistance
        this.vy *= 0.95;

        // Floor bounce
        if (this.y > FLOOR_BOTTOM && this.vz < 0) {
            this.y = FLOOR_BOTTOM;
            this.vz *= -0.6;
            this.vx *= 0.8;
        }

        if (this.z < 0) {
            this.z = 0;
            this.vz *= -0.6;
            this.vx *= 0.8;
        }

        this.life -= 0.04;
        this.size *= 0.95;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // Core change for "glowing" look
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        const drawY = this.y - this.z;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Shockwave {
    constructor(x, y, z, color, type = 'normal') {
        this.x = x;
        this.y = y;
        this.z = z;
        this.color = color;
        this.type = type;
        this.radius = type === 'burst' ? 20 : 10;
        this.life = 1.0;
        this.lineWidth = type === 'burst' ? 8 : 4;
        this.growthRate = type === 'burst' ? 25 : 12;
    }

    update() {
        this.radius += this.growthRate;
        this.life -= 0.08;
        this.lineWidth *= 0.9;
        this.growthRate *= 0.9; // Decelerate expansion
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.life;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.translate(this.x, this.y - this.z);
        ctx.scale(1, 0.4); // Perspective
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

class ImpactFlash {
    constructor(x, y, z, color, size = 30) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.color = '#ffffff'; // Always bright white core
        this.glowColor = color;
        this.size = size;
        this.life = 1.0;
        this.decay = 0.2; // Fast fade
    }

    update() {
        this.life -= this.decay;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.life;

        // Core
        ctx.fillStyle = this.color;
        const drawY = this.y - this.z;

        ctx.beginPath();
        ctx.arc(this.x, drawY, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();

        // Outer Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.glowColor;
        ctx.strokeStyle = this.glowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.size * 1.5 * this.life, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}

// Ring Class
class Ring {
    constructor(owner, index, color) {
        this.owner = owner;
        this.index = index;
        this.color = color;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.w = 16;
        this.h = 16;
        this.state = 'orbit';
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.isBurst = false;
        this.trail = [];
        this.waitTimer = 0;
    }

    getBox() {
        return { x: this.x - 8, y: this.y, z: this.z - 8, w: 16, h: 16 };
    }

    update(target) {
        if (this.state === 'waiting') {
            this.waitTimer--;
            if (this.waitTimer <= 0) {
                this.state = 'returning';
            }
            return; // Stay in place
        }

        if (this.state !== 'orbit') {
            this.trail.push({ x: this.x, y: this.y, z: this.z, alpha: 0.5 });
            if (this.trail.length > 5) this.trail.shift();
        } else {
            this.trail = [];
        }

        if (this.state === 'orbit') {
            const angle = (Date.now() / 500) + (this.index * (Math.PI * 2 / 5));
            const offsetX = Math.cos(angle) * RING_ORBIT_RADIUS;
            const offsetY = Math.sin(angle) * (RING_ORBIT_RADIUS * 0.3);

            this.x = this.owner.centerX + offsetX;
            this.y = this.owner.centerY + offsetY;
            this.z = this.owner.z + 50;
        } else if (this.state === 'thrown') {
            this.x += this.vx;
            this.y += this.vy;
            this.z += this.vz;

            if (this.x < 0 || this.x > canvas.width || this.y < FLOOR_TOP - 100 || this.y > FLOOR_BOTTOM + 100) {
                this.startReturn(20); // Short delay when hitting bounds
            }

            const tBox = target.getBox();
            const rBox = this.getBox();

            if (checkCollision3D(rBox, tBox)) {
                // Calculate Damage with Multiplier
                const baseDmg = this.isBurst ? BURST_DAMAGE : RING_DAMAGE;
                target.takeDamage(baseDmg * this.owner.damageMultiplier);

                game.addEffect(this.x, this.y, this.z, this.color, this.isBurst ? 'burstHit' : 'hit');
                // Return immediately for smooth flow (removed delay 45 -> 0)
                this.startReturn(0);
            }

        } else if (this.state === 'whip') {
            // Line up in front of owner
            // Index 0 is closest, 4 is farthest
            const spacing = 40;
            const reach = (this.index + 1) * spacing + 40;
            const angle = this.owner.whipAngle || 0;

            // Dynamic extension using sin wave for 'crack' effect
            // Slower speed to match "Voice Length" (approx 1.4s)
            const time = (Date.now() - this.owner.whipStartTime) / 1400;
            // Extension phase: 0 to 1
            let extension = Math.sin(time * Math.PI);
            if (time > 1) extension = 0; // End

            if (extension <= 0 && time > 0.5) {
                this.state = 'returning';
                return;
            }

            const currentDist = reach * extension;

            this.x = this.owner.centerX + Math.cos(angle) * currentDist;
            this.y = this.owner.centerY + Math.sin(angle) * currentDist;
            this.z = this.owner.z + 40; // Waist height

            // Damage check in whip mode (continuous hitbox)
            if (extension > 0.5) { // Only hit at full extension
                const tBox = target.getBox();
                const rBox = this.getBox();
                if (checkCollision3D(rBox, tBox)) {
                    if (this.owner.canHitWhip) {
                        // target.takeDamage(5); 
                        target.vx = Math.cos(angle) * 5;
                        target.takeDamage(2 * this.owner.damageMultiplier); // Multi-hit potential, scaled
                        game.addEffect(this.x, this.y, this.z, '#fff', 'spark');
                    }
                }
            }

        } else if (this.state === 'returning') {
            const dx = this.owner.centerX - this.x;
            const dy = this.owner.centerY - this.y;
            const dz = (this.owner.z + 50) - this.z;

            let speed = RING_RETURN_SPEED_BASE;

            const toRingX = this.x - this.owner.centerX;
            if ((this.owner.vx > 0 && toRingX > 0) || (this.owner.vx < 0 && toRingX < 0)) {
                speed = RING_RETURN_SPEED_BOOST;
            }

            const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (totalDist > 0) {
                this.x += (dx / totalDist) * speed;
                this.y += (dy / totalDist) * speed;
                this.z += (dz / totalDist) * speed;
            }

            if (totalDist < 30) {
                this.state = 'orbit';
                this.isBurst = false;
            }
        }
    }

    throw(targetX, targetY, targetZ, isBurst = false, manualVector = null) {
        if (this.state !== 'orbit') return;
        this.state = 'thrown';
        this.isBurst = isBurst;

        let vx, vy, vz;

        if (manualVector) {
            // Manual Aim (Normalized 2D vector for direction, usually flat Z unless we add Z aim later)
            // Just shoot flat for now or maybe slightly up?
            // standard speed
            const angle = Math.atan2(manualVector.y, manualVector.x);
            vx = Math.cos(angle) * RING_SPEED;
            vy = Math.sin(angle) * RING_SPEED;
            vz = 0; // Flat throw
        } else {
            // Target Aim (3D)
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dz = targetZ - this.z;

            let finalAngle = Math.atan2(dy, dx);
            if (isBurst) {
                finalAngle += (Math.random() - 0.5) * 0.5;
            }

            // To ensure constant speed in 3D
            // We calculate horizontal speed components first
            // Actually, keep it simple. Projectile speed RING_SPEED is total magnitude.
            const dist2d = Math.sqrt(dx * dx + dy * dy);
            const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist3d < 0.1) {
                vx = RING_SPEED; vy = 0; vz = 0; // Default if on top of each other
            } else {
                vx = (dx / dist3d) * RING_SPEED;
                vy = (dy / dist3d) * RING_SPEED;
                vz = (dz / dist3d) * RING_SPEED;

                // Add burst randomization to final velocity vector slightly?
                // The angle logic above for burst was ignoring Z. 
                // Let's re-apply burst jitter if needed
                if (isBurst) {
                    vx += (Math.random() - 0.5) * 2;
                    vy += (Math.random() - 0.5) * 2;
                    vz += (Math.random() - 0.5) * 2;
                }
            }
        }

        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
    }

    startReturn(delay = 0) {
        if (delay > 0) {
            this.state = 'waiting';
            this.waitTimer = delay;
        } else {
            this.state = 'returning';
        }
    }

    draw(ctx) {
        this.trail.forEach(t => {
            const drawY = t.y - t.z;
            ctx.fillStyle = this.color;
            ctx.globalAlpha = t.alpha;
            ctx.beginPath();
            ctx.arc(t.x, drawY, 6, 0, Math.PI * 2);
            ctx.fill();
            t.alpha -= 0.1;
        });

        ctx.globalAlpha = 1.0;
        const drawY = this.y - this.z;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.arc(this.x, drawY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(this.x, drawY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }
}

// Fighter Class
class Fighter {
    constructor(x, y, color, name, isAI = false, img) {
        this.x = x;
        this.y = y;
        this.z = 0;
        this.w = 50;
        this.h = 100;

        this.vx = 0;
        this.vy = 0;
        this.vz = 0;

        this.color = color;
        this.name = name;
        this.isAI = isAI;
        this.img = img;
        this.hp = MAX_HP;
        this.facing = isAI ? -1 : 1;

        this.rings = [];
        for (let i = 0; i < 5; i++) {
            this.rings.push(new Ring(this, i, isAI ? '#2196f3' : '#ffd700'));
        }

        this.isGrounded = true;
        this.attackCooldown = 0;
        this.burstCooldown = 0;
        this.specialCooldown = 0;
        this.state = 'idle';
        this.stateTimer = 0;
        this.damageMultiplier = 1.0;
        this.rotation = 0; // For death anim
    }

    get centerX() { return this.x + this.w / 2; }
    get centerY() { return this.y; }
    get centerZ() { return this.z + this.h / 2; }

    getBox() {
        return { x: this.x, y: this.y, z: this.z, w: this.w, h: this.h };
    }

    update(target) {
        if (!this.isGrounded) {
            this.vz -= GRAVITY;
            this.z += this.vz;

            if (this.z <= 0) {
                this.z = 0;
                this.vz = 0;
                this.isGrounded = true;
                if (this.state !== 'dead') this.state = 'idle';
            }
        }

        // Death Physics
        if (this.state === 'dead') {
            // Slide friction
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.9;
            this.vy *= 0.9;

            if (this.isGrounded) {
                this.rotation = Math.min(Math.PI / 2, this.rotation + 0.1); // Fall over
            }
            return; // Skip normal update
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.isGrounded) {
            this.vx *= FRICTION;
            this.vy *= FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
            if (Math.abs(this.vy) < 0.1) this.vy = 0;
        }

        if (this.x < 0) this.x = 0;
        if (this.x + this.w > BASE_WIDTH) this.x = BASE_WIDTH - this.w;
        if (this.y < FLOOR_TOP) this.y = FLOOR_TOP;
        if (this.y > FLOOR_BOTTOM) this.y = FLOOR_BOTTOM;

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.burstCooldown > 0) this.burstCooldown--;
        if (this.specialCooldown > 0) this.specialCooldown--;

        this.rings.forEach(ring => ring.update(target));

        if (this.stateTimer > 0) {
            this.stateTimer--;
            if (this.stateTimer <= 0) {
                if (['punch', 'kick', 'stun', 'burst', 'special', 'dragonWhip'].includes(this.state)) {
                    this.state = 'idle';
                }
            }
        }
    }

    move(dx, dy) {
        if (this.state === 'stun') return;

        this.vx += dx * 1.5;
        this.vy += dy * 1.5;

        const maxV = MOVE_SPEED;
        const maxVZ = Z_MOVE_SPEED;

        if (this.vx > maxV) this.vx = maxV;
        if (this.vx < -maxV) this.vx = -maxV;
        if (this.vy > maxVZ) this.vy = maxVZ;
        if (this.vy < -maxVZ) this.vy = -maxVZ;

        if (Math.abs(dx) > 0.1) {
            this.facing = dx > 0 ? 1 : -1;
            if (this.state === 'idle') this.state = 'run';
        }
    }

    jump() {
        if (this.isGrounded && this.state !== 'stun') {
            this.vz = JUMP_FORCE;
            this.isGrounded = false;
            this.state = 'jump';
            if (typeof sfx !== 'undefined') sfx.playJump();
        }
    }

    meleeAttack(type, target) {
        if (this.attackCooldown > 0 || this.state === 'stun') return;

        this.state = type;
        this.stateTimer = 20;
        this.attackCooldown = 30;

        const range = type === 'punch' ? 60 : 70;
        let damage = type === 'punch' ? MELEE_DAMAGE : MELEE_DAMAGE + 2;
        damage *= this.damageMultiplier;

        const hitX = this.facing === 1 ? this.x + this.w : this.x - range;

        const attackBox = {
            x: hitX,
            y: this.y,
            z: this.z,
            w: range,
            h: this.h
        };

        if (checkCollision3D(attackBox, target.getBox())) {
            target.vx = this.facing * 8;
            target.takeDamage(damage);
            game.addEffect(target.centerX, target.centerY, target.z + 50, '#fff', 'hit');
        }
    }

    throwRing(target, manualVector = null) {
        if (this.state === 'stun') return;
        const ring = this.rings.find(r => r.state === 'orbit');
        if (ring) {
            // If manual vector, target coords are ignored by updated Ring.throw, but we pass placeholders
            ring.throw(target ? target.centerX : 0, target ? target.centerY : 0, target ? target.z + 50 : 0, false, manualVector);
            this.attackCooldown = 20;
            if (typeof sfx !== 'undefined') sfx.playThrow();
            return true;
        }
        return false;
    }

    burstAttack(target) {
        if (this.burstCooldown > 0 || this.state === 'stun') return;

        const availableRings = this.rings.filter(r => r.state === 'orbit');
        if (availableRings.length === 5) {
            availableRings.forEach(r => r.throw(target.centerX, target.centerY, target.z + 50, true));
            this.burstCooldown = 900;
            this.state = 'burst';
            this.stateTimer = 35; // Matches slower animation (5 frames * 90ms = 450ms approx 27 ticks)

            game.addEffect(this.centerX, this.centerY, this.z, this.color, 'shockwave');
            if (typeof sfx !== 'undefined') sfx.playBurst();
        }
    }

    whipAttack(target) {
        if (this.state === 'stun' || this.specialCooldown > 0) return;
        // Let's use attackCooldown for this one, but longer.
        if (this.attackCooldown > 0) return;

        const availableRings = this.rings.filter(r => r.state === 'orbit');
        if (availableRings.length === 5) {
            this.attackCooldown = 100; // Animation Lock (~1.6s)
            this.specialCooldown = 540; // Refill Time (9s) increased from 5s
            this.whipStartTime = Date.now();
            this.canHitWhip = true; // Reset hit flag? Actually in update we do continuous per frame safe damage

            // Calculate angle
            let angle = 0;
            if (this.isAI) {
                angle = Math.atan2(target.centerY - this.y, target.centerX - this.x);
            } else {
                // Player aims with Stick if active, else towards enemy
                if (aimStick.active) {
                    angle = Math.atan2(aimStick.input.y, aimStick.input.x);
                } else {
                    angle = Math.atan2(target.centerY - this.y, target.centerX - this.x);
                }
            }
            this.whipAngle = angle;

            availableRings.forEach(r => r.state = 'whip');
            game.addEffect(this.centerX, this.centerY, this.z, this.color, 'shockwave');
            if (typeof sfx !== 'undefined') sfx.playSnake();
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (game) game.addEffect(this.x + this.w / 2, this.y + 20, this.z, '#fff', 'spark');
        if (typeof sfx !== 'undefined') sfx.playHit();

        if (this.hp < 0) this.hp = 0;
        if (this.hp <= 0) {
            this.state = 'dead';
            this.vx = -this.facing * 5; // Knockback
            this.vz = 10; // Pop up
            this.isGrounded = false;
            if (typeof sfx !== 'undefined') sfx.playBurst(); // Death sound
        }
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        const shadowScale = Math.max(0.5, 1 - (this.z / 200));
        const sW = this.w * shadowScale;
        const sH = 15 * shadowScale;

        ctx.beginPath();
        ctx.ellipse(this.centerX, this.y, sW / 2, sH / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        const drawX = this.x;
        // Adjust drawY to be grounded at foot level
        const drawY = this.y - this.h - this.z;

        ctx.save();
        if (this.hp <= 0) ctx.globalAlpha = 0.5;

        // Draw Image (Sprite Sheet Logic)
        if (this.img && this.img.complete) {

            // 1. Determine Animation State
            let animState = 'idle';
            // Include complex attacks for animation so he doesn't slide
            if (['punch', 'kick', 'burst', 'special', 'dragonWhip'].includes(this.state)) {
                animState = 'attack';
            } else if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
                animState = 'run';
            }

            // 2. Frame Calculation
            // 2. Frame Logic
            const cols = 6;
            const rows = 3;
            const frameW = this.img.width / cols;
            const frameH = this.img.height / rows;

            let row = 0;
            let startFrame = 0;
            let frameCount = 4;
            let speed = 200;
            let isLoop = true;

            if (animState === 'run') {
                row = 1;
                frameCount = 6;
                speed = 120; // Slower run
            } else if (animState === 'attack') {
                row = 2;
                speed = 90; // Heavier attacks
                isLoop = false; // Sync with state timer

                // Split Punch/Kick/Combo
                if (this.state === 'punch') {
                    startFrame = 0;
                    frameCount = 3;
                } else if (this.state === 'kick') {
                    // Kick is later in the row
                    startFrame = 3;
                    frameCount = 2; // Frames 3, 4
                } else {
                    // Burst/Special -> Full Combo
                    startFrame = 0;
                    frameCount = 5;
                }
            } else {
                // Idle
                startFrame = 0;
                frameCount = 4;
            }

            let frameIndex = 0;

            if (isLoop) {
                frameIndex = Math.floor(Date.now() / speed) % frameCount;
            } else {
                // One-shot animation based on State Timer
                // We want to map maxTime..0 to 0..frameCount-1
                let maxTime = 20;
                if (this.state === 'burst') maxTime = 35;

                // Inverse: 0 at maxTime, 1 at 0
                const progress = Math.max(0, Math.min(1, (maxTime - this.stateTimer) / maxTime));
                frameIndex = Math.floor(progress * frameCount);
                if (frameIndex >= frameCount) frameIndex = frameCount - 1;
            }

            const finalFrame = startFrame + frameIndex;
            const sx = finalFrame * frameW;
            const sy = row * frameH;


            // 3. Render Offsets & Scaling (Tuning)
            // Re-tuning for 'son-me.png'
            let spriteOffsetX = 0;
            let spriteOffsetY = -10; // Lowered to ground him better
            let spriteScale = 1.25; // Balanced size

            // FATHER SPECIFIC ALIGNMENT
            if (this.name === 'Father') {
                spriteScale = 1.5; // Keep Father larger
                spriteOffsetY = -20;
            }

            // SOURCE RECTANGLE CLIPPING (Crucial for AI Sprite Sheets)
            // 1. Prevent "Sprite Below" showing: Clip bottom height significantly
            // 2. Prevent "Head Cut Off": Keep Top Y (sy) at 0 relative to row
            const bleedPadX = 2;
            const bleedPadBottom = 2; // Minimal crop to show Feet/Toes

            const srcX = sx + bleedPadX;
            const srcY = sy; // Start at very top of row to capture full head
            const srcW = frameW - (bleedPadX * 2);
            const srcH = frameH - bleedPadBottom;

            // Calculate dimensions preserving Aspect Ratio of the CASHED source
            const destH = Math.floor((this.h) * spriteScale);
            const aspectRatio = srcW / srcH;
            const destW = Math.floor(destH * aspectRatio);

            // Recalculate X offset to center the sprite on the hitbox
            // Hitbox Center: drawX + this.w / 2
            // Sprite Center: destX + destW / 2
            // We want Sprite Center = Hitbox Center
            // destX = (drawX + this.w / 2) - destW / 2 + customOffset

            // We'll use local translate for center-pivot drawing below, so we just need size here.

            // Draw Center Pivot Logic is best for handling width changes
            const centerX = Math.floor(drawX + this.w / 2);
            const bottomY = Math.floor(drawY + this.h);

            ctx.save();

            // Translate to feet position
            ctx.translate(centerX, bottomY + spriteOffsetY);

            // Flip if needed
            ctx.scale(this.facing, 1);

            // Death Rotation
            if (this.state === 'dead') {
                // pivot is feet, so this looks like falling backward
                ctx.rotate(-this.rotation * this.facing); // Rotate opposite to facing to fall 'back'
                ctx.translate(0, -10); // Adjust pivot slightly
            }

            // Draw image centered on X, anchored at bottom Y
            // (0,0) is now the feet pivot
            // Use calculated source rects
            ctx.drawImage(this.img, srcX, srcY, srcW, srcH, -destW / 2, -destH, destW, destH);

            ctx.restore();
        } else {
            // Fallback Rect
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, drawY, this.w, this.h);
            ctx.fillStyle = '#fff';
            const eyeOffset = this.facing === 1 ? this.w - 15 : 5;
            ctx.fillRect(drawX + eyeOffset, drawY + 10, 10, 10);
        }

        // Overhead HP bar removed; UI health bar displayed at top

        ctx.restore();

        this.rings.forEach(r => r.draw(ctx));
    }
}

// AI Controller
class AIController {
    constructor(fighter, opponent, level = 1) {
        this.fighter = fighter;
        this.opponent = opponent;
        this.state = 'idle'; // idle, chase, retreat, orbit, aggressive
        this.stateTimer = 0;
        this.moveDir = { x: 0, y: 0 };
        this.reactionDelay = 0;

        // Difficulty Scaling
        this.level = level;
        // Reduce reaction delay as level increases. Base 15, -1 per level, min 0
        this.reactionBase = Math.max(0, 15 - (level * 2));
    }

    update() {
        if (this.fighter.hp <= 0) return;

        const dist = getDistance3D(this.fighter, this.opponent);
        const yDiff = this.fighter.y - this.opponent.y; // Signed Y diff
        const absYDiff = Math.abs(yDiff);
        const hasAmmo = this.fighter.rings.some(r => r.state === 'orbit');

        // State Machine Update
        this.stateTimer--;
        if (this.stateTimer <= 0) {
            this.pickNewState(dist, hasAmmo);
        }

        // --- Critical Reactions (Override State) ---

        // 1. Dodge Projectiles (with slight delay/chance)
        const incomingRing = this.opponent.rings.find(r => {
            return r.state === 'thrown' && getDistance3D(r, this.fighter) < 150;
        });

        if (incomingRing) {
            if (this.reactionDelay <= 0) {
                if (Math.random() < 0.15) this.fighter.jump(); // Jump dodge
                else if (Math.random() < 0.2) {
                    // Sidestep dodge
                    this.moveDir.y = Math.sign(this.fighter.y - incomingRing.y) || (Math.random() > 0.5 ? 1 : -1);
                    this.state = 'dodge';
                    this.stateTimer = 10;
                    this.reactionDelay = this.reactionBase + 15; // Reset cooldown
                }
                this.reactionDelay = this.reactionBase + 15; // Reset cooldown
            }
        }
        if (this.reactionDelay > 0) this.reactionDelay--;


        // --- State Execution ---

        let dx = this.moveDir.x;
        let dy = this.moveDir.y;

        if (this.state === 'idle') {
            // Just stand still or micro movements
            dx = 0; dy = 0;
            // Occasional pot shot
            // Occasional pot shot
            if (hasAmmo && dist < 500 && Math.random() < 0.005) this.fighter.throwRing(this.opponent);

        } else if (this.state === 'chase') {
            // Close distance
            dx = (this.fighter.x < this.opponent.x) ? 1 : -1;
            dy = (yDiff < -10) ? 1 : (yDiff > 10 ? -1 : 0);

            // If close enough, attack
            // Aggression Scales with level: 0.02 base * level multiplier
            const aggroMult = 1 + (this.level * 0.2);
            if (dist < 300 && hasAmmo && Math.random() < 0.02 * aggroMult) {
                this.fighter.throwRing(this.opponent);
            }
            if (dist < 60 && absYDiff < 30) {
                if (Math.random() < 0.5) this.fighter.meleeAttack('punch', this.opponent);
                else this.fighter.meleeAttack('kick', this.opponent);
            }

        } else if (this.state === 'retreat') {
            // Back off
            dx = (this.fighter.x < this.opponent.x) ? -1 : 1;
            dy = (yDiff < -20) ? 1 : (yDiff > 20 ? -1 : 0); // Align vaguely

            // Wall avoidance jump
            if ((this.fighter.x < 50 && dx === -1) ||
                (this.fighter.x > canvas.width - 50 && dx === 1)) {
                this.fighter.jump();
                dx = -dx; // Bounce off wall
            }

            // Defend while retreating
            if (hasAmmo && Math.random() < 0.02) this.fighter.throwRing(this.opponent);

        } else if (this.state === 'orbit') {
            // Circle around or drift vertically
            dx = 0;
            // Move vertically perpendicular to opponent line-ish
            dy = this.moveDir.y;

            // Keep X distance somewhat constant
            if (dist < 200) dx = (this.fighter.x < this.opponent.x) ? -1 : 1;
            else if (dist > 400) dx = (this.fighter.x < this.opponent.x) ? 1 : -1;

            if (hasAmmo && Math.random() < 0.01) this.fighter.throwRing(this.opponent);
        } else if (this.state === 'retrieve') {
            // Find nearest ring
            const returningRing = this.fighter.rings
                .filter(r => r.state === 'returning')
                .sort((a, b) => getDistance3D(a, this.fighter) - getDistance3D(b, this.fighter))[0];

            if (returningRing) {
                if (returningRing.x < this.fighter.x) dx = -1; else dx = 1;
                if (returningRing.y < this.fighter.y) dy = -1; else dy = 1;
            } else {
                this.state = 'retreat'; // Panic?
            }
        }

        this.fighter.move(dx, dy);
    }

    pickNewState(dist, hasAmmo) {
        const rand = Math.random();

        // Default Logic based on situation
        if (!hasAmmo) {
            // Prioritize retrieving rings or avoiding combat
            this.state = 'retrieve';
            this.stateTimer = 40;
            return;
        }

        if (dist < 100) {
            // Close Quarters
            if (rand < 0.6) {
                this.state = 'retreat';
                this.stateTimer = 20 + Math.random() * 20;
            } else {
                this.state = 'chase'; // Aggressive melee
                this.stateTimer = 15;
            }
        } else {
            // Mid/Long Range
            if (rand < 0.4) {
                this.state = 'orbit';
                this.moveDir.y = Math.random() > 0.5 ? 1 : -1;
                this.stateTimer = 50 + Math.random() * 50; // Longer orbit
            } else if (rand < 0.6) {
                this.state = 'chase';
                this.stateTimer = 30 + Math.random() * 30;
            } else {
                this.state = 'idle'; // Pause/Wait - More frequent
                this.stateTimer = 30 + Math.random() * 40; // Longer pause
            }
        }

        this.moveDir.x = (Math.random() - 0.5) * 2; // unused mostly
    }
}

// Game Loop
class Game {
    constructor() {
        this.level = 1;
        this.reset(false);
        this.running = false; // Start paused
        this.deathTimer = 0;
        // Link initial global sprites if they loaded before reset was called (edge case)
        if (this.player) this.player.runImg = sonRunSprite;
        if (this.enemy) this.enemy.runImg = fatherRunSprite;
    }

    reset(nextLevel = false) {
        if (nextLevel) {
            this.level++;
        } else {
            this.level = 1;
        }

        // Apply Scaling
        // Son (Player): Reduce power each level. Min 0.5
        const playerPower = Math.max(0.5, 1.0 - ((this.level - 1) * 0.1));

        // Father (Enemy): Increase power each level. Base power boosted to 1.4
        const enemyPower = 1.4 + ((this.level - 1) * 0.15);

        this.player = new Fighter(100, 400, '#ffd700', 'Son', false, sonSprite);
        this.player.damageMultiplier = playerPower;
        this.player.runImg = sonRunSprite; // Link run sprite

        this.enemy = new Fighter(800, 400, '#2196f3', 'Father', true, fatherSprite);
        this.enemy.damageMultiplier = enemyPower;
        this.enemy.runImg = fatherRunSprite; // Link run sprite

        this.ai = new AIController(this.enemy, this.player, this.level);
        this.effects = [];

        this.running = true;
        document.getElementById('game-over-screen').classList.add('hidden');

        const lvlDisplay = document.getElementById('level-display');
        if (lvlDisplay) lvlDisplay.textContent = "Level " + this.level;
    }

    update() {
        if (!this.running) return;

        let dx = 0; let dy = 0;

        // Keyboard
        if (keysPressed[KEYS.A]) dx = -1;
        if (keysPressed[KEYS.D]) dx = 1;
        if (keysPressed[KEYS.W]) dy = -1;
        if (keysPressed[KEYS.S]) dy = 1;

        // Joystick override (if active)
        if (Math.abs(moveStick.input.x) > 0.1 || Math.abs(moveStick.input.y) > 0.1) {
            dx = moveStick.input.x;
            dy = moveStick.input.y;
        }

        this.player.move(dx, dy);

        // Jump
        if (keysPressed[KEYS.SPACE] || touchButtons[' ']) this.player.jump();

        // Actions
        // if (checkTrigger(KEYS.J) || checkTouchTrigger('j')) this.player.meleeAttack('punch', this.enemy);
        // if (checkTrigger(KEYS.K) || checkTouchTrigger('k')) this.player.meleeAttack('kick', this.enemy);
        if (checkTrigger(KEYS.I) || checkTouchTrigger('i')) this.player.burstAttack(this.enemy);

        // Special Attack (Dragon Whip)
        if (checkTrigger(KEYS.L) || checkTouchTrigger('l')) this.player.whipAttack(this.enemy);

        // Aim / Throw
        if (aimStick.active) {
            // Can add aiming visual here in future
        } else if (aimStick.wasActive) {
            // Throw on Release
            if (Math.sqrt(aimStick.lastInput.x ** 2 + aimStick.lastInput.y ** 2) > 0.3) {
                this.player.throwRing(null, aimStick.lastInput);
            }
            aimStick.wasActive = false;
        }


        this.player.update(this.enemy);
        this.enemy.update(this.player);
        this.ai.update();

        this.effects.forEach((e, i) => {
            e.update();
            if (e.life <= 0) this.effects.splice(i, 1);
        });

        if (this.player.hp <= 0 || this.enemy.hp <= 0) {
            if (this.deathTimer === 0) this.deathTimer = 120; // 2 seconds before menu
            this.deathTimer--;
            if (this.deathTimer <= 0) {
                this.endGame();
            }
        }

        // Running Sound Logic
        const isPlayerRunning = (Math.abs(this.player.vx) > 0.1 || Math.abs(this.player.vy) > 0.1) && this.player.isGrounded;
        if (typeof sfx !== 'undefined' && sfx.updateRunSound) sfx.updateRunSound(isPlayerRunning);

        this.updateUI();

        aimStick.wasActive = aimStick.active;
        if (aimStick.active) aimStick.lastInput = { ...aimStick.input };

        Object.assign(prevKeys, keysPressed);
        Object.assign(prevTouch, touchButtons);
    }

    draw() {
        // 1. Draw Background (Screen Space) - Cover mode (No Stretch)
        if (bgImage.complete) {
            const screenRatio = canvas.width / canvas.height;
            const imgRatio = bgImage.width / bgImage.height;

            let drawW, drawH, startX, startY;

            if (screenRatio > imgRatio) {
                // Screen is wider than image: Fill width, crop height
                drawW = canvas.width;
                drawH = bgImage.height * (canvas.width / bgImage.width);
                startX = 0;
                startY = (canvas.height - drawH) / 2;
            } else {
                // Screen is taller than image: Fill height, crop width
                drawH = canvas.height;
                drawW = bgImage.width * (canvas.height / bgImage.height);
                startX = (canvas.width - drawW) / 2;
                startY = 0;
            }

            ctx.drawImage(bgImage, startX, startY, drawW, drawH);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();
        // Apply scaling and centering
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Calculate visible bounds in game-space coordinates
        const viewLeft = -offsetX / scale;
        const viewRight = (canvas.width - offsetX) / scale;
        const viewTop = -offsetY / scale;
        const viewBottom = (canvas.height - offsetY) / scale;



        // Draw Floor Area (Extended infinitely)
        // Made transparent as requested to show background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(viewLeft, FLOOR_TOP, (viewRight - viewLeft), FLOOR_BOTTOM - FLOOR_TOP);

        // Draw "Arena" boundaries/markings
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Left Wall Marker
        ctx.moveTo(0, FLOOR_TOP); ctx.lineTo(0, FLOOR_BOTTOM);
        // Right Wall Marker
        ctx.moveTo(BASE_WIDTH, FLOOR_TOP); ctx.lineTo(BASE_WIDTH, FLOOR_BOTTOM);
        ctx.stroke();

        // Floor Grid (Everywhere)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Vertical lines every 100px, extending to view lines
        const startGrid = Math.floor(viewLeft / 100) * 100;
        const endGrid = Math.ceil(viewRight / 100) * 100;

        for (let i = startGrid; i <= endGrid; i += 100) {
            ctx.moveTo(i, FLOOR_TOP); ctx.lineTo(i, FLOOR_BOTTOM);
        }
        ctx.stroke();

        const renderList = [
            { type: 'fighter', obj: this.player },
            { type: 'fighter', obj: this.enemy },
            ...this.effects.map(e => ({ type: 'effect', obj: e }))
        ];

        renderList.sort((a, b) => a.obj.y - b.obj.y);

        renderList.forEach(item => {
            item.obj.draw(ctx);
        });

        // Semi-transparent walls at edges to show bounds clearly
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.fillRect(-20, FLOOR_TOP, 20, FLOOR_BOTTOM - FLOOR_TOP);
        ctx.fillRect(BASE_WIDTH, FLOOR_TOP, 20, FLOOR_BOTTOM - FLOOR_TOP);

        ctx.restore(); // Restore context for next frame/UI if any
    }

    addEffect(x, y, z, color, type) {
        if (type === 'hit') {
            // Normal Hit
            this.effects.push(new ImpactFlash(x, y, z, color, 30));
            this.effects.push(new Shockwave(x, y, z, color, 'normal'));
            for (let i = 0; i < 6; i++) {
                this.effects.push(new Particle(x, y, z, color, 'spark'));
            }
        } else if (type === 'burstHit') {
            // Big Burst Hit
            this.effects.push(new ImpactFlash(x, y, z, color, 60));
            this.effects.push(new Shockwave(x, y, z, color, 'burst'));
            // Add extra sparkles
            for (let i = 0; i < 15; i++) {
                this.effects.push(new Particle(x, y, z, color, 'spark'));
                this.effects.push(new Particle(x, y, z, '#fff', 'spark')); // White sparks too
            }
        } else if (type === 'shockwave') { // Activation
            this.effects.push(new Shockwave(x, y, z, color, 'burst'));
            for (let i = 0; i < 10; i++) {
                this.effects.push(new Particle(x, y, z, color, 'spark'));
            }
        } else {
            this.effects.push(new Particle(x, y, z, color, type));
        }
    }

    updateUI() {
        const currentScale = scale || 1; // define currentScale within scope if needed, but 'scale' is global
        // We need to use valid values here.
        // Actually, let's keep it simple.
        document.getElementById('player-hp').style.width = (this.player.hp / MAX_HP * 100) + '%';
        document.getElementById('enemy-hp').style.width = (this.enemy.hp / MAX_HP * 100) + '%';

        const playerReady = this.player.rings.filter(r => r.state === 'orbit').length;
        const enemyReady = this.enemy.rings.filter(r => r.state === 'orbit').length;

        // Render Visual Rings
        const updateRingDisplay = (containerId, count, total, type) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            // Simple rebuild (active vs inactive)
            let html = '';
            for (let i = 0; i < total; i++) {
                const isActive = i < count ? 'active' : '';
                html += `<div class="ring-dot ${type}-ring ${isActive}"></div>`;
            }
            // Only update if changed to avoid thrashing? actually innerHTML is fast enough for 5 div
            if (container.dataset.lastCount != count) {
                container.innerHTML = html;
                container.dataset.lastCount = count;
            }
        };

        updateRingDisplay('player-rings-display', playerReady, 5, 'son');
        updateRingDisplay('enemy-rings-display', enemyReady, 5, 'father');

        // Visual Cooldowns
        const burstBtn = document.getElementById('btn-burst');
        if (burstBtn) {
            const burstFill = burstBtn.querySelector('.btn-fill');
            if (burstFill) {
                // Burst CD is 900
                const pct = Math.max(0, Math.min(100, (1 - (this.player.burstCooldown / 900)) * 100));
                burstFill.style.height = pct + '%';

                // Optional: Grey out if not enough rings?
                // Burst requires 5 rings.
                if (playerReady < 5) {
                    burstBtn.style.opacity = '0.5';
                } else {
                    burstBtn.style.opacity = '1';
                }
            }
        }

        const specialBtn = document.getElementById('btn-special');
        if (specialBtn) {
            const specialFill = specialBtn.querySelector('.btn-fill');
            if (specialFill) {
                // Special Attack CD is 540
                // Normalize against 540 for full drain visualization
                const pct = Math.max(0, Math.min(100, (1 - (this.player.specialCooldown / 540)) * 100));
                specialFill.style.height = pct + '%';

                if (playerReady < 5) {
                    specialBtn.style.opacity = '0.5';
                } else {
                    specialBtn.style.opacity = '1';
                }
            }
        }
    }

    endGame() {
        this.running = false;
        if (typeof sfx !== 'undefined' && sfx.updateRunSound) sfx.updateRunSound(false);
        const screen = document.getElementById('game-over-screen');
        const text = document.getElementById('winner-text');
        const btn = screen.querySelector('button');

        screen.classList.remove('hidden');
        if (this.player.hp <= 0) {
            text.textContent = "Father Wins!";
            text.style.color = '#f00';
            btn.textContent = "Restart Game";
            btn.onclick = () => game.reset(false);
        } else {
            text.textContent = "Level " + this.level + " Complete!";
            text.style.color = '#0f0';
            btn.textContent = "Next Level >>";
            btn.onclick = () => game.reset(true);
        }
    }
}

// Global Trigger Helper
let prevKeys = {};
function checkTrigger(key) {
    return keysPressed[key] && !prevKeys[key];
}

let prevTouch = {};
function checkTouchTrigger(key) {
    return touchButtons[key] && !prevTouch[key];
}

const game = new Game();
function loop() {
    if (game.running) game.update();
    game.draw();
    requestAnimationFrame(loop);
}
loop();

// Global Start Function
window.startGame = function () {
    const home = document.getElementById('home-screen');
    home.style.display = 'none';
    game.running = true;

    // Start BGM
    if (typeof sfx !== 'undefined') sfx.playBGM();

    // Attempt fullscreen + landscape lock
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
        docEl.requestFullscreen().then(() => {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => { });
            }
        }).catch(() => { });
    }
};
