// Input Handling
const keysPressed = {};
window.addEventListener('keydown', (e) => {
    keysPressed[e.key.toLowerCase()] = true;
    if (e.key === ' ') keysPressed[' '] = true;
});
window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
    if (e.key === ' ') keysPressed[' '] = false;
});

// Full Screen Logic
const fsBtn = document.getElementById('btn-fullscreen');
if (fsBtn) {
    fsBtn.addEventListener('click', () => {
        const doc = window.document;
        const docEl = doc.documentElement;

        const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
        const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

        if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
            if (requestFullScreen) {
                requestFullScreen.call(docEl).then(() => {
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
            if (cancelFullScreen) {
                cancelFullScreen.call(doc);
            }
        }
    });

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

// Virtual Joystick
class VirtualJoystick {
    constructor(elementId, type = "move") {
        this.zone = document.getElementById(elementId);
        this.knob = this.zone.querySelector('.stick-knob');
        this.active = false;
        this.center = { x: 0, y: 0 };
        this.input = { x: 0, y: 0 };
        this.touchId = null;
        this.type = type;

        this.zone.addEventListener('touchstart', this.onTouchStart.bind(this));

        this.boundOnTouchMove = this.onTouchMove.bind(this);
        this.boundOnTouchEnd = this.onTouchEnd.bind(this);

        this.zone.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

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
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.touchId);
        if (touch) {
            e.preventDefault();
            this.endDrag();
            window.removeEventListener('touchmove', this.boundOnTouchMove);
            window.removeEventListener('touchend', this.boundOnTouchEnd);
            window.removeEventListener('touchcancel', this.boundOnTouchEnd);
        }
    }

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
        const maxDist = 40;
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

// Triggers
let prevKeys = {};
function checkTrigger(key) {
    return keysPressed[key] && !prevKeys[key];
}

let prevTouch = {};
function checkTouchTrigger(key) {
    return touchButtons[key] && !prevTouch[key];
}
