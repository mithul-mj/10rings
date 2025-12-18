
// Sound Manager using Web Audio API
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Low volume default
        this.masterGain.connect(this.ctx.destination);
    }

    playTone(freq, type, duration, slideTo = null) {
        // Keep for legacy/fallback or other sounds
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playFile(path, vol = 1.0) {
        const audio = new Audio(path);
        audio.volume = vol;
        audio.play().catch(e => { }); // Ignore play errors
    }

    playThrow() {
        this.playFile('assets/audio/single fire.mp3', 0.8);
    }

    playJump() {
        this.playFile('assets/audio/jump.mp3', 0.6);
    }

    playHit() {
        this.playTone(100, 'square', 0.1, 50);
    }

    playClash() {
        this.playTone(1200, 'sine', 0.1);
    }

    playBurst() {
        this.playFile('assets/audio/explosive.mp3', 1.0);
    }

    playSnake() {
        this.playFile('assets/audio/snake.mp3', 1.0);
    }


    playBGM() {
        if (!this.bgm) {
            this.bgm = new Audio('assets/audio/bgm.m4a');
            this.bgm.loop = true;
            this.bgm.volume = 0.2; // Low volume as requested
        }
        this.bgm.play().catch(e => console.log('BGM Play failed', e));
    }

    stopBGM() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }
    }

    updateRunSound(isRunning) {
        if (!this.runAudio) {
            this.runAudio = new Audio('assets/audio/running.mp3');
            this.runAudio.loop = true;
            this.runAudio.volume = 0.3; // Reduced volume
        }

        if (isRunning) {
            if (this.runAudio.paused) {
                this.runAudio.play().catch(e => { });
            }
        } else {
            if (!this.runAudio.paused) {
                this.runAudio.pause();
                this.runAudio.currentTime = 0;
            }
        }
    }
}

const sfx = new SoundManager();
