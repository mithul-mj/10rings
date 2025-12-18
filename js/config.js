// Game Config & Constants
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

// Global Sprites Storage
let sonSprite = null;
let fatherSprite = null;
let sonRunSprite = null;
let fatherRunSprite = null;

// Start Loading Immediately
loadCleanSprite('assets/images/son-me.png', (img) => { sonSprite = img; if (typeof game !== 'undefined' && game && game.player) game.player.img = img; });
loadCleanSprite('assets/images/father_sheet.png', (img) => { fatherSprite = img; if (typeof game !== 'undefined' && game && game.enemy) game.enemy.img = img; });
loadCleanSprite('assets/images/son_run.png', (img) => { sonRunSprite = img; if (typeof game !== 'undefined' && game && game.player) game.player.runImg = img; });
loadCleanSprite('assets/images/father_run.png', (img) => { fatherRunSprite = img; if (typeof game !== 'undefined' && game && game.enemy) game.enemy.runImg = img; });

const bgImage = new Image();
bgImage.src = 'assets/images/background.png';

// Canvas Scaling
let scale = 1;
let offsetX = 0;
let offsetY = 0;
const BASE_WIDTH = 1000;
const BASE_HEIGHT = 600;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    scale = Math.min(canvas.width / BASE_WIDTH, canvas.height / BASE_HEIGHT);

    offsetX = (canvas.width - (BASE_WIDTH * scale)) / 2;
    offsetY = (canvas.height - (BASE_HEIGHT * scale)) / 2;
}

window.addEventListener('resize', resize);
resize();

// Game Physics & Balance Constants
const FLOOR_TOP = 300;
const FLOOR_BOTTOM = 580;
const GRAVITY = 0.6;
const FRICTION = 0.85;
const MOVE_SPEED = 2.5;
const Z_MOVE_SPEED = 2;
const JUMP_FORCE = 11;

const RING_ORBIT_RADIUS = 60;
const RING_SPEED = 12;
const RING_RETURN_SPEED_BASE = 4;
const RING_RETURN_SPEED_BOOST = 9;
const RING_DAMAGE = 6;
const BURST_DAMAGE = 12;
const MELEE_DAMAGE = 5;
const MAX_HP = 500;

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
